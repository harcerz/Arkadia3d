// Orkiestracja świata 3D: ładowanie krain, pozycjonowanie gracza
// (hash GMCP -> lokacja; fallback: podążanie za wysłanym kierunkiem),
// automarsz po tapnięciu odległej lokacji, przełączanie widoków.
import { CONFIG } from '../config.js';
import { MapIndex } from './mapIndex.js';
import { AreaModel } from './areaModel.js';
import { SceneManager } from './scene.js';
import { DioramaView } from './dioramaView.js';
import { RoomView } from './roomView.js';
import { applyDaylight } from './daylight.js';
import { commandFor, LONG_TO_CODE } from './moveMapper.js';

export class WorldController {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {EventBus} bus
   * @param {object} settings
   * @param {HTMLElement} joystickEl
   * @param {HTMLElement} locationEl - pasek z nazwą lokacji/krainy
   */
  constructor(canvas, bus, settings, joystickEl, locationEl) {
    this.bus = bus;
    this.settings = settings;
    this.locationEl = locationEl;

    this.mapIndex = new MapIndex();
    this.ready = this.mapIndex.load().catch((err) => {
      console.error('[world] nie udało się wczytać mapy:', err);
      this.mapFailed = true;
    });

    this.sm = new SceneManager(canvas);
    this.send = (cmd) => bus.emit('user.command', { text: cmd, fromUi: true });
    this.diorama = new DioramaView(this.sm, this.mapIndex, (room) => this.#onRoomTap(room));
    this.roomView = new RoomView(
      this.sm, this.mapIndex, this.send,
      (desc) => bus.emit('ui.fillInput', `zerknij na ${desc}`),
      joystickEl,
    );

    this.area = null;          // AreaModel
    this.currentRoom = null;
    this.lastInfo = null;      // ostatni gmcp.room.info
    this.lastSentDirection = null;
    this.walkQueue = [];
    this.walkTimer = null;

    bus.on('game.room', (e) => this.#onRoom(e));
    bus.on('game.time', (t) => applyDaylight(this.sm, t));
    bus.on('game.objects', ({ data, nums }) => {
      this.diorama.updateObjectMarkers(Math.max((nums?.length ?? 1) - 1, 0));
      const list = Object.values(data ?? {})
        .filter((o) => o && typeof o.desc === 'string')
        .map((o) => ({ desc: o.desc }));
      this.roomView.setObjects(list);
    });
    bus.on('ui.view', (view) => this.#onViewChange(view));
    bus.on('user.command', ({ text }) => this.#trackDirection(text));
    bus.on('net.status', ({ state }) => {
      if (state === 'closed' || state === 'error') this.#stopWalk();
    });
  }

  #onViewChange(view) {
    this.diorama.setActive(view === 'diorama');
    this.roomView.setActive(view === 'scene');
    this.sm.setPaused(view === 'console');
  }

  async #onRoom({ info, hash }) {
    await this.ready;
    this.lastInfo = info;

    if (this.mapFailed) {
      this.roomView.setRoom(info, null);
      return;
    }

    const areaName = info?.map?.name;
    const entry = this.mapIndex.areaByName(areaName);
    if (!entry) {
      this.#setOffMap(areaName ? `Kraina spoza mapy: ${areaName}` : 'Lokacja poza mapą', info);
      return;
    }

    if (!this.area || this.area.id !== entry.id) {
      try {
        const data = await this.mapIndex.loadArea(entry);
        this.area = new AreaModel(data);
        this.diorama.setArea(this.area);
      } catch (err) {
        console.error('[world] błąd ładowania krainy:', err);
        this.#setOffMap('Nie udało się wczytać mapy krainy', info);
        return;
      }
    }

    let room = hash ? this.area.byHash.get(hash) : null;

    // Fallback: lokacja bez hasha — podążaj za ostatnio wysłanym kierunkiem.
    if (!room && this.currentRoom && this.lastSentDirection) {
      const target = this.currentRoom.ex?.[this.lastSentDirection];
      if (target !== undefined) room = this.area.byId.get(target) ?? null;
    }
    this.lastSentDirection = null;

    // Scena pomieszczenia działa zawsze — wyjścia ma z GMCP, env z mapy.
    this.roomView.setRoom(info, room);

    if (!room) {
      this.#setOffMap(`${entry.name} — lokacja poza mapą`, info, /*keepScene*/ true);
      return;
    }

    const moved = this.currentRoom?.i !== room.i;
    this.currentRoom = room;
    this.locationEl.textContent = entry.name;
    this.locationEl.classList.remove('off-map');
    this.diorama.setCurrentRoom(room, moved);
    this.#continueWalk(room);
  }

  #setOffMap(text, info, keepScene = false) {
    this.locationEl.textContent = text;
    this.locationEl.classList.add('off-map');
    this.#stopWalk();
    if (!keepScene) this.roomView.setRoom(info, null);
  }

  // Tap w dioramie: sąsiad = pojedynczy krok; dalsza lokacja = automarsz BFS.
  #onRoomTap(room) {
    if (!this.currentRoom || !this.area) return;
    if (room.i === this.currentRoom.i) {
      this.send('spojrz');
      return;
    }
    const direct = this.area.adjacency(this.currentRoom, room);
    if (direct) {
      this.#stopWalk();
      this.send(commandFor(direct));
      return;
    }
    const path = this.area.findPath(this.currentRoom.i, room.i, CONFIG.world.maxAutoWalkSteps);
    if (!path) {
      this.bus.emit('ui.toast', 'Brak znanej trasy do tej lokacji.');
      return;
    }
    this.walkQueue = path;
    this.#stepWalk();
  }

  #stepWalk() {
    if (!this.walkQueue.length) return;
    const code = this.walkQueue.shift();
    this.send(commandFor(code));
  }

  // Po potwierdzeniu lokacji przez serwer wysyłamy kolejny krok trasy.
  #continueWalk() {
    if (!this.walkQueue.length) return;
    clearTimeout(this.walkTimer);
    this.walkTimer = setTimeout(() => this.#stepWalk(), CONFIG.world.autoWalkDelayMs);
  }

  #stopWalk() {
    this.walkQueue = [];
    clearTimeout(this.walkTimer);
    this.walkTimer = null;
  }

  // Komenda wpisana ręcznie w konsoli też może być ruchem — śledzimy ją,
  // by pozycjonować gracza w lokacjach bez hasha GMCP.
  #trackDirection(text) {
    const code = LONG_TO_CODE[text?.trim().toLowerCase()];
    if (code) this.lastSentDirection = code;
  }
}
