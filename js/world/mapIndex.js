// Indeks map: lista krain, paleta środowisk, NPC; leniwe ładowanie krain.
export class MapIndex {
  constructor(baseUrl = 'data/') {
    this.baseUrl = baseUrl;
    this.index = null;
    this.palette = null;
    this.npcsByRoom = null;
    this.areaCache = new Map();
    this.byName = new Map();
  }

  async load() {
    const [index, palette, npcs] = await Promise.all([
      fetchJson(`${this.baseUrl}index.json`),
      fetchJson(`${this.baseUrl}colors.json`),
      fetchJson(`${this.baseUrl}npcs.json`).catch(() => ({})),
    ]);
    this.index = index;
    this.palette = palette;
    this.npcsByRoom = npcs;
    for (const area of index.areas) {
      this.byName.set(normalizeName(area.name), area);
    }
    return this;
  }

  /** Wpis indeksu krainy po nazwie z GMCP (map.name), odporny na diakrytyki. */
  areaByName(name) {
    if (!name) return null;
    return this.byName.get(normalizeName(name)) ?? null;
  }

  /** Surowe dane krainy (lokacje + etykiety), cache w pamięci. */
  async loadArea(areaEntry) {
    if (this.areaCache.has(areaEntry.id)) return this.areaCache.get(areaEntry.id);
    const data = await fetchJson(this.baseUrl + areaEntry.file);
    this.areaCache.set(areaEntry.id, data);
    return data;
  }

  envColor(envId) {
    const rgb = this.palette?.[envId];
    return rgb ? (rgb[0] << 16) + (rgb[1] << 8) + rgb[2] : 0x55585f;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ł', 'l')
    .trim();
}
