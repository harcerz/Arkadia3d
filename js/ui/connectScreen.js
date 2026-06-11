// Nakładka startowa: wybór trybu połączenia i status.
export class ConnectScreen {
  constructor(root, bus, settings) {
    this.root = root;
    this.bus = bus;
    this.settings = settings;

    this.statusEl = root.querySelector('.connect-status');
    this.modeSelect = root.querySelector('.connect-mode');
    this.modeSelect.value = settings.transportMode;

    root.querySelector('.connect-btn').addEventListener('click', () => {
      settings.transportMode = this.modeSelect.value;
      bus.emit('user.connect', { mode: this.modeSelect.value });
    });

    bus.on('net.status', (s) => this.#onStatus(s));
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }

  #onStatus({ state, mode, detail }) {
    const modeName = { direct: 'bezpośrednio', proxy: 'przez proxy', mock: 'demo' }[mode] ?? mode;
    switch (state) {
      case 'connecting':
        this.statusEl.textContent = `Łączenie (${modeName})…`;
        break;
      case 'fallback':
        this.statusEl.textContent = 'Serwer odrzucił połączenie bezpośrednie — próbuję przez proxy…';
        break;
      case 'open':
        this.statusEl.textContent = '';
        this.hide();
        break;
      case 'closed':
        this.statusEl.textContent = 'Rozłączono.';
        this.show();
        break;
      case 'error':
        this.statusEl.textContent = `Błąd połączenia (${modeName}). ${detail ?? ''}`;
        this.show();
        break;
    }
  }
}
