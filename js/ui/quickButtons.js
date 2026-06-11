// Pasek szybkich komend (edytowalny, zapamiętywany w ustawieniach).
export class QuickButtons {
  constructor(root, bus, settings) {
    this.root = root;
    this.bus = bus;
    this.settings = settings;
    this.render();
  }

  render() {
    this.root.textContent = '';
    for (const cmd of this.settings.quickButtons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-btn';
      btn.textContent = cmd;
      btn.addEventListener('click', () => this.bus.emit('user.command', { text: cmd }));
      this.root.appendChild(btn);
    }
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'quick-btn quick-edit';
    edit.textContent = '✎';
    edit.title = 'Edytuj szybkie przyciski';
    edit.addEventListener('click', () => this.#edit());
    this.root.appendChild(edit);
  }

  #edit() {
    const current = this.settings.quickButtons.join(', ');
    const answer = prompt('Szybkie komendy (oddzielone przecinkami):', current);
    if (answer === null) return;
    this.settings.quickButtons = answer.split(',').map((s) => s.trim()).filter(Boolean);
    this.render();
  }
}
