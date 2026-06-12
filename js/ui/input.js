// Linia komend: historia, tryb hasła (maskowanie), klawiatura mobilna.
import { CONFIG } from '../config.js';

// type="password" na mobile bywa przechwytywany przez menedżera haseł /
// klawiaturę ekranową (Enter nie wysyła komendy). Dlatego maskujemy SAM
// WYGLĄD znaków przez CSS, zostawiając <input type="text"> — wtedy Enter
// działa tak samo jak w zwykłym polu. type="password" tylko awaryjnie.
const SUPPORTS_TEXT_SECURITY = typeof CSS !== 'undefined' && CSS.supports
  && (CSS.supports('-webkit-text-security', 'disc') || CSS.supports('text-security', 'disc'));

export class CommandInput {
  /**
   * @param {HTMLInputElement} input
   * @param {EventBus} bus - emituje 'user.command' {text, hidden}
   * @param {object} settings
   */
  constructor(input, bus, settings) {
    this.input = input;
    this.bus = bus;
    this.settings = settings;
    this.history = [...(settings.commandHistory ?? [])];
    this.historyPos = -1;
    this.hidden = false;

    input.addEventListener('keydown', (e) => this.#onKey(e));
    bus.on('telnet.echo', (h) => this.setHidden(h));
    // tryb hasła wykryty po tekście promptu (endpoint bez telnetowego ECHO)
    bus.on('ui.passwordMode', (h) => this.setHidden(h));

    // iOS/Android: klawiatura ekranowa zmienia visualViewport — dosuwamy layout.
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const adjust = () => {
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--kbd-inset', `${inset}px`);
      };
      vv.addEventListener('resize', adjust);
      vv.addEventListener('scroll', adjust);
    }
  }

  setHidden(hidden) {
    this.hidden = hidden;
    if (SUPPORTS_TEXT_SECURITY) {
      this.input.type = 'text';
      this.input.classList.toggle('masked', hidden);
    } else {
      this.input.type = hidden ? 'password' : 'text';
    }
    this.input.setAttribute('autocomplete', 'off');
    this.input.placeholder = hidden ? 'hasło…' : 'wpisz komendę…';
  }

  focus() {
    this.input.focus({ preventScroll: true });
  }

  submit(text) {
    this.bus.emit('user.command', { text, hidden: this.hidden });
    if (!this.hidden && text) {
      if (this.history[this.history.length - 1] !== text) {
        this.history.push(text);
        if (this.history.length > CONFIG.console.historySize) this.history.shift();
        this.settings.commandHistory = this.history;
      }
    }
    this.historyPos = -1;
    this.input.value = '';
  }

  #onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submit(this.input.value);
    } else if (e.key === 'ArrowUp' && !this.hidden) {
      e.preventDefault();
      this.#recall(1);
    } else if (e.key === 'ArrowDown' && !this.hidden) {
      e.preventDefault();
      this.#recall(-1);
    }
  }

  // dir: 1 = ArrowUp (starsze), -1 = ArrowDown (nowsze)
  #recall(dir) {
    if (!this.history.length) return;
    if (this.historyPos === -1) {
      if (dir === -1) return;
      this.historyPos = this.history.length - 1;
    } else {
      this.historyPos -= dir;
      if (this.historyPos < 0) this.historyPos = 0;
      if (this.historyPos >= this.history.length) {
        this.historyPos = -1;
        this.input.value = '';
        return;
      }
    }
    this.input.value = this.history[this.historyPos];
  }
}
