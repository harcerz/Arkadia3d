// Jedyne źródło prawdy o stanie gry. Konsumuje sparsowane pakiety GMCP
// i emituje typowane zdarzenia dla HUD i świata 3D.
import { decodeGmcpMsgText } from './codec.js';

export class GameState {
  /**
   * @param {EventBus} bus
   * @param {LineAssembler} assembler - odbiorca tekstu z gmcp_msgs
   */
  constructor(bus, assembler) {
    this.bus = bus;
    this.assembler = assembler;
    this.reset();
  }

  reset() {
    this.room = null;       // ostatni room.info
    this.roomHash = null;   // "x:y:z:Kraina" wg współrzędnych GMCP
    this.charState = {};    // scalany char.state
    this.objects = {};      // id -> dane obiektu na lokacji
    this.objectNums = [];   // kolejność/numery obiektów
    this.time = null;
  }

  /** @param {{path: string, payload: any}} packet */
  handle({ path, payload }) {
    switch (path) {
      case 'room.info': {
        this.room = payload ?? {};
        const m = this.room.map;
        this.roomHash = m && m.name !== undefined && m.x !== undefined
          ? `${m.x}:${m.y}:${m.z ?? 0}:${m.name}`
          : null;
        this.bus.emit('game.room', { info: this.room, hash: this.roomHash });
        break;
      }
      case 'char.state':
        Object.assign(this.charState, payload ?? {});
        this.bus.emit('game.char', { state: this.charState, changed: payload });
        break;
      case 'objects.data':
        this.objects = payload ?? {};
        this.bus.emit('game.objects', { data: this.objects, nums: this.objectNums });
        break;
      case 'objects.nums':
        this.objectNums = Array.isArray(payload) ? payload : [];
        this.bus.emit('game.objects', { data: this.objects, nums: this.objectNums });
        break;
      case 'room.time':
        this.time = payload;
        this.bus.emit('game.time', payload);
        break;
      case 'gmcp_msgs': {
        const text = decodeGmcpMsgText(payload?.text);
        const type = payload?.type ?? 'msg';
        this.bus.emit('game.msg', { type, text });
        this.assembler.feedTyped(type, text);
        break;
      }
      case 'core.ping':
        break; // odpowiedź na keepalive — nic do roboty
      default:
        this.bus.emit('game.gmcp.other', { path, payload });
    }
  }
}
