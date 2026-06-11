// Jedyne źródło prawdy o kierunkach: kody, polskie komendy, offsety siatki.
export const DIR_TO_CMD = {
  n: 'polnoc', s: 'poludnie', e: 'wschod', w: 'zachod',
  ne: 'polnocny-wschod', nw: 'polnocny-zachod',
  se: 'poludniowy-wschod', sw: 'poludniowy-zachod',
  u: 'gora', d: 'dol',
};

export const LONG_TO_CODE = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  up: 'u', down: 'd',
  // gdyby GMCP przysłało polskie nazwy wyjść
  polnoc: 'n', poludnie: 's', wschod: 'e', zachod: 'w',
  'polnocny-wschod': 'ne', 'polnocny-zachod': 'nw',
  'poludniowy-wschod': 'se', 'poludniowy-zachod': 'sw',
  gora: 'u', dol: 'd',
};

// Offsety w siatce Mudleta (x rośnie na wschód, y rośnie na północ).
export const DIR_OFFSETS = {
  n: [0, 1, 0], s: [0, -1, 0], e: [1, 0, 0], w: [-1, 0, 0],
  ne: [1, 1, 0], nw: [-1, 1, 0], se: [1, -1, 0], sw: [-1, -1, 0],
  u: [0, 0, 1], d: [0, 0, -1],
};

/** Komenda ruchu dla kodu kierunku ('n'...'d') lub wyjścia specjalnego. */
export function commandFor(codeOrSpecial) {
  return DIR_TO_CMD[codeOrSpecial] ?? codeOrSpecial;
}

/** Kod kierunku z wektora poziomego (np. z joysticka), uwzględnia 8 kierunków. */
export function codeFromVector(dx, dy) {
  const angle = Math.atan2(dy, dx); // dy: północ dodatnia
  const oct = Math.round(angle / (Math.PI / 4)) & 7;
  return ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'][oct];
}
