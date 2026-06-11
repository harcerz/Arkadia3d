// Widok pierwszoosobowy: proceduralne wnętrze bieżącej lokacji i sąsiadów
// (świat Arkadii to graf lokacji — geometria jest umowna). Ruch wyłącznie
// komendami MUD-a: tap w portal wyjścia albo wirtualny joystick.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toScene } from './dioramaView.js';
import { codeFromVector, commandFor } from './moveMapper.js';

const { levelHeight } = CONFIG.world;
const ROOM_SIZE = 0.92;       // pokoje stykają się przy siatce co 1
const WALL_H = 1.1;
const EYE = 0.62;

export class FirstPersonView {
  /**
   * @param {SceneManager} sceneManager
   * @param {MapIndex} mapIndex
   * @param {(cmd: string) => void} sendCommand
   * @param {HTMLElement} joystickEl
   */
  constructor(sceneManager, mapIndex, sendCommand, joystickEl) {
    this.sm = sceneManager;
    this.mapIndex = mapIndex;
    this.sendCommand = sendCommand;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.sm.scene.add(this.group);

    this.area = null;
    this.room = null;
    this.portals = [];          // {mesh, code}
    this.yaw = 0;               // 0 = patrzymy na północ (-Z)
    this.pitch = 0;

    this.raycaster = new THREE.Raycaster();
    this.joystick = new Joystick(joystickEl, (code) => {
      if (this.active && code) this.sendCommand(commandFor(code));
    });
    this.#bindLook();
  }

  get active() {
    return this.group.visible;
  }

  setActive(active) {
    this.group.visible = active;
    this.joystick.setVisible(active);
    if (active) {
      this.#applyCamera();
      this.sm.invalidate();
    }
  }

  /** Przebudowuje wnętrza wokół bieżącej lokacji. */
  setCurrentRoom(room, area) {
    this.area = area;
    this.room = room;
    this.#rebuild();
    const eye = toScene(room).add(new THREE.Vector3(0, EYE, 0));
    if (this.active) {
      const cam = this.sm.camera;
      const from = cam.position.clone();
      let t = 0;
      this.sm.animate((dt) => {
        t = Math.min(t + dt * 3.2, 1);
        cam.position.lerpVectors(from, eye, 1 - (1 - t) ** 3);
        this.#applyRotation();
        return t < 1;
      });
    } else {
      this.sm.camera.position.copy(eye);
    }
  }

