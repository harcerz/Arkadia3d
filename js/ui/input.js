// Linia komend: historia, tryb hasła (telnet ECHO), klawiatura mobilna.
import { CONFIG } from '../config.js';

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
    this.input.type = hidden ? 'password' : 'text';
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
