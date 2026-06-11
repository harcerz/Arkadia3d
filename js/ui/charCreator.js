// Kreator postaci: prowadzi przez tworzenie nowej postaci w Arkadii
// (imię + odmiana przez przypadki, płeć, hasło). Odpowiedzi są przygotowane
// z góry; kreator rozpoznaje pytania serwera po słowach kluczowych
// i wysyła je automatycznie. Każdą odpowiedź można też wysłać ręcznie
// (chipy) — frazowanie pytań na serwerze może się różnić.
import { stripAnsi } from './ansi.js';
import { normalizeName } from '../world/mapIndex.js';

const CASES = [
  { key: 'd', label: 'Dopełniacz (kogo? czego?)', match: /dopelniacz|kogo\?\s*czego/ },
  { key: 'c', label: 'Celownik (komu? czemu?)', match: /celownik|komu\?\s*czemu/ },
  { key: 'b', label: 'Biernik (kogo? co?)', match: /biernik|kogo\?\s*co/ },
  { key: 'n', label: 'Narzędnik (z kim? z czym?)', match: /narzednik|kim\?\s*czym/ },
  { key: 'msc', label: 'Miejscownik (o kim? o czym?)', match: /miejscownik|o kim|o czym/ },
  { key: 'w', label: 'Wołacz (hej...!)', match: /wolacz/ },
];

/**
 * Heurystyczna odmiana imienia fantasy przez przypadki (do edycji przez
 * gracza — to tylko podpowiedź).
 */
export function declineName(name, gender) {
  const n = name.trim();
  if (gender === 'kobieta' || /a$/i.test(n)) {
    const stem = n.replace(/a$/i, '');
    const soft = /[kg]$/i.test(stem);
    const cel = /k$/i.test(stem) ? stem.replace(/k$/i, 'ce')
      : /g$/i.test(stem) ? stem.replace(/g$/i, 'dze')
      : /i$/i.test(stem) ? `${stem}i`
      : `${stem}ie`;
    return {
      d: stem + (soft ? 'i' : 'y'),
      c: cel,
      b: `${stem}e`,
      n: `${stem}a`,
      msc: cel,
      w: `${stem}o`,
    };
  }
  // imiona męskie zakończone spółgłoską
  const msc = /r$/i.test(n) ? `${n.slice(0, -1)}rze`
    : /[kgh]$/i.test(n) || /(ch|sz|cz|rz|j|l)$/i.test(n) ? `${n}u`
    : /t$/i.test(n) ? `${n.slice(0, -1)}cie`
    : /d$/i.test(n) ? `${n.slice(0, -1)}dzie`
    : `${n}ie`;
  return {
    d: `${n}a`,
    c: `${n}owi`,
    b: `${n}a`,
    n: /[kg]$/i.test(n) ? `${n}iem` : `${n}em`,
    msc,
    w: msc,
  };
}

/** Prosty generator imion fantasy. */
export function generateName(gender) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const start = ['Bre', 'Gar', 'Tor', 'Ael', 'Mir', 'Kor', 'Vel', 'Dra', 'Fen', 'Na'];
  const mid = ['n', 'ra', 'li', 'do', 'va', 'mi', 'go', 'ri', 'sa', ''];
  const endM = ['n', 'r', 'd', 'k', 'mir', 'gor', 'dan', 'ric'];
  const endF = ['na', 'ra', 'la', 'wia', 'sza', 'mira', 'lena'];
  const name = pick(start) + pick(mid) + (gender === 'kobieta' ? pick(endF) : pick(endM));
  return name[0].toUpperCase() + name.slice(1).toLowerCase();
}

export class CharacterCreator {
  /** @param {EventBus} bus @param {object} settings */
  constructor(bus, settings) {
    this.bus = bus;
    this.settings = settings;
    this.armed = false;
    this.stage = null;
    this.sentCases = new Set();
    this.el = this.#build();
    document.body.appendChild(this.el);

    bus.on('console.lines', (lines) => this.#onLines(lines));
    bus.on('telnet.echo', (hidden) => this.#onEcho(hidden));
    bus.on('net.status', ({ state }) => {
      if (state === 'closed' || state === 'error') this.#disarm();
    });
  }

  open() {
    this.el.hidden = false;
    this.#refreshDeclension();
  }

  close() {
    this.el.hidden = true;
  }

  // --- automatyczne odpowiadanie ---

  #onLines(lines) {
    if (!this.armed) return;
    for (const { text } of lines) {
      const q = normalizeName(stripAnsi(text)); // lowercase + bez diakrytyków
      if (!q) continue;
      this.#answer(q);
    }
  }

  #answer(q) {
    const v = this.#values();

    // pytanie o imię: pierwsze -> "nowa" już wysłane przy starcie,
    // kolejne ("podaj imie nowej postaci") -> imię
    if (/imie/.test(q) && /(podaj|wpisz|wybierz|jakie)/.test(q) && !this.sentCases.has('name')) {
      this.sentCases.add('name');
      this.#send(v.name, 'imię');
      return;
    }
    for (const c of CASES) {
      if (c.match.test(q) && !this.sentCases.has(c.key)) {
        this.sentCases.add(c.key);
        this.#send(v.cases[c.key], c.label.split(' ')[0].toLowerCase());
        return;
      }
    }
    if (/plec|kobieta.*mezczyzna|mezczyzna.*kobieta/.test(q) && !this.sentCases.has('gender')) {
      this.sentCases.add('gender');
      this.#send(v.gender, 'płeć');
    }
  }

