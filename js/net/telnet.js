// Stanowy parser strumienia telnet (na bajt-stringach latin1).
// Obsługuje negocjację GMCP / ECHO / MCCP2, subnegocjacje dzielone między
// ramkami, IAC IAC oraz granice prompta (IAC GA / IAC EOR).

export const IAC = 0xff;
export const SE = 0xf0;
export const SB = 0xfa;
export const WILL = 0xfb;
export const WONT = 0xfc;
export const DO = 0xfd;
export const DONT = 0xfe;
export const GA = 0xf9;
export const EOR_CMD = 0xef;

export const OPT_ECHO = 0x01;
export const OPT_EOR = 0x19;
export const OPT_MCCP2 = 0x56;
export const OPT_GMCP = 0xc9;

const ST_DATA = 0;
const ST_IAC = 1;
const ST_OPT = 2; // po WILL/WONT/DO/DONT — czekamy na bajt opcji
const ST_SB = 3;
const ST_SB_IAC = 4;

export class TelnetParser {
  /**
   * @param {object} io - { sendRaw(byteString), onText(text, {prompt}), onSubneg(byteString), onEcho(hidden) }
   */
  constructor(io) {
    this.io = io;
    this.reset();
  }

  reset() {
    this.state = ST_DATA;
    this.verb = 0;
    this.subneg = '';
    this.gmcpEnabled = false;
  }

  /** Przetwarza porcję bajtów; tekst i zdarzenia trafiają do callbacków io. */
  feed(chunk) {
    let text = '';
    let prompt = false;

    for (let i = 0; i < chunk.length; i++) {
      const b = chunk.charCodeAt(i) & 0xff;
      switch (this.state) {
        case ST_DATA:
          if (b === IAC) this.state = ST_IAC;
          else text += chunk[i];
          break;

        case ST_IAC:
          if (b === IAC) { // IAC IAC = literalny bajt 0xFF
            text += 'ÿ';
            this.state = ST_DATA;
          } else if (b === SB) {
            this.subneg = '';
            this.state = ST_SB;
          } else if (b === WILL || b === WONT || b === DO || b === DONT) {
            this.verb = b;
            this.state = ST_OPT;
          } else {
            if (b === GA || b === EOR_CMD) prompt = true;
            this.state = ST_DATA; // NOP i inne komendy 2-bajtowe
          }
          break;

        case ST_OPT:
          this.#negotiate(this.verb, b);
          this.state = ST_DATA;
          break;

        case ST_SB:
          if (b === IAC) this.state = ST_SB_IAC;
          else this.subneg += chunk[i];
          break;

        case ST_SB_IAC:
          if (b === SE) {
            this.io.onSubneg?.(this.subneg);
            this.subneg = '';
            this.state = ST_DATA;
          } else if (b === IAC) {
            this.subneg += 'ÿ';
            this.state = ST_SB;
          } else {
            // niepoprawna sekwencja — porzucamy bajt, wracamy do subnegocjacji
            this.state = ST_SB;
          }
          break;
      }
    }

    if (text || prompt) this.io.onText?.(text.replaceAll('\r', ''), { prompt });
  }

  #negotiate(verb, opt) {
    const reply = (v, o) => this.io.sendRaw(String.fromCharCode(IAC, v, o));

    if (verb === WILL) {
      switch (opt) {
        case OPT_GMCP:
          if (!this.gmcpEnabled) {
            this.gmcpEnabled = true;
            reply(DO, OPT_GMCP);
            this.io.onGmcpEnabled?.();
          }
          break;
        case OPT_ECHO: // serwer przejmuje echo = pole hasła
          reply(DO, OPT_ECHO);
          this.io.onEcho?.(true);
          break;
        case OPT_EOR:
          reply(DO, OPT_EOR);
          break;
        case OPT_MCCP2: // odmawiamy kompresji — nie wieziemy dekompresora
          reply(DONT, OPT_MCCP2);
          break;
        default:
          reply(DONT, opt);
      }
    } else if (verb === WONT) {
      if (opt === OPT_ECHO) {
        reply(DONT, OPT_ECHO);
        this.io.onEcho?.(false);
      }
    } else if (verb === DO) {
      // nie oferujemy żadnych opcji po swojej stronie
      reply(WONT, opt);
    }
    // DONT — ignorujemy (i tak niczego nie nadajemy)
  }
}
