#!/usr/bin/env node
// Test dymny stosu protokołu w Node (bez DOM): odtwarza transkrypt demo
// przez prawdziwe moduły telnet/GMCP/składanie linii i sprawdza wyniki.
//   node test/node-smoke.mjs
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelnetParser } from '../js/net/telnet.js';
import { LineAssembler } from '../js/net/lineAssembler.js';
import { parseGmcp, encodeGmcp } from '../js/gmcp/codec.js';
import { base64Codec } from '../js/net/transport.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'OK ' : 'FAIL'} ${name}${cond ? '' : ' — ' + detail}`);
  if (!cond) failures++;
};

const lines = [];
const gmcpPackets = [];
const sentRaw = [];
const echoes = [];

const assembler = new LineAssembler((batch) => lines.push(...batch));
const telnet = new TelnetParser({
  sendRaw: (b) => sentRaw.push(b),
  onText: (t, meta) => assembler.feedRaw(t, meta),
  onSubneg: (body) => {
    const p = parseGmcp(body);
    if (p) {
      gmcpPackets.push(p);
      if (p.path === 'gmcp_msgs') {
        const text = Buffer.from(p.payload.text, 'base64').toString('utf8');
        assembler.feedTyped(p.payload.type, text);
      }
    }
  },
  onEcho: (h) => echoes.push(h),
  onGmcpEnabled: () => sentRaw.push(encodeGmcp('Core.Supports.Add', ['Objects 1'])),
});

const script = JSON.parse(await readFile(join(HERE, 'transcripts', 'login.json'), 'utf8'));
for (const step of script) {
  if (step.frame) telnet.feed(base64Codec.decode(step.frame));
}
assembler.flushAll();

const text = lines.map((l) => l.text).join('\n');

check('negocjacja GMCP wysłana (IAC DO GMCP)',
  sentRaw.some((b) => b === '\xff\xfd\xc9'));
check('Core.Supports.Add wysłane po WILL GMCP',
  sentRaw.some((b) => b.includes('Core.Supports.Add')));
check('MCCP nie był oferowany w transkrypcie — brak odpowiedzi DONT 0x56',
  !sentRaw.some((b) => b === '\xff\xfe\x56'));
check('tryb hasła włączony i wyłączony (ECHO)',
  echoes.length === 2 && echoes[0] === true && echoes[1] === false,
  JSON.stringify(echoes));
check('polskie znaki sklejone między ramkami',
  text.includes('Wpisz imię swojej postaci'), text.slice(0, 200));
check('znaki "Świat Wiedźmina" przeszły bez strat',
  text.includes('Świat Wiedźmina i Warhammera'));
check('prompt po IAC GA wypchnięty jako osobna linia',
  lines.some((l) => l.cls === 'prompt' && l.text.includes('Imię:')));
check('room.info sparsowane (3 pakiety)',
  gmcpPackets.filter((p) => p.path === 'room.info').length === 3);
check('hash lokacji startowej zgodny z mapą Wyzimy',
  JSON.stringify(gmcpPackets.find((p) => p.path === 'room.info')?.payload?.map)
    === JSON.stringify({ x: 63, y: 92, z: 0, name: 'Wyzima' }));
check('char.state z hp=7',
  gmcpPackets.some((p) => p.path === 'char.state' && p.payload.hp === 7));
check('tekst gmcp_msgs trafił do konsoli',
  text.includes('Stoisz na brukowanym placu Wyzimy'));
check('ANSI 256 kolorów dotarło w tekście',
  text.includes('Latarnik zapala'));

// dodatkowe przypadki brzegowe
const t2lines = [];
const asm2 = new LineAssembler((b) => t2lines.push(...b));
const t2 = new TelnetParser({ sendRaw: () => {}, onText: (t, m) => asm2.feedRaw(t, m) });
// subnegocjacja rozcięta między ramki + IAC IAC w treści
t2.feed('abc\xff\xfa\xc9test ');
t2.feed('{"a":1}\xff\xf0def\xff\xffg\n');
asm2.flushAll();
check('subnegocjacja dzielona między ramki nie gubi tekstu',
  t2lines.map((l) => l.text).join('').includes('abcdef'),
  JSON.stringify(t2lines));
// literalny 0xFF nie jest poprawnym UTF-8 — dekoder daje U+FFFD, ale nie
// może zgubić otaczającego tekstu ani rozsypać parsera
check('IAC IAC nie psuje strumienia (0xFF -> U+FFFD)',
  t2lines.some((l) => l.text.includes('def�g')),
  JSON.stringify(t2lines));

const { AreaModel } = await import('../js/world/areaModel.js');
const areaData = JSON.parse(await readFile(join(HERE, '..', 'data', 'areas', 'area-1.json'), 'utf8'));
const area = new AreaModel(areaData);
check('AreaModel: lokacja 1286 po hashu 63:92:0:Wyzima',
  area.byHash.get('63:92:0:Wyzima')?.i === 1286);
const path = area.findPath(1286, 1290);
check('BFS znajduje trasę 1286 -> 1290 (1 krok se)',
  JSON.stringify(path) === JSON.stringify(['se']), JSON.stringify(path));

const { commandFor, codeFromVector, LONG_TO_CODE } = await import('../js/world/moveMapper.js');
check('komenda dla sw = poludniowy-zachod', commandFor('sw') === 'poludniowy-zachod');
check('LONG_TO_CODE pokrywa wszystkie kierunki z danych mapy', (() => {
  const dirs = new Set();
  for (const r of areaData.rooms) for (const c of Object.keys(r.ex ?? {})) dirs.add(c);
  return [...dirs].every((c) => commandFor(c) !== c || c.length > 2);
})());
check('joystick: wektor (0,1) = północ', codeFromVector(0, 1) === 'n');
check('joystick: wektor (1,-1) = poludniowy-wschod', codeFromVector(1, -1) === 'se');
check('alias polnoc -> n', LONG_TO_CODE['polnoc'] === 'n');

console.log(failures ? `\n${failures} TESTÓW NIE PRZESZŁO` : '\nWszystkie testy przeszły.');
process.exit(failures ? 1 : 0);
