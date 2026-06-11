// Ustawienia trwałe (localStorage), z domyślnymi wartościami.
const KEY = 'arkadia3d.settings';

const DEFAULTS = {
  transportMode: 'auto',      // 'auto' | 'direct' | 'proxy'
  lastWorkingMode: null,      // zapamiętany działający tryb przy 'auto'
  view: 'diorama',            // 'diorama' | 'fpp'
  consoleExpanded: false,
  quickButtons: ['spojrz', 'wyjscia', 'zerknij', 'ekwipunek', 'przygotuj sie do walki'],
  commandHistory: [],
  showNpcDots: true,
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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
