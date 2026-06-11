// Atrapa WebSocketu odtwarzająca nagrany transkrypt (development bez sieci).
// Transkrypt: test/transcripts/<nazwa>.json
//   [{ delay: ms, frame: "<base64 strumienia telnet>" },
//    { waitForInput: true }, ...]  — waitForInput wstrzymuje odtwarzanie
//    do najbliższego send() (np. podanie imienia postaci).
export class MockSocket {
  constructor(name) {
    this.readyState = WebSocket.CONNECTING;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this.binaryType = 'arraybuffer';
    this.#run(name);
  }

  async #run(name) {
    let script;
    try {
      const res = await fetch(`test/transcripts/${name}.json`);
      script = await res.json();
    } catch (err) {
      queueMicrotask(() => this.onerror?.(err));
      queueMicrotask(() => this.onclose?.({}));
      return;
    }
    this.readyState = WebSocket.OPEN;
    this.pendingInputs = 0;
    this.onopen?.();

    for (const step of script) {
      if (this.readyState !== WebSocket.OPEN) return;
      if (step.waitForInput) {
        if (this.pendingInputs > 0) {
          this.pendingInputs--; // wejście przyszło zanim zdążyliśmy czekać
        } else {
          await new Promise((resolve) => { this.inputResolve = resolve; });
        }
      }
      if (step.delay) await sleep(step.delay);
      if (step.frame && this.readyState === WebSocket.OPEN) {
        this.onmessage?.({ data: step.frame });
      }
    }
  }

  send(frame) {
    // negocjacja telnet / pakiety GMCP (zaczynają się od IAC) nie są
    // "wejściem gracza" — nie popychają scenariusza
    try {
      if (atob(String(frame)).startsWith('\xff')) return;
    } catch { /* nie-base64: traktuj jak wejście */ }
    if (this.inputResolve) {
      const r = this.inputResolve;
      this.inputResolve = null;
      r();
    } else {
      this.pendingInputs++;
    }
  }

  close() {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({}));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
