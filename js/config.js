// Konfiguracja klienta Arkadia 3D
export const CONFIG = {
  version: '0.1.0',
  endpoints: {
    // Natywny endpoint gry: strumień telnet zakodowany base64 w ramkach tekstowych.
    direct: 'wss://arkadia.rpg.pl/wss',
    // Publiczny mostek telnet->WebSocket (ramki binarne).
    proxy: 'wss://arkadia-proxy.delwing.workers.dev?host=arkadia.rpg.pl&port=23',
  },
  gmcp: {
    supports: ['Objects 1', 'Gmcp_msgs 1', 'Mail 1'],
    options: ['base64_gmcp_msgs'],
    pingIntervalMs: 25000,
  },
  console: {
    maxLines: 2000,
    idleFlushMs: 300,
    historySize: 50,
  },
  world: {
    levelHeight: 2.4,   // odstęp pionowy między poziomami z
    tileSize: 0.82,     // rozmiar kafelka lokacji (siatka co 1)
    tileHeight: 0.22,
    maxAutoWalkSteps: 60,
    autoWalkDelayMs: 350,
  },
};

export const STATE_BARS = {
  // klucz gmcp.char.state -> etykieta, max, kierunek (1 = wysokie dobre, -1 = wysokie złe)
  hp:          { label: 'Kondycja',   max: 7,  good: 1 },
  fatigue:     { label: 'Zmęczenie',  max: 9,  good: -1 },
  mana:        { label: 'Mana',       max: 8,  good: 1 },
  soaked:      { label: 'Pragnienie', max: 3,  good: 1 },
  stuffed:     { label: 'Głód',       max: 3,  good: 1 },
  intox:       { label: 'Upicie',     max: 10, good: -1 },
  headache:    { label: 'Kac',        max: 6,  good: -1 },
  panic:       { label: 'Panika',     max: 5,  good: -1 },
  encumbrance: { label: 'Obciążenie', max: 6,  good: -1 },
  improve:     { label: 'Postęp',     max: 15, good: 1 },
  form:        { label: 'Forma',      max: 3,  good: 1 },
};
