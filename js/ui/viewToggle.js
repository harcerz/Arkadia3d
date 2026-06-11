// Przełącznik widoków: diorama / FPP / pełnoekranowa konsola.
export class ViewToggle {
  constructor(root, bus, settings) {
    this.bus = bus;
    this.settings = settings;
    this.buttons = new Map();

    for (const btn of root.querySelectorAll('[data-view]')) {
      this.buttons.set(btn.dataset.view, btn);
      btn.addEventListener('click', () => this.set(btn.dataset.view));
    }
    this.set(settings.consoleExpanded ? 'console' : settings.view, false);
  }

  set(view, persist = true) {
    document.body.dataset.view = view;
    for (const [name, btn] of this.buttons) {
      btn.classList.toggle('active', name === view);
    }
    if (persist) {
      if (view === 'console') this.settings.consoleExpanded = true;
      else {
        this.settings.consoleExpanded = false;
        this.settings.view = view;
      }
    }
    this.bus.emit('ui.view', view);
  }
}
