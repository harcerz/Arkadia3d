// Paski stanu postaci z gmcp.char.state. Znane klucze dostają nazwane paski,
// nieznane lądują w rozwijanym panelu "Stan" (do utwardzenia po testach na żywo).
import { STATE_BARS } from '../config.js';

export class StatusBars {
  /** @param {HTMLElement} root - kontener .status-bars */
  constructor(root, bus) {
    this.root = root;
    this.bars = new Map();
    bus.on('game.char', ({ state }) => this.update(state));
  }

  update(state) {
    for (const [key, rawValue] of Object.entries(state)) {
      const value = Number(rawValue);
      if (Number.isNaN(value) || value < 0) continue; // -1 = stan niezainicjowany
      const def = STATE_BARS[key];
      let bar = this.bars.get(key);
      if (!bar) {
        bar = this.#createBar(key, def);
        this.bars.set(key, bar);
      }
      const max = def?.max ?? Math.max(value, 1);
      const frac = Math.min(value / max, 1);
      bar.fill.style.width = `${Math.round(frac * 100)}%`;
      bar.fill.style.backgroundColor = barColor(def, frac);
      bar.value.textContent = `${value}/${max}`;
      bar.el.title = `${def?.label ?? key}: ${value}/${max}`;
    }
  }

  #createBar(key, def) {
    const el = document.createElement('div');
    el.className = 'status-bar';
    el.innerHTML = `
      <span class="status-label"></span>
      <span class="status-track"><span class="status-fill"></span></span>
      <span class="status-value"></span>`;
    el.querySelector('.status-label').textContent = def?.label ?? key;
    if (!def) el.classList.add('status-unknown');
    this.root.appendChild(el);
    return {
      el,
      fill: el.querySelector('.status-fill'),
      value: el.querySelector('.status-value'),
    };
  }
}

function barColor(def, frac) {
  // good=1: wysoka wartość = zielony; good=-1: wysoka wartość = czerwony
  const goodness = def?.good === -1 ? 1 - frac : frac;
  if (goodness > 0.66) return '#3fb950';
  if (goodness > 0.33) return '#d29922';
  return '#cd4444';
}
