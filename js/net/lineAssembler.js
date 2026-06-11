// Składanie strumienia tekstu w linie konsoli.
// Dwa źródła: surowy tekst telnetowy (UTF-8 bajty, mogą być dzielone między
// ramkami) oraz typowane komunikaty gmcp_msgs (już zdekodowane stringi).
// Ogony niedokończonych linii czekają na \n, granicę prompta (IAC GA/EOR)
// albo timer bezczynności.
import { byteStringToBytes } from './transport.js';
import { CONFIG } from '../config.js';

export class LineAssembler {
  /** @param {(lines: {text:string, cls:string}[]) => void} emit */
  constructor(emit) {
    this.emit = emit;
    this.reset();
  }

  reset() {
    this.decoder = new TextDecoder('utf-8', { fatal: false });
    this.tails = new Map(); // źródło/typ -> niedokończony ogon linii
    this.#clearTimer();
  }

  /** Surowe bajty tekstu z parsera telnet (bajt-string latin1 = bajty UTF-8). */
  feedRaw(byteString, { prompt = false } = {}) {
    const text = this.decoder.decode(byteStringToBytes(byteString), { stream: true });
    this.#feed('raw', text, prompt);
  }

  /** Zdekodowany tekst z gmcp_msgs, per typ komunikatu. */
  feedTyped(type, text) {
    this.#feed(type ?? 'msg', text, false);
  }

  /** Wymusza opróżnienie wszystkich ogonów (np. przy zamknięciu połączenia). */
  flushAll() {
    const out = [];
    for (const [key, tail] of this.tails) {
      if (tail) out.push({ text: tail, cls: clsFor(key) });
    }
    this.tails.clear();
    this.#clearTimer();
    if (out.length) this.emit(out);
  }

  #feed(key, text, prompt) {
    if (!text && !prompt) return;
    let buffer = (this.tails.get(key) ?? '') + (text ?? '');
    const out = [];
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      out.push({ text: buffer.slice(0, nl), cls: clsFor(key) });
      buffer = buffer.slice(nl + 1);
    }
    if (prompt && buffer) { // granica prompta — wypchnij niedokończoną linię
      out.push({ text: buffer, cls: 'prompt' });
      buffer = '';
    }
    this.tails.set(key, buffer);
    if (out.length) this.emit(out);
    this.#armTimer();
  }

  #armTimer() {
    this.#clearTimer();
    if (![...this.tails.values()].some(Boolean)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushAll();
    }, CONFIG.console.idleFlushMs);
  }

  #clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function clsFor(key) {
  if (key === 'raw') return 'game';
  if (key.startsWith('combat')) return 'combat';
  if (key.startsWith('system')) return 'system';
  return 'game';
}
