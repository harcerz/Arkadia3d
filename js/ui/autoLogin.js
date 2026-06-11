// Automatyczne logowanie i ponowne logowanie po wznowieniu połączenia.
//
// Endpoint Arkadii NIE zawsze włącza telnetowy tryb hasła (ECHO), więc
// prompt hasła rozpoznajemy też po tekście. Dane logowania trzymamy w pamięci
// przez całą sesję (nawet bez „zapamiętaj"), żeby po zerwaniu i wznowieniu
// połączenia klient zalogował się sam — bez przepisywania e-maila i hasła.
import { stripAnsi } from './ansi.js';

const NAME_RE = /podaj.*(adres|e-?mail|imi[eę])|(login|e-?mail)\s*:/i;
const PASS_RE = /has[łl]o\s*:?|podaj.*has[łl]o|password\s*:/i;

export class AutoLogin {
  /** @param {EventBus} bus @param {object} settings */
  constructor(bus, settings) {
    this.bus = bus;
    this.settings = settings;
    // dane na całą sesję; pole pass z ustawień tylko gdy zapamiętane
    this.creds = { name: settings.loginName || null, pass: settings.loginPass || null };
    this.#resetFlags();

    bus.on('net.status', ({ state }) => {
      if (state === 'open') {
        this.#resetFlags();
        // zapasowo, gdyby tekst promptu był nietypowy — wyślij imię po chwili
        this.nameTimer = setTimeout(() => this.#sendName(), 900);
      } else if (state === 'closed' || state === 'reconnecting') {
        clearTimeout(this.nameTimer);
      }
    });

    // serwer z telnetowym trybem hasła
    bus.on('telnet.echo', (hidden) => {
      if (hidden) { this.bus.emit('ui.passwordMode', true); this.#sendPass(); }
    });

    // rozpoznawanie promptów po tekście (przed zalogowaniem)
    bus.on('console.lines', (lines) => {
      if (this.loggedIn) return;
      for (const { text } of lines) {
        const t = stripAnsi(text);
        if (NAME_RE.test(t)) this.#sendName();
        if (PASS_RE.test(t)) this.#onPassPrompt();
      }
    });

    // pierwszy room.info = jesteśmy w grze; przestań maskować i odpowiadać
    bus.on('game.room', () => {
      this.loggedIn = true;
      this.bus.emit('ui.passwordMode', false);
    });
  }

  /** Uzbraja logowanie; dane zostają w pamięci na całą sesję. */
  arm(name, pass, remember) {
    this.creds = { name: name?.trim() || null, pass: pass || null };
    this.settings.loginName = this.creds.name;          // imię/e-mail nie jest wrażliwe
    this.settings.loginPass = remember ? (pass || '') : '';
  }

  #resetFlags() {
    this.sentName = false;
    this.sentPass = false;
    this.loggedIn = false;
    clearTimeout(this.nameTimer);
  }

  #onPassPrompt() {
    this.bus.emit('ui.passwordMode', true); // maskuj pole i echo, gdyby gracz wpisywał ręcznie
    this.#sendPass();
  }

  #sendName() {
    if (!this.creds.name || this.sentName) return;
    this.sentName = true;
    this.bus.emit('user.command', { text: this.creds.name, fromUi: true });
  }

  #sendPass() {
    if (!this.creds.pass || this.sentPass) return;
    this.sentPass = true;
    this.bus.emit('user.command', { text: this.creds.pass, hidden: true });
  }
}
