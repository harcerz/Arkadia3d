// Punkt startowy: tworzy moduły i spina je zdarzeniami na busie.
import { CONFIG } from './config.js';
import { bus } from './core/eventBus.js';
import { settings } from './core/settings.js';
import { Connection } from './net/connection.js';
import { TelnetParser } from './net/telnet.js';
import { LineAssembler } from './net/lineAssembler.js';
import { parseGmcp } from './gmcp/codec.js';
import { GameState } from './gmcp/state.js';
import { GameConsole } from './ui/console.js';
import { CommandInput } from './ui/input.js';
import { CommandParser } from './ui/commandParser.js';
import { CharacterCreator } from './ui/charCreator.js';
import { AutoLogin } from './ui/autoLogin.js';
import { StatusBars } from './ui/statusBars.js';
import { QuickButtons } from './ui/quickButtons.js';
import { ConnectScreen } from './ui/connectScreen.js';
import { ViewToggle } from './ui/viewToggle.js';
import { WorldController } from './world/worldController.js';

const $ = (id) => document.getElementById(id);

// --- konsola i wejście ---
const gameConsole = new GameConsole($('console'), bus);
const assembler = new LineAssembler((lines) => {
  gameConsole.appendLines(lines);
  bus.emit('console.lines', lines); // np. kreator postaci nasłuchuje pytań gry
});
const input = new CommandInput($('commandInput'), bus, settings);
$('sendBtn').addEventListener('click', () => {
  input.submit($('commandInput').value);
  input.focus();
});

// --- sieć i protokół ---
const connection = new Connection(bus, settings);
const gameState = new GameState(bus, assembler);

const telnet = new TelnetParser({
  sendRaw: (bytes) => connection.sendRaw(bytes),
  onText: (text, meta) => assembler.feedRaw(text, meta),
  onSubneg: (body) => {
    const packet = parseGmcp(body);
    if (packet) gameState.handle(packet);
  },
  onEcho: (hidden) => bus.emit('telnet.echo', hidden),
  onGmcpEnabled: () => {
    connection.sendGmcp('Core.Supports.Add', CONFIG.gmcp.supports);
    connection.sendGmcp('Core.Options.Set', CONFIG.gmcp.options);
    connection.startPing();
  },
});

bus.on('net.bytes', (bytes) => telnet.feed(bytes));

bus.on('net.status', ({ state, mode, detail }) => {
  if (state === 'connecting') {
    telnet.reset();
    assembler.reset();
    gameState.reset();
  } else if (state === 'open') {
    gameConsole.systemMessage(mode === 'mock'
      ? '— Tryb demo: odtwarzam nagrany zapis gry —'
      : '— Połączono z Arkadią —');
    input.focus();
  } else if (state === 'reconnecting') {
    assembler.flushAll();
    bus.emit('ui.toast', `Połączenie przerwane — wznawiam za ${detail}…`);
  } else if (state === 'closed') {
    assembler.flushAll();
    gameConsole.systemMessage('— Rozłączono —');
  }
});

// --- parser komend (aliasy, sekwencje, komendy klienta) ---
const parser = new CommandParser(settings, {
  send: (cmd) => bus.emit('user.command', { text: cmd, fromUi: true }),
  print: (text) => gameConsole.systemMessage(text),
  connect: () => connection.connect(settings.transportMode),
  disconnect: () => connection.disconnect(),
});

// --- komendy gracza (konsola, przyciski, świat 3D) ---
bus.on('user.command', ({ text, hidden, fromUi }) => {
  if (!hidden && !fromUi) {
    // tekst z klawiatury przechodzi przez parser; rozwinięcia wracają jako fromUi
    const expanded = parser.parse(text);
    for (const cmd of expanded) bus.emit('user.command', { text: cmd, fromUi: true });
    return;
  }
  if (!connection.connected) {
    if (text) gameConsole.systemMessage('Brak połączenia — naciśnij „Połącz".');
    return;
  }
  if (!hidden) gameConsole.echoCommand(text);
  connection.send(text);
});

// --- HUD i świat ---
new StatusBars($('statusBars'), bus);
new QuickButtons($('quickButtons'), bus, settings);
const autoLogin = new AutoLogin(bus, settings);
const charCreator = new CharacterCreator(bus, settings);
const connectScreen = new ConnectScreen($('connectScreen'), bus, settings, autoLogin, charCreator);
const world = new WorldController($('canvas3d'), bus, settings, $('joystick'), $('location'));
new ViewToggle($('viewToggle'), bus, settings); // po WorldController — emituje początkowy widok

bus.on('user.connect', ({ mode }) => connection.connect(mode));

// Tap w postać na scenie wypełnia pole komendy (gracz poprawia odmianę).
bus.on('ui.fillInput', (text) => {
  const el = $('commandInput');
  el.value = text;
  input.focus();
});

// Toast z komunikatami UI.
const toast = $('toast');
let toastTimer = null;
bus.on('ui.toast', (text) => {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
});

// --- tryb developerski: ?mock=login odtwarza transkrypt bez sieci ---
const mockName = new URLSearchParams(location.search).get('mock');
if (mockName) {
  connectScreen.hide();
  connection.connect('mock', mockName);
}

// hak do debugowania i testów e2e
window.arkadia = { bus, charCreator, settings, world, autoLogin, connection };

// --- PWA ---
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline i tak działa częściowo */ });
}
