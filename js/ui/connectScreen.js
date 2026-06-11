// Nakładka startowa: wybór trybu połączenia, dane logowania i status.
export class ConnectScreen {
  /** @param {AutoLogin} autoLogin @param {CharacterCreator} charCreator */
  constructor(root, bus, settings, autoLogin, charCreator) {
    this.root = root;
    this.bus = bus;
    this.settings = settings;

    this.statusEl = root.querySelector('.connect-status');
    this.modeSelect = root.querySelector('.connect-mode');
    this.modeSelect.value = settings.transportMode;

    const nameEl = root.querySelector('.connect-name');
    const passEl = root.querySelector('.connect-pass');
    const rememberEl = root.querySelector('.connect-remember-box');
    nameEl.value = settings.loginName ?? '';
    passEl.value = settings.loginPass ?? '';
    rememberEl.checked = Boolean(settings.loginPass);

    root.querySelector('.connect-btn').addEventListener('click', () => {
      settings.transportMode = this.modeSelect.value;
      autoLogin?.arm(nameEl.value, passEl.value, rememberEl.checked);
      bus.emit('user.connect', { mode: this.modeSelect.value });
    });

    root.querySelector('.connect-new').addEventListener('click', () => {
      // kreacja przebiega w grze — łączymy się bez auto-loginu i otwieramy kreator
      settings.transportMode = this.modeSelect.value;
      autoLogin?.arm(null, null, false);
      bus.emit('user.connect', { mode: this.modeSelect.value });
      charCreator?.open();
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
