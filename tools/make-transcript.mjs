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

// ---------------------------------------------------------------------------
// create.json — kreacja postaci + fragment rozgrywki (spacer, handel, walka)
frames.length = 0;

const ask = (text) => push(250, utf8bytes(text) + IAC + GA);

push(200, utf8bytes(`${ESC}[1;36m        A R K A D I A${ESC}[0m\n`
  + `${ESC}[33m  Świat Wiedźmina i Warhammera${ESC}[0m\n\n`) + IAC + WILL + GMCP);
ask("Kim jesteś? Podaj imię postaci (lub wpisz 'nowa'): ");
wait(); // gracz: nowa
ask('Podaj imię nowej postaci: ');
wait(); // imię
ask('Podaj dopełniacz imienia (kogo? czego?): ');
wait();
ask('Podaj celownik imienia (komu? czemu?): ');
wait();
ask('Podaj biernik imienia (kogo? co?): ');
wait();
ask('Podaj narzędnik imienia (z kim? z czym?): ');
wait();
ask('Podaj miejscownik imienia (o kim? o czym?): ');
wait();
ask('Podaj płeć (kobieta/mezczyzna): ');
wait();
push(250, IAC + WILL + ECHO + utf8bytes('Wybierz hasło dla postaci: ') + IAC + GA);
wait();
push(200, IAC + WONT + ECHO + '\n' + IAC + WILL + ECHO
  + utf8bytes('Powtórz hasło: ') + IAC + GA);
wait();
push(200, IAC + WONT + ECHO + '\n');

// narodziny postaci na placu Wyzimy (prawdziwa lokacja 1286)
push(300, msg('system.login', 'Postać gotowa. Witaj w Arkadii!\n'));
push(150, gmcp('char.state', { hp: 7, fatigue: 1, mana: 3, stuffed: 3, soaked: 3, form: 3, improve: 0 }));
push(100, roomInfo(63, 92, 0, { northeast: 1, southeast: 1, south: 1 }));
push(120, msg('combat.avatar',
  `${ESC}[32mStoisz na brukowanym placu Wyzimy. Strażnik przygląda Ci się podejrzliwie,`
  + ` a krępy kupiec zachwala towary.${ESC}[0m\n`));
push(100, gmcp('objects.nums', [1, 2, 3]));
push(100, gmcp('objects.data', {
  1: { desc: 'krępy kupiec' },
  2: { desc: 'strażnik miejski' },
  3: { desc: 'ogromny szczur' },
}));
push(100, gmcp('room.time', { hour: 11 }));

// spacer na południowy-wschód
wait();
push(350, roomInfo(67, 96, 0, { northwest: 1, south: 1 })
  + msg('combat.avatar', 'Skręcasz w wąską uliczkę przy murach.\n'));
push(80, gmcp('objects.nums', [3]));
push(80, gmcp('objects.data', { 3: { desc: 'ogromny szczur' } }));
push(80, gmcp('char.state', { fatigue: 2 }));

// walka ze szczurem
wait(); // gracz: zabij szczura
push(300, msg('combat.avatar',
  `${ESC}[31mOgromny szczur rzuca się na Ciebie z piskiem!${ESC}[0m\n`));
push(700, msg('combat.avatar',
  `${ESC}[31mSzczur boleśnie kąsa Cię w łydkę.${ESC}[0m\n`));
push(80, gmcp('char.state', { hp: 5 }));
push(700, msg('combat.avatar',
  `${ESC}[33mTrafiasz szczura solidnym kopniakiem.${ESC}[0m\n`));
push(700, msg('combat.avatar',
  `${ESC}[1;32mOgromny szczur pada martwy u Twoich stóp!${ESC}[0m\n`));
push(80, gmcp('objects.nums', []));
push(80, gmcp('objects.data', {}));
push(80, gmcp('char.state', { hp: 6, improve: 2 }));
push(400, msg('combat.avatar',
  `${ESC}[38;5;114mCzujesz, że to starcie czegoś Cię nauczyło.${ESC}[0m\n`));

// powrót na plac o zmierzchu
wait();
push(350, roomInfo(63, 92, 0, { northeast: 1, southeast: 1, south: 1 })
  + msg('combat.avatar', 'Wracasz na plac. Targowisko powoli pustoszeje.\n'));
push(80, gmcp('objects.nums', [1, 2]));
push(80, gmcp('objects.data', { 1: { desc: 'krępy kupiec' }, 2: { desc: 'strażnik miejski' } }));
push(200, gmcp('room.time', { hour: 20 }));

await writeFile(join(OUT, 'create.json'), JSON.stringify(frames, null, 1));
console.log(`OK: ${frames.length} kroków -> test/transcripts/create.json`);

// ---------------------------------------------------------------------------
// real.json — odwzorowanie prawdziwego endpointu: logowanie e-mailem,
// hasło jako zwykły tekst (BEZ telnetowego ECHO). Sprawdza auto-login,
// wykrywanie promptu hasła po tekście i maskowanie.
frames.length = 0;
push(200, utf8bytes(`${ESC}[1;36m        Witaj w swiecie Arkadii${ESC}[0m\n\n`
  + 'Aby zalogowac sie na swoje konto lub jesli jeszcze go nie masz'
  + ' - podaj adres email.\n') + IAC + WILL + GMCP);
push(150, utf8bytes('Aby zalogowac sie na istniejaca postac - podaj jej imie.\n'));
push(120, utf8bytes('> ') + IAC + GA);
wait(); // auto: e-mail
push(300, utf8bytes('Witaj. Podaj swoje haslo:\n') + IAC + GA);
wait(); // auto: hasło (bez ECHO — wykryte po tekście)
push(300, msg('system.login', 'Zalogowano. Witaj ponownie!\n'));
push(120, gmcp('char.state', { hp: 7, fatigue: 2, mana: 6 }));
push(100, roomInfo(63, 92, 0, { northeast: 1, southeast: 1, south: 1 }));
push(120, msg('combat.avatar',
  `${ESC}[32mStoisz na brukowanym placu Wyzimy.${ESC}[0m\n`));
push(100, gmcp('objects.nums', [1]));
push(100, gmcp('objects.data', { 1: { desc: 'strażnik miejski' } }));
push(100, gmcp('room.time', { hour: 13 }));
await writeFile(join(OUT, 'real.json'), JSON.stringify(frames, null, 1));
console.log(`OK: ${frames.length} kroków -> test/transcripts/real.json`);
