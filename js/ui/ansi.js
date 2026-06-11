// Parser sekwencji ANSI SGR -> elementy DOM. Stan stylu (kolory, bold)
// przenosi się między liniami, jak w prawdziwym terminalu.

const PALETTE16 = [
  '#1e1e24', '#cd4444', '#3fb950', '#d29922',
  '#4f83cc', '#b56dd4', '#39b3a6', '#c9d1d9',
  '#6e7681', '#ff6b6b', '#56d364', '#e3c64f',
  '#79b8ff', '#d2a8ff', '#56d4c8', '#ffffff',
];

function color256(n) {
  if (n < 16) return PALETTE16[n];
  if (n < 232) {
    const v = n - 16;
    const scale = [0, 95, 135, 175, 215, 255];
    return rgb(scale[Math.floor(v / 36)], scale[Math.floor(v / 6) % 6], scale[v % 6]);
  }
  const g = 8 + (n - 232) * 10;
  return rgb(g, g, g);
}

const rgb = (r, g, b) => `rgb(${r},${g},${b})`;

export class AnsiRenderer {
  constructor() {
    this.resetStyle();
  }

  resetStyle() {
    this.style = { fg: null, bg: null, bold: false, italic: false, underline: false, inverse: false };
  }

  /** Zamienia tekst z kodami ANSI na DocumentFragment ze spanami. */
  render(text) {
    const frag = document.createDocumentFragment();
    // CSI ... litera koncowa; interesuje nas tylko 'm' (SGR)
    const re = /\x1b\[([0-9;]*)([A-Za-z])|\x1b[^[]?/g;
    let last = 0, match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) this.#append(frag, text.slice(last, match.index));
      if (match[2] === 'm') this.#applySgr(match[1]);
      last = re.lastIndex;
    }
    if (last < text.length) this.#append(frag, text.slice(last));
    return frag;
  }

  #append(frag, chunk) {
    if (!chunk) return;
    const s = this.style;
    const plain = !s.fg && !s.bg && !s.bold && !s.italic && !s.underline && !s.inverse;
    if (plain) {
      frag.appendChild(document.createTextNode(chunk));
      return;
    }
    const span = document.createElement('span');
    let fg = s.fg, bg = s.bg;
    if (s.inverse) [fg, bg] = [bg ?? '#c9d1d9', fg ?? '#15151a'];
    if (fg) span.style.color = fg;
    if (bg) span.style.backgroundColor = bg;
    if (s.bold) span.style.fontWeight = '700';
    if (s.italic) span.style.fontStyle = 'italic';
    if (s.underline) span.style.textDecoration = 'underline';
    span.textContent = chunk;
    frag.appendChild(span);
  }

  #applySgr(params) {
    const p = params.split(';').map((x) => (x === '' ? 0 : parseInt(x, 10)));
    for (let i = 0; i < p.length; i++) {
      const n = p[i];
      if (n === 0) this.resetStyle();
      else if (n === 1) this.style.bold = true;
      else if (n === 3) this.style.italic = true;
      else if (n === 4) this.style.underline = true;
      else if (n === 7) this.style.inverse = true;
      else if (n === 22) this.style.bold = false;
      else if (n === 23) this.style.italic = false;
      else if (n === 24) this.style.underline = false;
      else if (n === 27) this.style.inverse = false;
      else if (n >= 30 && n <= 37) this.style.fg = PALETTE16[n - 30 + (this.style.bold ? 8 : 0)];
      else if (n === 39) this.style.fg = null;
      else if (n >= 40 && n <= 47) this.style.bg = PALETTE16[n - 40];
      else if (n === 49) this.style.bg = null;
      else if (n >= 90 && n <= 97) this.style.fg = PALETTE16[n - 90 + 8];
      else if (n >= 100 && n <= 107) this.style.bg = PALETTE16[n - 100 + 8];
      else if (n === 38 || n === 48) {
        const target = n === 38 ? 'fg' : 'bg';
        if (p[i + 1] === 5) {
          this.style[target] = color256(p[i + 2] ?? 0);
          i += 2;
        } else if (p[i + 1] === 2) {
          this.style[target] = rgb(p[i + 2] ?? 0, p[i + 3] ?? 0, p[i + 4] ?? 0);
          i += 4;
        }
      }
    }
  }
}

/** Usuwa kody ANSI (np. do analizy treści linii). */
export function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b[^[]?/g, '');
}
