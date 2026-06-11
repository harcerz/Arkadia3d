// Widok sceny: wizualizacja BIEŻĄCEJ lokacji jako trójwymiarowego
// pomieszczenia/placu z figurkami postaci ("zobacz to, co opisuje tekst").
//  - podłoże i rekwizyty dobierane wg środowiska lokacji (kolor z mapy),
//  - wyjścia jako bramy z podpisami (tap = ruch), schody dla góra/dół,
//  - NPC/gracze z gmcp.objects jako ludziki z podpisami (tap = zerknij),
//  - działa też poza mapą — wyjścia bierze wprost z GMCP.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LONG_TO_CODE, DIR_TO_CMD, commandFor, codeFromVector } from './moveMapper.js';

const ROOM_R = 7;          // promień placu
const WALL_H = 1.6;

const DIR_ANGLES = { // kąt na okręgu (0 = północ, zgodnie z ruchem wskazówek)
  n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315,
};
const DIR_LABELS = {
  n: 'północ', ne: 'płn-wsch', e: 'wschód', se: 'płd-wsch',
  s: 'południe', sw: 'płd-zach', w: 'zachód', nw: 'płn-zach',
  u: 'góra', d: 'dół',
};

export class RoomView {
  /**
   * @param {SceneManager} sceneManager
   * @param {MapIndex} mapIndex
   * @param {(cmd: string) => void} sendCommand
   * @param {(desc: string) => void} onFigureTap - np. wstawienie "zerknij na …"
   * @param {HTMLElement} joystickEl
   */
  constructor(sceneManager, mapIndex, sendCommand, onFigureTap, joystickEl) {
    this.sm = sceneManager;
    this.mapIndex = mapIndex;
    this.sendCommand = sendCommand;
    this.onFigureTap = onFigureTap;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.sm.scene.add(this.group);

    this.staticGroup = new THREE.Group();   // podłoże, mury, bramy, rekwizyty
    this.figureGroup = new THREE.Group();   // ludziki
    this.group.add(this.staticGroup, this.figureGroup);

    this.tappables = [];   // {object, kind:'exit'|'figure', code|desc}
    this.figures = [];     // do animacji idle
    this.exits = [];
    this.envColor = 0x4a5a4a;
    this.idleClock = 0;

    this.controls = new OrbitControls(this.sm.camera, this.sm.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.target.set(0, 0.8, 0);
    this.controls.enabled = false;
    this.controls.addEventListener('change', () => this.sm.invalidate());

    this.raycaster = new THREE.Raycaster();
    this.#bindTap();
    this.joystick = new Joystick(joystickEl, (code) => {
      if (this.active) this.sendCommand(commandFor(code));
    });

    // delikatna animacja postaci, tylko gdy widok aktywny
    this.sm.animate((dt) => {
      if (!this.active || !this.figures.length) return true;
      this.idleClock += dt;
      for (const f of this.figures) {
        f.group.position.y = f.baseY + Math.sin(this.idleClock * 2 + f.phase) * 0.03;
        f.group.rotation.y = f.baseRot + Math.sin(this.idleClock * 0.7 + f.phase) * 0.06;
      }
      return true; // animacja stała
    });
  }

  get active() {
    return this.group.visible;
  }

  setActive(active) {
    this.group.visible = active;
    this.controls.enabled = active;
    this.joystick.setVisible(active);
    if (active) this.resetCamera();
  }

  /** Kadr zależny od proporcji ekranu (pion = dalej i wyżej). */
  resetCamera() {
    const aspect = this.sm.camera.aspect || 1;
    const zoomOut = aspect < 1 ? 1 / Math.sqrt(aspect) : 1;
    this.sm.camera.position.set(0, 7 * zoomOut, 10.5 * zoomOut);
    this.controls.target.set(0, 0.8, 0);
    this.controls.update();
    this.sm.invalidate();
  }

  /**
   * Przebudowuje scenę lokacji.
   * @param {object} info - gmcp.room.info (źródło wyjść)
   * @param {object|null} mappedRoom - lokacja z mapy (env, id) lub null poza mapą
   */
  setRoom(info, mappedRoom) {
    this.exits = exitCodesFrom(info, mappedRoom);
    this.envColor = mappedRoom ? this.mapIndex.envColor(mappedRoom.e) : 0x4a5a4a;
    this.seed = mappedRoom?.i ?? hashCode(JSON.stringify(info?.map ?? {}));
    this.#rebuildStatic();
    this.sm.invalidate();
  }

  /** @param {{desc: string, isPlayer?: boolean}[]} list - obecni na lokacji */
  setObjects(list) {
    this.#disposeGroup(this.figureGroup);
    this.figures = [];
    this.tappables = this.tappables.filter((t) => t.kind !== 'figure');

    // gracz zawsze na scenie, lekko z przodu
    const player = makeFigure({ color: 0x65d6ff, hair: 0x2c3e50 });
    player.position.set(0, 0, 1.6);
    player.rotation.y = Math.PI; // tyłem do kamery, patrzy w głąb
    this.figureGroup.add(player);
    this.figures.push({ group: player, baseY: 0, baseRot: Math.PI, phase: 0 });

    const others = (list ?? []).slice(0, 10);
    const arc = Math.min(others.length * 28, 150);
    others.forEach((obj, i) => {
      const angle = THREE.MathUtils.degToRad(
        -arc / 2 + (others.length === 1 ? arc / 2 : (arc / Math.max(others.length - 1, 1)) * i),
      );
      const r = 3.1;
      const fig = isCreature(obj.desc)
        ? makeCreature({ color: colorFromText(obj.desc) })
        : makeFigure({ color: colorFromText(obj.desc), hair: colorFromText(obj.desc + 'h') });
      fig.position.set(Math.sin(angle) * r, 0, -Math.cos(angle) * r);
      fig.rotation.y = angle + Math.PI; // twarzą do gracza
      this.figureGroup.add(fig);
      this.figures.push({
        group: fig, baseY: 0, baseRot: angle + Math.PI, phase: i + 1,
      });

      const label = makeTextSprite(obj.desc, [255, 230, 180]);
      label.position.set(fig.position.x, 2.05, fig.position.z);
      this.figureGroup.add(label);
      this.tappables.push({ object: fig, kind: 'figure', desc: obj.desc });
    });
    this.sm.invalidate();
  }

  // --- budowa sceny statycznej ---

  #rebuildStatic() {
    this.#disposeGroup(this.staticGroup);
    this.tappables = this.tappables.filter((t) => t.kind !== 'exit');
    const rng = mulberry32(this.seed);
    const env = classifyEnv(this.envColor);
    const base = new THREE.Color(this.envColor);

    // podłoże: duży dysk "okolicy" + właściwy plac
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ROOM_R * 3.2, 40),
      new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.45) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.staticGroup.add(ground);

    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(ROOM_R, ROOM_R, 0.1, 36),
      new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.8) }),
    );
    plaza.position.y = -0.02;
    this.staticGroup.add(plaza);

    // pierścień ścian z przerwami na wyjścia
    const horiz = this.exits.filter((c) => DIR_ANGLES[c.code] !== undefined);
    const gapAngles = horiz.map((e) => DIR_ANGLES[e.code]);
    this.#buildWalls(gapAngles, env, rng);

    for (const exit of horiz) this.#buildGate(exit, env);
    for (const exit of this.exits.filter((e) => e.code === 'u' || e.code === 'd')) {
      this.#buildStairs(exit);
    }
    // wyjścia specjalne (np. "wyjscie", "brama") — drzwi przy południu placu
    const specials = this.exits.filter((e) => e.special);
    specials.forEach((exit, i) => this.#buildSpecialDoor(exit, i, specials.length));

    this.#buildProps(env, rng);
  }

  #buildWalls(gapAngles, env, rng) {
    const wallMat = new THREE.MeshLambertMaterial({
      color: env === 'nature' ? 0x2e4632 : env === 'water' ? 0x3a5a6a : 0x55504a,
    });
    const isGap = (deg) => gapAngles.some((g) => {
      const d = Math.abs(((deg - g + 540) % 360) - 180);
      return d < 24;
    });
    for (let deg = 0; deg < 360; deg += 12) {
      if (isGap(deg)) continue;
      const a = THREE.MathUtils.degToRad(deg);
      const h = WALL_H * (env === 'nature' ? 0.8 + rng() * 0.9 : 1);
      const seg = new THREE.Mesh(
        env === 'nature'
          ? new THREE.SphereGeometry(0.95, 7, 6) // żywopłot / zarośla
          : new THREE.BoxGeometry(1.7, h, 0.5),
        wallMat,
      );
      seg.position.set(Math.sin(a) * ROOM_R, env === 'nature' ? 0.4 : h / 2, -Math.cos(a) * ROOM_R);
      seg.rotation.y = -a;
      this.staticGroup.add(seg);
    }
  }

  #buildGate(exit, env) {
    const a = THREE.MathUtils.degToRad(DIR_ANGLES[exit.code]);
    const x = Math.sin(a) * ROOM_R;
    const z = -Math.cos(a) * ROOM_R;

    const gate = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: env === 'nature' ? 0x6b4a2f : 0x6a655e });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.1, 0.28), mat);
      post.position.set(side * 0.95, 1.05, 0);
      gate.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.3), mat);
    lintel.position.y = 2.1;
    gate.add(lintel);

    // świetlista "droga" zapraszająca do wyjścia
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x65d6ff, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.06, -0.4);
    gate.add(path);

    gate.position.set(x, 0, z);
    gate.rotation.y = -a;
    this.staticGroup.add(gate);

    const label = makeTextSprite(DIR_LABELS[exit.code] ?? exit.code, [120, 220, 255]);
    label.position.set(x * 0.99, 2.6, z * 0.99);
    this.staticGroup.add(label);
    this.tappables.push({ object: gate, kind: 'exit', code: exit.code });
  }

  #buildStairs(exit) {
    const up = exit.code === 'u';
    const stairs = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x7a756d });
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.45), mat);
      step.position.set(0, up ? 0.1 + i * 0.22 : -0.1 - i * 0.16, -i * 0.42);
      stairs.add(step);
    }
    stairs.position.set(up ? 4.6 : -4.6, 0, -3.4);
    this.staticGroup.add(stairs);
    const label = makeTextSprite(up ? 'góra' : 'dół', [200, 180, 255]);
    label.position.set(stairs.position.x, 1.7, stairs.position.z);
    this.staticGroup.add(label);
    this.tappables.push({ object: stairs, kind: 'exit', code: exit.code });
  }

  #buildSpecialDoor(exit, i, total) {
    const door = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.2, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x5d4630 }),
    );
    frame.position.y = 1.1;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.9, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x8a6a3f }),
    );
    panel.position.set(0, 1.0, 0.12);
    door.add(frame, panel);
    const off = (i - (total - 1) / 2) * 2.4;
    door.position.set(off, 0, ROOM_R * 0.86);
    door.rotation.y = Math.PI;
    this.staticGroup.add(door);
    const label = makeTextSprite(exit.code, [255, 200, 120]);
    label.position.set(off, 2.7, ROOM_R * 0.86);
    this.staticGroup.add(label);
    this.tappables.push({ object: door, kind: 'exit', code: exit.code });
  }

  #buildProps(env, rng) {
    const place = (mesh, rMin = 3.6, rMax = ROOM_R - 1) => {
      const a = rng() * Math.PI * 2;
      const r = rMin + rng() * (rMax - rMin);
      mesh.position.set(Math.sin(a) * r, mesh.position.y, -Math.cos(a) * r);
      this.staticGroup.add(mesh);
    };
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      if (env === 'nature') {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6),
          new THREE.MeshLambertMaterial({ color: 0x5d4630 }),
        );
        trunk.position.y = 0.55;
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(0.8 + rng() * 0.5, 1.6 + rng(), 8),
          new THREE.MeshLambertMaterial({ color: 0x2e5d38 }),
        );
        crown.position.y = 1.9;
        tree.add(trunk, crown);
        place(tree);
      } else if (env === 'water') {
        const reed = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.9 + rng() * 0.5, 5),
          new THREE.MeshLambertMaterial({ color: 0x4a6b3a }),
        );
        reed.position.y = 0.45;
        place(reed);
      } else if (env === 'urban') {
        if (rng() > 0.5) {
          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            new THREE.MeshLambertMaterial({ color: 0x8a6a3f }),
          );
          crate.position.y = 0.35;
          crate.rotation.y = rng();
          place(crate);
        } else {
          const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.36, 0.8, 10),
            new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
          );
          barrel.position.y = 0.4;
          place(barrel);
        }
      } else { // cave / inne
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.35 + rng() * 0.4),
          new THREE.MeshLambertMaterial({ color: 0x5a5650 }),
        );
        rock.position.y = 0.25;
        place(rock);
      }
    }
    // latarnia w miastach
    if (env === 'urban') {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6),
        new THREE.MeshLambertMaterial({ color: 0x333333 }),
      );
      pole.position.y = 1.3;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      );
      head.position.y = 2.6;
      lamp.add(pole, head);
      lamp.position.set(-2.6, 0, -2.2);
      this.staticGroup.add(lamp);
    }
  }

  // --- interakcja ---

  #bindTap() {
    let downAt = null;
    const canvas = this.sm.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active || !downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      const dt = performance.now() - downAt.t;
      downAt = null;
      if (moved > 8 || dt > 500) return;

      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.sm.camera);
      for (const t of this.tappables) {
        if (this.raycaster.intersectObject(t.object, true).length) {
          if (t.kind === 'exit') this.sendCommand(commandFor(t.code));
          else this.onFigureTap(t.desc);
          return;
        }
      }
    });
  }

  #disposeGroup(group) {
    group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
    group.clear();
  }
}

