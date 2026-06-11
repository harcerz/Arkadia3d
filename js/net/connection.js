// Cykl życia połączenia WebSocket z automatycznym fallbackiem
// natywny endpoint -> proxy oraz keepalive GMCP.
import { CONFIG } from '../config.js';
import { base64Codec, binaryCodec, utf8ToByteString } from './transport.js';
import { encodeGmcp } from '../gmcp/codec.js';
import { MockSocket } from './mockTransport.js';

export class Connection {
  /**
   * @param {EventBus} bus - emituje: net.status, net.bytes
   * @param {object} settings
   */
  constructor(bus, settings) {
    this.bus = bus;
    this.settings = settings;
    this.socket = null;
    this.mode = null;          // 'direct' | 'proxy' | 'mock'
    this.codec = base64Codec;
    this.receivedAnything = false;
    this.pingTimer = null;
    this.manualClose = false;

    // automatyczne wznawianie po zerwaniu (np. telefon ubił socket w tle)
    this.wantConnected = false; // czy użytkownik chce być połączony
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;

    // powrót do aplikacji / odzyskanie sieci -> natychmiastowa próba wznowienia
    const wake = () => {
      if (this.wantConnected && !this.connected && !this.reconnectTimer) {
        this.reconnectAttempts = 0;
        this.#reconnectNow();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', wake);
      window.addEventListener('focus', wake);
    }
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** @param {'auto'|'direct'|'proxy'|'mock'} mode */
  connect(mode = 'auto', mockName = 'login') {
    this.disconnect(true);
    this.manualClose = false;
    this.lastUserMode = mode;
    this.wantConnected = mode !== 'mock';
    this.reconnectAttempts = 0;
    this.#clearReconnect();

    if (mode === 'mock') return this.#dial('mock', mockName);
    if (mode === 'auto') {
      const preferred = this.settings.lastWorkingMode ?? 'direct';
      return this.#dial(preferred, null, /*allowFallback*/ true);
    }
    return this.#dial(mode);
  }

  disconnect(silent = false) {
    if (!silent) {
      this.wantConnected = false;
      this.#clearReconnect();
    }
    this.manualClose = true;
    this.#stopPing();
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      try { s.close(); } catch { /* już zamknięte */ }
    }
    if (!silent) this.#status('closed');
  }

  /** Wysyła komendę gracza (string UTF-8). */
  send(command) {
    if (!this.connected) return false;
    this.socket.send(this.codec.encode(utf8ToByteString(command) + '\r\n'));
    return true;
  }

  /** Wysyła surowe bajty (negocjacja telnet). */
  sendRaw(byteString) {
    if (this.connected) this.socket.send(this.codec.encode(byteString));
  }

  /** Wysyła pakiet GMCP. */
  sendGmcp(path, payload) {
    this.sendRaw(encodeGmcp(path, payload));
  }

  startPing() {
    this.#stopPing();
    this.pingTimer = setInterval(() => {
      if (this.connected) this.sendGmcp('core.ping');
    }, CONFIG.gmcp.pingIntervalMs);
  }

  #dial(mode, mockName, allowFallback = false) {
    this.mode = mode;
    this.receivedAnything = false;
    this.codec = mode === 'direct' ? base64Codec : binaryCodec;
    this.#status('connecting', mode);

    let socket;
    if (mode === 'mock') {
      this.codec = base64Codec;
      socket = new MockSocket(mockName);
    } else {
      const url = CONFIG.endpoints[mode];
      try {
        socket = new WebSocket(url);
      } catch (err) {
        return this.#failed(mode, allowFallback, String(err));
      }
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectAttempts = 0;
      this.#status('open', mode);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.receivedAnything = true;
      this.bus.emit('net.bytes', this.codec.decode(event.data));
    };
    socket.onerror = () => { /* szczegóły i tak są w onclose */ };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.#stopPing();
      // Odrzucenie połączenia zanim cokolwiek przyszło — próbujemy proxy.
      if (!this.receivedAnything && !this.manualClose && allowFallback && mode === 'direct') {
        this.#status('fallback', 'proxy');
        this.#dial('proxy');
        return;
      }
      if (this.receivedAnything && !this.manualClose) {
        this.settings.lastWorkingMode = mode === 'mock' ? null : mode;
      }
      // Zerwane mimo woli -> wznawiaj zamiast pokazywać ekran połączenia.
      const willReconnect = !this.manualClose && this.wantConnected && mode !== 'mock';
      if (willReconnect) this.#scheduleReconnect();
      else this.#status('closed', mode);
    };
  }

  #failed(mode, allowFallback, detail) {
    if (allowFallback && mode === 'direct') return this.#dial('proxy');
    if (this.wantConnected) return this.#scheduleReconnect();
    this.#status('error', mode, detail);
  }

  #scheduleReconnect() {
    this.#clearReconnect();
    this.reconnectAttempts++;
    if (this.reconnectAttempts > 8) {
      // serwer naprawdę niedostępny — oddaj sterowanie użytkownikowi
      this.#status('closed', this.mode);
      return;
    }
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 15000);
    this.#status('reconnecting', this.mode, `${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.#reconnectNow();
    }, delay);
  }

  #reconnectNow() {
    if (!this.wantConnected || this.connected) return;
    this.manualClose = false;
    const preferred = this.settings.lastWorkingMode ?? this.lastUserMode ?? 'direct';
    if (preferred === 'auto') {
      this.#dial(this.settings.lastWorkingMode ?? 'direct', null, true);
    } else {
      this.#dial(preferred, null, /*allowFallback*/ preferred === 'direct');
    }
  }

  #clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  #status(state, mode = this.mode, detail = '') {
    this.bus.emit('net.status', { state, mode, detail });
  }

  #stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