  #applyCamera() {
    if (this.room) {
      this.sm.camera.position.copy(toScene(this.room).add(new THREE.Vector3(0, EYE, 0)));
    }
    this.#applyRotation();
  }

  #applyRotation() {
    this.sm.camera.rotation.set(0, 0, 0);
    this.sm.camera.rotateY(this.yaw);
    this.sm.camera.rotateX(this.pitch);
    this.sm.invalidate();
  }

  #rebuild() {
    this.#dispose();
    if (!this.area || !this.room) return;

    // BFS do głębokości 2 — pokazujemy najbliższą okolicę
    const seen = new Map([[this.room.i, 0]]);
    let frontier = [this.room];
    for (let depth = 1; depth <= 2; depth++) {
      const next = [];
      for (const room of frontier) {
        for (const { target, special } of this.area.exitsOf(room)) {
          if (special || seen.has(target)) continue;
          const t = this.area.byId.get(target);
          if (!t) continue;
          seen.set(target, depth);
          next.push(t);
        }
      }
      frontier = next;
    }

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x43474f });
    const floorGeo = new THREE.BoxGeometry(ROOM_SIZE, 0.08, ROOM_SIZE);
    const color = new THREE.Color();

    for (const id of seen.keys()) {
      const room = this.area.byId.get(id);
      const center = toScene(room);

      const floor = new THREE.Mesh(floorGeo, floorMat.clone());
      floor.material.color.copy(color.setHex(this.mapIndex.envColor(room.e)).multiplyScalar(0.55));
      floor.position.copy(center);
      this.group.add(floor);

      this.#walls(room, center, wallMat);
      if (id === this.room.i) this.#portals(room, center);
    }

    // sufitowe "niebo" pomijamy — daylight steruje tłem sceny
    this.sm.invalidate();
  }

  // Ściany tam, gdzie nie ma wyjścia (tylko 4 główne kierunki dla czytelności).
  #walls(room, center, wallMat) {
    const ex = room.ex ?? {};
    const sides = [
      { code: 'n', dx: 0, dz: -1, rot: 0 },
      { code: 's', dx: 0, dz: 1, rot: 0 },
      { code: 'e', dx: 1, dz: 0, rot: Math.PI / 2 },
      { code: 'w', dx: -1, dz: 0, rot: Math.PI / 2 },
    ];
    const geo = new THREE.BoxGeometry(ROOM_SIZE, WALL_H, 0.06);
    for (const { code, dx, dz, rot } of sides) {
      if (ex[code] !== undefined) continue;
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(center.x + dx * (ROOM_SIZE / 2), center.y + WALL_H / 2, center.z + dz * (ROOM_SIZE / 2));
      wall.rotation.y = rot;
      this.group.add(wall);
    }
  }

  // Świecące portale wyjść w bieżącej lokacji (tap = ruch).
  #portals(room, center) {
    const dirs = {
      n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
      ne: [0.7, -0.7], nw: [-0.7, -0.7], se: [0.7, 0.7], sw: [-0.7, 0.7],
    };
    const geo = new THREE.PlaneGeometry(0.4, 0.8);
    for (const { code, special } of this.area.exitsOf(room)) {
      let mesh;
      if (code === 'u' || code === 'd') {
        mesh = new THREE.Mesh(
          new THREE.CircleGeometry(0.3, 20),
          portalMat(code === 'u' ? 0x9b86d8 : 0x6a8ad8),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(center).add(new THREE.Vector3(0.25, code === 'u' ? WALL_H : 0.1, 0.25));
      } else {
        const [dx, dz] = dirs[code] ?? [0, -1];
        mesh = new THREE.Mesh(geo, portalMat(special ? 0xd8b46a : 0x65d6ff));
        mesh.position.set(
          center.x + dx * (ROOM_SIZE / 2 - 0.04),
          center.y + 0.5,
          center.z + dz * (ROOM_SIZE / 2 - 0.04),
        );
        mesh.lookAt(center.x, center.y + 0.5, center.z);
      }
      mesh.userData.exitCode = code;
      this.portals.push(mesh);
      this.group.add(mesh);
    }
  }

  #bindLook() {
    let drag = null;
    const canvas = this.sm.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || !drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.005;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy * 0.005));
      this.#applyRotation();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active || !drag) return;
      const wasTap = drag.moved < 10;
      drag = null;
      if (!wasTap) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.sm.camera);
      const hit = this.raycaster.intersectObjects(this.portals)[0];
      if (hit) this.sendCommand(commandFor(hit.object.userData.exitCode));
    });
  }

  #dispose() {
    for (const obj of [...this.group.children]) {
      obj.geometry?.dispose();
      obj.material?.dispose();
      this.group.remove(obj);
    }
    this.portals = [];
  }
}

function portalMat(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  });
}

// Wirtualny joystick: wychylenie wybiera 1 z 8 kierunków świata
// (niezależnie od obrotu kamery — kierunki MUD-a są absolutne).
class Joystick {
  constructor(el, onDirection) {
    this.el = el;
    this.onDirection = onDirection;
    this.knob = el.querySelector('.joystick-knob');
    this.active = null;
    this.repeatTimer = null;

    el.addEventListener('pointerdown', (e) => this.#start(e));
    el.addEventListener('pointermove', (e) => this.#move(e));
    el.addEventListener('pointerup', () => this.#end());
    el.addEventListener('pointercancel', () => this.#end());
  }

  setVisible(visible) {
    this.el.hidden = !visible;
  }

  #start(e) {
    this.el.setPointerCapture(e.pointerId);
    this.active = { code: null };
    this.#move(e);
    this.repeatTimer = setInterval(() => {
      if (this.active?.code) this.onDirection(this.active.code);
    }, 700);
  }

  #move(e) {
    if (!this.active) return;
    const rect = this.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    const max = rect.width / 2 - 14;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (len > rect.width / 5) {
      const code = codeFromVector(dx, -dy); // ekranowe dy w dół = południe
      if (code !== this.active.code) {
        this.active.code = code;
        this.onDirection(code);
      }
    } else {
      this.active.code = null;
    }
  }

  #end() {
    this.active = null;
    if (this.repeatTimer) clearInterval(this.repeatTimer);
    this.repeatTimer = null;
    this.knob.style.transform = '';
  }
}