// --- pomocnicze ---

/** Wyjścia z gmcp.room.info (klucze ang./pol.) + specjalne z mapy. */
export function exitCodesFrom(info, mappedRoom) {
  const out = [];
  const seen = new Set();
  for (const key of Object.keys(info?.exits ?? {})) {
    const code = LONG_TO_CODE[key.toLowerCase()] ?? null;
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push({ code });
    } else if (!code && !seen.has(key)) {
      seen.add(key);
      out.push({ code: key, special: true });
    }
  }
  // uzupełnij z mapy, jeśli GMCP nie podał wyjść
  if (!out.length && mappedRoom) {
    for (const code of Object.keys(mappedRoom.ex ?? {})) out.push({ code });
    for (const cmd of Object.keys(mappedRoom.sp ?? {})) out.push({ code: cmd, special: true });
  }
  return out;
}

function classifyEnv(hex) {
  const c = new THREE.Color(hex);
  const { h, s, l } = c.getHSL({});
  if (l < 0.16) return 'cave';
  if (s < 0.18) return 'urban';
  if (h > 0.5 && h < 0.72) return 'water';
  if (h > 0.2 && h <= 0.5) return 'nature';
  return 'urban';
}

function isCreature(desc = '') {
  return /szczur|pies|kot|wilk|ko[nń]|krowa|[sś]winia|kura|g[eę][sś]|owca|koza|nied[zź]wied[zź]|dzik|paj[aą]k|w[aą][zż]/i
    .test(desc);
}

