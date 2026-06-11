// Konsola gry: scrollback z limitem, lepki autoscroll, tryb pełnoekranowy.
import { AnsiRenderer } from './ansi.js';
import { CONFIG } from '../config.js';

export class GameConsole {
  /** @param {HTMLElement} root - kontener .console */
  constructor(root, bus) {
    this.root = root;
    this.bus = bus;
    this.ansi = new AnsiRenderer();
    this.viewport = root.querySelector('.console-lines');
    this.lineCount = 0;

    this.viewport.addEventListener('scroll', () => {
      this.stick = this.#nearBottom();
    });
    this.stick = true;
  }

  /** @param {{text:string, cls:string}[]} lines */
  appendLines(lines) {
    const frag = document.createDocumentFragment();
    for (const { text, cls } of lines) {
      const div = document.createElement('div');
      div.className = `line ${cls}`;
      div.appendChild(this.ansi.render(text));
      if (!div.textContent) div.appendChild(document.createTextNode(' '));
      frag.appendChild(div);
      this.lineCount++;
    }
    this.viewport.appendChild(frag);
    this.#trim();
    if (this.stick) this.scrollToBottom();
  }

  /** Lokalne echo komendy gracza. */
  echoCommand(text) {
    const div = document.createElement('div');
    div.className = 'line echo';
    div.textContent = `> ${text}`;
    this.viewport.appendChild(div);
    this.lineCount++;
    this.#trim();
    this.scrollToBottom();
  }

  systemMessage(text) {
    this.appendLines([{ text, cls: 'client' }]);
  }

  scrollToBottom() {
    this.viewport.scrollTop = this.viewport.scrollHeight;
    this.stick = true;
  }

  #nearBottom() {
    const v = this.viewport;
    return v.scrollHeight - v.scrollTop - v.clientHeight < 40;
  }

  #trim() {
    const over = this.lineCount - CONFIG.console.maxLines;
    for (let i = 0; i < over; i++) {
      this.viewport.firstChild?.remove();
      this.lineCount--;
    }
  }
}
