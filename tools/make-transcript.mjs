#!/usr/bin/env node
// Generuje test/transcripts/login.json — nagranie "rozgrywki" w formacie
// natywnego endpointu (base64 strumienia telnet). Ćwiczy: negocjację GMCP,
// tryb hasła (ECHO), ANSI, polskie znaki dzielone między ramkami,
// pakiety room.info/char.state/objects oraz spacer po prawdziwych
// lokacjach Wyzimy (hashe zgodne z data/areas/area-1.json).
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'transcripts');

const IAC = '\xff', SB = '\xfa', SE = '\xf0', WILL = '\xfb', WONT = '\xfc', GA = '\xf9';
const GMCP = '\xc9', ECHO = '\x01';
const ESC = '\x1b';

const utf8bytes = (s) => [...new TextEncoder().encode(s)].map((b) => String.fromCharCode(b)).join('');
const b64 = (byteStr) => Buffer.from(byteStr, 'latin1').toString('base64');
const gmcp = (path, payload) =>
  IAC + SB + GMCP + utf8bytes(`${path} ${JSON.stringify(payload)}`) + IAC + SE;
const msg = (type, text) => gmcp('gmcp_msgs', { type, text: Buffer.from(text, 'utf8').toString('base64') });
const roomInfo = (x, y, z, exits) =>
  gmcp('room.info', { map: { x, y, z, name: 'Wyzima' }, exits });

const frames = [];
const push = (delay, byteStr) => frames.push({ delay, frame: b64(byteStr) });
const wait = () => frames.push({ waitForInput: true });

// 1. Powitanie z ANSI + oferta GMCP
push(200, utf8bytes(`${ESC}[1;36m        A R K A D I A${ESC}[0m\n`
  + `${ESC}[33m  Świat Wiedźmina i Warhammera${ESC}[0m\n\n`) + IAC + WILL + GMCP);

// 2. Polskie znaki rozcięte w środku sekwencji UTF-8 ("ę" = 0xC4 0x99)
const line = utf8bytes('Wpisz imię swojej postaci lub "nowa", by stworzyć nową.\n');
const cut = line.indexOf('\xc4') + 1;
push(300, line.slice(0, cut));
push(120, line.slice(cut) + utf8bytes('Imię: ') + IAC + GA);
wait();

// 3. Hasło — serwer przejmuje echo
push(250, IAC + WILL + ECHO + utf8bytes('Hasło: ') + IAC + GA);
wait();
push(250, IAC + WONT + ECHO + '\n');

// 4. Wejście do gry: komunikaty gmcp_msgs + stan + lokacja startowa (rynek Wyzimy)
push(200, msg('system.login', 'Witaj ponownie w Arkadii!\n'));
push(150, gmcp('char.state', { hp: 7, fatigue: 2, mana: 5, stuffed: 2, soaked: 2, form: 3 }));
push(100, roomInfo(63, 92, 0, { northeast: 1, southeast: 1, south: 1 }));
push(120, msg('combat.avatar', `${ESC}[32mStoisz na brukowanym placu Wyzimy. Wokół gwar targowiska.${ESC}[0m\n`));
push(100, gmcp('objects.nums', [1, 2]));
push(100, gmcp('objects.data', {
  1: { desc: 'krępy kupiec' },
  2: { desc: 'strażnik miejski' },
}));
push(100, gmcp('room.time', { hour: 14 }));

// 5. Spacer: gracz rusza (czeka na input), serwer potwierdza kolejne lokacje
wait();
push(300, roomInfo(63, 94, 0, { north: 1, south: 1 })
  + msg('combat.avatar', 'Idziesz na południe wąską uliczką.\n'));
push(80, gmcp('char.state', { fatigue: 3 }));
wait();
push(300, roomInfo(63, 92, 0, { northeast: 1, southeast: 1, south: 1 })
  + msg('combat.avatar', 'Wracasz na plac.\n'));

// 6. Nocna zmiana światła + dłuższy tekst ANSI 256 kolorów
push(800, gmcp('room.time', { hour: 23 }));
push(200, msg('combat.avatar',
  `${ESC}[38;5;208mZapada zmrok. Latarnik zapala kolejne lampy.${ESC}[0m\n`));

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'login.json'), JSON.stringify(frames, null, 1));
console.log(`OK: ${frames.length} kroków -> test/transcripts/login.json`);