/** Blokowy ludzik (nogi, tułów, ręce, głowa). */
export function makeFigure({ color = 0x888888, hair = 0x3a2a1a } = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9b08c });
  const cloth = new THREE.MeshLambertMaterial({ color });
  const hairM = new THREE.MeshLambertMaterial({ color: hair });

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), cloth);
    leg.position.set(side * 0.14, 0.31, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), cloth);
  torso.position.y = 0.95;
  g.add(torso);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.2), cloth);
    arm.position.set(side * 0.38, 0.97, 0);
    arm.rotation.z = side * 0.08;
    g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.5;
  g.add(head);
  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.38), hairM);
  hairMesh.position.y = 1.71;
  g.add(hairMesh);
  return g;
}

/** Czworonożne stworzenie (szczur, pies…). */
export function makeCreature({ color = 0x777777 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.32), mat);
  body.position.y = 0.32;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.26), mat);
  head.position.set(0.45, 0.42, 0);
  g.add(head);
  for (const fx of [-0.22, 0.22]) {
    for (const fz of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), mat);
      leg.position.set(fx, 0.11, fz);
      g.add(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), mat);
  tail.position.set(-0.5, 0.36, 0);
  g.add(tail);
  return g;
}

export function makeTextSprite(text, rgb = [255, 255, 200]) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 30px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.min(Math.ceil(ctx.measureText(text).width) + 20, 600);
  canvas.width = w;
  canvas.height = 44;
  ctx.font = font;
  ctx.fillStyle = 'rgba(8,8,14,0.6)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 44, 10);
  ctx.fill();
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 10, 23);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(w / 44 * 0.62, 0.62, 1);
  return sprite;
}

function colorFromText(text) {
  const hues = [0.02, 0.08, 0.12, 0.3, 0.45, 0.55, 0.62, 0.75, 0.85, 0.95];
  const h = hues[Math.abs(hashCode(text)) % hues.length];
  return new THREE.Color().setHSL(h, 0.45, 0.42).getHex();
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wirtualny joystick (kierunki absolutne świata).
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
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const max = rect.width / 2 - 14;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (len > rect.width / 5) {
      const code = codeFromVector(dx, -dy);
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
