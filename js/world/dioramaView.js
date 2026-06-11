// Widok "dioramy": izometryczna makieta krainy — kafelki lokacji
// (InstancedMesh), łączniki wyjść, etykiety, awatar gracza.
// Tapnięcie lokacji wyznacza trasę (BFS) i wysyła komendy ruchu.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from '../config.js';

const { levelHeight, tileSize, tileHeight } = CONFIG.world;

// Współrzędne Mudleta -> scena: X = x, Z = -y (północ w głąb ekranu), Y = z.
export function toScene(room) {
  return new THREE.Vector3(room.x, room.z * levelHeight, -room.y);
}

export class DioramaView {
  /**
   * @param {SceneManager} sceneManager
   * @param {MapIndex} mapIndex
   * @param {(room: object) => void} onRoomTap
   */
  constructor(sceneManager, mapIndex, onRoomTap) {
    this.sm = sceneManager;
    this.mapIndex = mapIndex;
    this.onRoomTap = onRoomTap;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.sm.scene.add(this.group);

    this.tiles = null;          // InstancedMesh
    this.tileRooms = [];        // instanceId -> room
    this.area = null;

    this.avatar = this.#buildAvatar();
    this.npcDots = new THREE.Group();
    this.objectMarkers = new THREE.Group();
    this.group.add(this.avatar, this.npcDots, this.objectMarkers);

    this.controls = new OrbitControls(this.sm.camera, this.sm.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 90;
    this.controls.enabled = false;
    this.controls.addEventListener('change', () => this.sm.invalidate());

    this.raycaster = new THREE.Raycaster();
    this.#bindTap();
  }

  setActive(active) {
    this.group.visible = active;
    this.controls.enabled = active;
    if (active) this.sm.invalidate();
  }

  get active() {
    return this.group.visible;
  }

  /** Buduje makietę krainy. @param {AreaModel} area */
  setArea(area) {
    this.#disposeArea();
    this.area = area;
    const rooms = area.rooms;

    const geo = new THREE.BoxGeometry(tileSize, tileHeight, tileSize);
    const mat = new THREE.MeshLambertMaterial();
    this.tiles = new THREE.InstancedMesh(geo, mat, rooms.length);
    this.tileRooms = rooms;

    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    rooms.forEach((room, i) => {
      m.setPosition(toScene(room));
      this.tiles.setMatrixAt(i, m);
      this.tiles.setColorAt(i, color.setHex(this.mapIndex.envColor(room.e)));
    });
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.group.add(this.tiles);

    this.group.add(this.#buildConnectors(area));
    this.group.add(this.#buildLabels(area));
    this.#buildNpcDots(area);
    this.sm.invalidate();
  }

  /** Przenosi awatar (i kamerę) na lokację; animowane przy ruchu. */
  setCurrentRoom(room, animate = true) {
    const target = toScene(room).add(new THREE.Vector3(0, tileHeight + 0.45, 0));
    if (!animate || !this.group.visible) {
      this.avatar.position.copy(target);
      this.#panCameraTo(target, false);
      this.sm.invalidate();
      return;
    }
    const from = this.avatar.position.clone();
    let t = 0;
    this.sm.animate((dt) => {
      t = Math.min(t + dt * 4, 1);
      this.avatar.position.lerpVectors(from, target, easeOut(t));
      return t < 1;
    });
    this.#panCameraTo(target, true);
  }

  updateObjectMarkers(count) {
    this.objectMarkers.clear();
    if (!count) {
      this.sm.invalidate();
      return;
    }
    const geo = new THREE.SphereGeometry(0.09, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc857 });
    const n = Math.min(count, 12);
    for (let i = 0; i < n; i++) {
      const dot = new THREE.Mesh(geo, mat);
      const a = (i / n) * Math.PI * 2;
      dot.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
      this.objectMarkers.add(dot);
    }
    this.objectMarkers.position.copy(this.avatar.position);
    this.sm.invalidate();
  }

  setNpcDotsVisible(visible) {
    this.npcDots.visible = visible;
    this.sm.invalidate();
  }

  #panCameraTo(target, animate) {
    const ctrl = this.controls;
    const offset = this.sm.camera.position.clone().sub(ctrl.target);
    if (!animate) {
      ctrl.target.copy(target);
      this.sm.camera.position.copy(target.clone().add(offset));
      ctrl.update();
      return;
    }
    const fromT = ctrl.target.clone();
    let t = 0;
    this.sm.animate((dt) => {
      t = Math.min(t + dt * 3, 1);
      ctrl.target.lerpVectors(fromT, target, easeOut(t));
      this.sm.camera.position.copy(ctrl.target.clone().add(offset));
      ctrl.update();
      return t < 1;
    });
  }

  #bindTap() {
    let downAt = null;
    this.sm.canvas.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.sm.canvas.addEventListener('pointerup', (e) => {
      if (!this.group.visible || !this.tiles || !downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      const dt = performance.now() - downAt.t;
      downAt = null;
      if (moved > 8 || dt > 500) return; // to był obrót kamery, nie tap

      const rect = this.sm.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.sm.camera);
      const hit = this.raycaster.intersectObject(this.tiles)[0];
      if (hit && hit.instanceId !== undefined) {
        this.onRoomTap(this.tileRooms[hit.instanceId]);
      }
    });
  }

