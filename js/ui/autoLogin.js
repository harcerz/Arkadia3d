// Automatyczne logowanie: imię postaci wysyłane po nawiązaniu połączenia,
// hasło dokładnie wtedy, gdy serwer włączy tryb hasła (telnet ECHO) —
// bez dopasowywania tekstu promptów.
export class AutoLogin {
  /** @param {EventBus} bus @param {object} settings */
  constructor(bus, settings) {
    this.bus = bus;
    this.settings = settings;
    this.pending = null; // {name, pass} uzbrojone na jedno połączenie

    bus.on('net.status', ({ state }) => {
      if (state === 'open' && this.pending?.name) {
        // krótka zwłoka: najpierw baner powitalny i negocjacja opcji
        setTimeout(() => {
          if (!this.pending?.name) return;
          bus.emit('user.command', { text: this.pending.name, fromUi: true });
        }, 600);
      }
      if (state === 'closed' || state === 'error') this.pending = null;
    });

    bus.on('telnet.echo', (hidden) => {
      if (!hidden || !this.pending?.pass) return;
      const pass = this.pending.pass;
      this.pending = { ...this.pending, pass: null }; // tylko raz
      this.bus.emit('user.command', { text: pass, hidden: true });
    });
  }

  /** Uzbraja logowanie na najbliższe połączenie. */
  arm(name, pass, remember) {
    this.pending = { name: name?.trim() || null, pass: pass || null };
    if (remember) {
      this.settings.loginName = this.pending.name;
      this.settings.loginPass = pass || '';
    } else {
      this.settings.loginName = this.pending.name; // samo imię jest niewrażliwe
      this.settings.loginPass = '';
    }
  }
}
