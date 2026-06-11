// Asercje przeglądarkowe — głównie moduły wymagające DOM (parser ANSI).
// Testy protokołu bez DOM: node test/node-smoke.mjs
import { AnsiRenderer, stripAnsi } from '../js/ui/ansi.js';

const results = document.getElementById('results');
results.textContent = '';
let failures = 0;

function check(name, cond, detail = '') {
  const div = document.createElement('div');
  div.className = cond ? 'ok' : 'fail';
  div.textContent = `${cond ? 'OK' : 'FAIL'} ${name}${cond ? '' : ' — ' + detail}`;
  results.appendChild(div);
  if (!cond) failures++;
}

const ESC = '\x1b';

{
  const r = new AnsiRenderer();
  const frag = r.render(`zwykly ${ESC}[31mczerwony${ESC}[0m koniec`);
  const spans = [...frag.childNodes];
  check('ANSI: 3 segmenty', spans.length === 3, String(spans.length));
  check('ANSI: środkowy span czerwony',
    spans[1].style?.color?.length > 0 && spans[1].textContent === 'czerwony');
  check('ANSI: reset wraca do czystego tekstu', spans[2].nodeType === Node.TEXT_NODE);
}

{
  // styl przenosi się między liniami
  const r = new AnsiRenderer();
  r.render(`${ESC}[1;33mzloty bold`);
  const frag2 = r.render('dalej zloty');
  const span = frag2.firstChild;
  check('ANSI: styl ciągnie się przez linie',
    span.style?.fontWeight === '700' && span.style?.color.length > 0);
}

{
  const r = new AnsiRenderer();
  const frag = r.render(`${ESC}[38;5;208mpomaranczowy${ESC}[0m i ${ESC}[38;2;10;200;30mRGB${ESC}[0m`);
  const spans = [...frag.childNodes].filter((n) => n.nodeType === Node.ELEMENT_NODE);
  check('ANSI: 256 kolorów', spans[0]?.style.color === 'rgb(255, 135, 0)', spans[0]?.style.color);
  check('ANSI: truecolor', spans[1]?.style.color === 'rgb(10, 200, 30)', spans[1]?.style.color);
}

{
  const r = new AnsiRenderer();
  const frag = r.render(`przed${ESC}[2Jpo`); // sekwencja czyszczenia ekranu — ignorowana
  check('ANSI: nie-SGR sekwencje są wycinane', frag.textContent === 'przedpo', frag.textContent);
  check('stripAnsi', stripAnsi(`${ESC}[31mab${ESC}[0mc`) === 'abc');
}

const h = document.createElement('h2');
h.textContent = failures ? `${failures} TESTÓW NIE PRZESZŁO` : 'Wszystkie testy przeszły.';
h.className = failures ? 'fail' : 'ok';
results.appendChild(h);
