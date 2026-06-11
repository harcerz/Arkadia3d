// Parser komend wpisywanych w konsoli:
//  - sekwencje rozdzielane ';'           zerknij; polnoc; zabij szczura
//  - powtórzenia '#N komenda'            #3 polnoc
//  - skróty kierunków (n, pn, pd-wsch…)  n -> polnoc, pdw -> poludniowy-wschod
//  - aliasy użytkownika (ustawienia)     /alias zs=zabij szczura
//  - komendy klienta zaczynające się od '/'
const MAX_EXPANSION = 50; // bezpiecznik na pętle aliasów / wielkie powtórzenia

// wbudowane skróty kierunków (angielskie i polskie)
const DIR_ALIASES = {
  n: 'polnoc', s: 'poludnie', e: 'wschod', w: 'zachod',
  ne: 'polnocny-wschod', nw: 'polnocny-zachod',
  se: 'poludniowy-wschod', sw: 'poludniowy-zachod',
  u: 'gora', d: 'dol',
  pn: 'polnoc', pd: 'poludnie', ws: 'wschod', zach: 'zachod',
  pnw: 'polnocny-wschod', pnz: 'polnocny-zachod',
  pdw: 'poludniowy-wschod', pdz: 'poludniowy-zachod',
};

export class CommandParser {
  /**
   * @param {object} settings - settings.aliases: {nazwa: rozwinięcie}
   * @param {object} client - { send(cmd), print(text), connect(), disconnect() }
   */
  constructor(settings, client) {
    this.settings = settings;
    this.client = client;
    if (!settings.aliases) settings.aliases = {};
  }

  /**
   * Przetwarza wpisaną linię. Zwraca listę komend wysłanych do gry
   * (komendy klienta '/...' obsługiwane lokalnie, zwracają []).
   */
  parse(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/')) {
      this.#clientCommand(trimmed.slice(1));
      return [];
    }
    const out = [];
    this.#expand(trimmed, out, 0);
    return out.slice(0, MAX_EXPANSION);
  }

  #expand(text, out, depth) {
    if (depth > 5 || out.length >= MAX_EXPANSION) return;
    for (const part of text.split(';')) {
      const cmd = part.trim();
      if (!cmd) continue;

      // powtórzenie: #3 komenda
      const rep = cmd.match(/^#(\d{1,2})\s+(.+)$/);
      if (rep) {
        const times = Math.min(Number(rep[1]), MAX_EXPANSION);
        for (let i = 0; i < times && out.length < MAX_EXPANSION; i++) {
          this.#expand(rep[2], out, depth + 1);
        }
        continue;
      }

      // alias użytkownika (tylko pierwsze słowo; reszta doklejana)
      const [head, ...rest] = cmd.split(/\s+/);
      const alias = this.settings.aliases[head];
      if (alias) {
        const expansion = rest.length ? `${alias} ${rest.join(' ')}` : alias;
        this.#expand(expansion, out, depth + 1);
        continue;
      }

      // skróty kierunków
      if (DIR_ALIASES[head] && rest.length === 0) {
        out.push(DIR_ALIASES[head]);
        continue;
      }

      out.push(cmd);
    }
  }

  #clientCommand(body) {
    const [name, ...rest] = body.split(/\s+/);
    const arg = rest.join(' ');
    switch (name.toLowerCase()) {
      case 'pomoc':
        this.client.print([
          'Komendy klienta:',
          '  /alias nazwa=rozwinięcie   — dodaj alias (np. /alias zs=zabij szczura)',
          '  /alias nazwa=              — usuń alias',
          '  /aliasy                    — lista aliasów',
          '  /polacz, /rozlacz          — połączenie z grą',
          '  /pomoc                     — ta pomoc',
          'Składnia: komendy po ";", powtórzenia "#3 polnoc",',
          `skróty kierunków: ${Object.keys(DIR_ALIASES).join(', ')}.`,
        ].join('\n'));
        break;
      case 'alias': {
        const m = arg.match(/^(\S+)\s*=\s*(.*)$/);
        if (!m) {
          this.client.print('Użycie: /alias nazwa=rozwinięcie (puste rozwinięcie usuwa).');
          break;
        }
        const aliases = { ...this.settings.aliases };
        if (m[2]) {
          aliases[m[1]] = m[2];
          this.client.print(`Alias: ${m[1]} -> ${m[2]}`);
        } else {
          delete aliases[m[1]];
          this.client.print(`Usunięto alias: ${m[1]}`);
        }
        this.settings.aliases = aliases;
        break;
      }
      case 'aliasy': {
        const entries = Object.entries(this.settings.aliases);
        this.client.print(entries.length
          ? entries.map(([k, v]) => `  ${k} -> ${v}`).join('\n')
          : 'Brak aliasów. Dodaj: /alias nazwa=rozwinięcie');
        break;
      }
      case 'polacz':
        this.client.connect();
        break;
      case 'rozlacz':
        this.client.disconnect();
        break;
      default:
        this.client.print(`Nieznana komenda klienta: /${name}. Spróbuj /pomoc.`);
    }
  }
}

// eksport do testów
export { DIR_ALIASES };
