// Ustawienia trwałe (localStorage), z domyślnymi wartościami.
const KEY = 'arkadia3d.settings';

const DEFAULTS = {
  transportMode: 'auto',      // 'auto' | 'direct' | 'proxy'
  lastWorkingMode: null,      // zapamiętany działający tryb przy 'auto'
  view: 'scene',              // 'scene' (pomieszczenie) | 'diorama' (mapa)
  consoleExpanded: false,
  quickButtons: ['spojrz', 'wyjscia', 'zerknij', 'ekwipunek', 'przygotuj sie do walki'],
  commandHistory: [],
  showNpcDots: true,
};

function load() {
  try {
    const stored = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    if (stored.view === 'fpp' || stored.view === 'diorama') stored.view = DEFAULTS.view;
    return stored;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = new Proxy(load(), {
  set(target, prop, value) {
    target[prop] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(target));
    } catch { /* tryb prywatny / brak miejsca */ }
    return true;
  },
});