  #buildAvatar() {
    const group = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.7, 12),
      new THREE.MeshLambertMaterial({ color: 0x65d6ff, emissive: 0x1c4a66 }),
    );
    cone.position.y = 0.35;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.52, 24),
      new THREE.MeshBasicMaterial({ color: 0x65d6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.3;
    group.add(cone, ring);
    return group;
  }

  #buildConnectors(area) {
    const positions = [];
    const upDown = [];
    for (const room of area.rooms) {
      const a = toScene(room);
      for (const [code, targetId] of Object.entries(room.ex ?? {})) {
        if (code === 'u' || code === 'd') {
          upDown.push({ room, code });
          continue;
        }
        const target = area.byId.get(targetId);
        if (!target || targetId < room.i) continue; // każda para raz
        const b = toScene(target);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      for (const targetId of Object.values(room.sp ?? {})) {
        const target = area.byId.get(targetId);
        if (!target) continue;
        const b = toScene(target);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const group = new THREE.Group();
    group.name = 'connectors';
    if (positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      group.add(new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: 0x3c4048, transparent: true, opacity: 0.85 }),
      ));
    }
    if (upDown.length) {
      const geoUp = new THREE.ConeGeometry(0.12, 0.3, 8);
      const matUp = new THREE.MeshBasicMaterial({ color: 0x9b86d8 });
      const inst = new THREE.InstancedMesh(geoUp, matUp, upDown.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      upDown.forEach(({ room, code }, i) => {
        const p = toScene(room).add(new THREE.Vector3(0.3, code === 'u' ? 0.35 : 0.2, 0.3));
        m.compose(p, code === 'u' ? q : flip, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(i, m);
      });
      group.add(inst);
    }
    return group;
  }

  #buildLabels(area) {
    const group = new THREE.Group();
    group.name = 'labels';
    for (const label of area.labels.slice(0, 60)) {
      const sprite = makeTextSprite(label.t, label.c);
      sprite.position.set(label.x, label.z * levelHeight + 1.2, -label.y);
      group.add(sprite);
    }
    return group;
  }

  #buildNpcDots(area) {
    this.npcDots.clear();
    const byRoom = this.mapIndex.npcsByRoom ?? {};
    const inArea = area.rooms.filter((r) => byRoom[r.i]?.length);
    if (!inArea.length) return;
    const geo = new THREE.SphereGeometry(0.1, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd86a6a });
    const inst = new THREE.InstancedMesh(geo, mat, inArea.length);
    const m = new THREE.Matrix4();
    inArea.forEach((room, i) => {
      m.setPosition(toScene(room).add(new THREE.Vector3(-0.28, tileHeight + 0.1, -0.28)));
      inst.setMatrixAt(i, m);
    });
    this.npcDots.add(inst);
  }

  #disposeArea() {
    for (const name of ['connectors', 'labels']) {
      const obj = this.group.getObjectByName(name);
      if (obj) {
        obj.traverse((o) => {
          o.geometry?.dispose();
          o.material?.map?.dispose();
          o.material?.dispose();
        });
        this.group.remove(obj);
      }
    }
    if (this.tiles) {
      this.tiles.geometry.dispose();
      this.tiles.material.dispose();
      this.group.remove(this.tiles);
      this.tiles = null;
    }
    this.npcDots.clear();
    this.objectMarkers.clear();
  }
}

function makeTextSprite(text, rgb = [255, 255, 80]) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '28px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.min(Math.ceil(ctx.measureText(text).width) + 16, 512);
  canvas.width = w;
  canvas.height = 40;
  ctx.font = font;
  ctx.fillStyle = 'rgba(10,10,16,0.55)';
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 21);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(w / 40, 1, 1);
  return sprite;
}

const easeOut = (t) => 1 - (1 - t) ** 3;