  #onEcho(hidden) {
    if (!this.armed || !hidden) return;
    const pass = this.el.querySelector('.cc-pass').value;
    if (!pass || this.passSent >= 2) return; // hasło + ewentualne powtórzenie
    this.passSent++;
    this.bus.emit('user.command', { text: pass, hidden: true });
    this.#log(`wysłano hasło (${this.passSent}/2)`);
  }

  #send(text, what) {
    this.bus.emit('user.command', { text, fromUi: true });
    this.#log(`wysłano ${what}: ${text}`);
  }

  #log(msg) {
    const li = document.createElement('li');
    li.textContent = msg;
    this.el.querySelector('.cc-log').appendChild(li);
  }

  #disarm() {
    this.armed = false;
    this.stage = null;
  }

  // --- UI ---

  #values() {
    const $ = (sel) => this.el.querySelector(sel);
    const cases = {};
    for (const c of CASES) cases[c.key] = $(`.cc-case[data-case="${c.key}"]`).value.trim();
    return {
      name: $('.cc-name').value.trim(),
      gender: $('.cc-gender').value,
      cases,
    };
  }

  #refreshDeclension() {
    const { name, gender } = this.#values();
    if (!name) return;
    const dec = declineName(name, gender);
    for (const c of CASES) {
      const input = this.el.querySelector(`.cc-case[data-case="${c.key}"]`);
      if (!input.dataset.touched) input.value = dec[c.key];
    }
    this.#refreshChips();
  }

  #refreshChips() {
    const v = this.#values();
    const chips = this.el.querySelector('.cc-chips');
    chips.textContent = '';
    const all = [
      ['nowa', 'nowa'], ['imię', v.name], ['płeć', v.gender],
      ...CASES.map((c) => [c.label.split(' ')[0], v.cases[c.key]]),
    ];
    for (const [label, value] of all) {
      if (!value) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quick-btn';
      b.textContent = `${label}: ${value}`;
      b.title = 'Wyślij do gry';
      b.addEventListener('click', () => this.#send(value, label));
      chips.appendChild(b);
    }
  }

  #build() {
    const el = document.createElement('div');
    el.className = 'connect-overlay cc-overlay';
    el.hidden = true;
    el.innerHTML = `
      <div class="connect-card cc-card">
        <h2>Kreator postaci</h2>
        <p class="connect-sub">Przygotuj odpowiedzi — kreator rozpozna pytania gry
          i odpowie za Ciebie. Możesz też wysłać każdą odpowiedź ręcznie (chipy niżej).</p>
        <div class="cc-grid">
          <label>Imię <input class="cc-name" maxlength="14" placeholder="np. Brennor"></label>
          <button type="button" class="cc-generate" title="Wylosuj imię">🎲</button>
          <label>Płeć
            <select class="cc-gender">
              <option value="mezczyzna">mężczyzna</option>
              <option value="kobieta">kobieta</option>
            </select>
          </label>
        </div>
        <details class="cc-declension" open>
          <summary>Odmiana imienia (podpowiedziana — sprawdź!)</summary>
          <div class="cc-cases"></div>
        </details>
        <label class="cc-pass-row">Hasło nowej postaci
          <input class="cc-pass" type="password" autocomplete="new-password">
        </label>
        <div class="cc-chips"></div>
        <div class="cc-actions">
          <button type="button" class="cc-start connect-btn">Rozpocznij tworzenie</button>
          <button type="button" class="cc-close">Zamknij</button>
        </div>
        <ul class="cc-log"></ul>
      </div>`;

    const casesBox = el.querySelector('.cc-cases');
    for (const c of CASES) {
      const label = document.createElement('label');
      label.textContent = c.label + ' ';
      const input = document.createElement('input');
      input.className = 'cc-case';
      input.dataset.case = c.key;
      input.addEventListener('input', () => { input.dataset.touched = '1'; this.#refreshChips(); });
      label.appendChild(input);
      casesBox.appendChild(label);
    }

    el.querySelector('.cc-name').addEventListener('input', () => {
      for (const i of el.querySelectorAll('.cc-case')) delete i.dataset.touched;
      this.#refreshDeclension();
    });
    el.querySelector('.cc-gender').addEventListener('change', () => {
      for (const i of el.querySelectorAll('.cc-case')) delete i.dataset.touched;
      this.#refreshDeclension();
    });
    el.querySelector('.cc-generate').addEventListener('click', () => {
      el.querySelector('.cc-name').value = generateName(el.querySelector('.cc-gender').value);
      for (const i of el.querySelectorAll('.cc-case')) delete i.dataset.touched;
      this.#refreshDeclension();
    });
    el.querySelector('.cc-close').addEventListener('click', () => this.close());
    el.querySelector('.cc-start').addEventListener('click', () => {
      const { name } = this.#values();
      if (!name || name.length < 3) {
        this.#log('Podaj imię (min. 3 litery).');
        return;
      }
      this.armed = true;
      this.passSent = 0;
      this.sentCases.clear();
      this.el.querySelector('.cc-log').textContent = '';
      this.#send('nowa', 'start kreacji');
      this.el.classList.add('cc-armed');
    });
    return el;
  }
}
