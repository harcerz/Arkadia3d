#!/usr/bin/env node
/**
 * Przetwarza mapę społecznościową Arkadii (github.com/Delwing/arkadia-mapa)
 * na kompaktowe pliki per-kraina serwowane statycznie z GitHub Pages.
 *
 * Użycie:
 *   node tools/build-map-data.mjs                      # pobiera najnowszy release z GitHuba
 *   node tools/build-map-data.mjs --input /tmp/dir     # używa lokalnych mapExport.json/colors.json/npc.json
 *
 * Wynik (commitowany do repo):
 *   data/index.json        - lista krain (id, nazwa, plik, liczba lokacji, bbox, poziomy z)
 *   data/colors.json       - paleta środowisk {envId: [r,g,b]}
 *   data/npcs.json         - {roomId: [nazwy NPC]}
 *   data/areas/area-<id>.json - lokacje krainy w formacie kompaktowym
 *
 * Format lokacji (data/areas/*):
 *   { i:id, x, y, z, e:env, ex:{n|s|e|w|ne|nw|se|sw|u|d: id}, sp:{komenda: id}, h:hash? }
 * Uwaga: x/y/z to współrzędne Mudleta (y zanegowane względem GMCP); hash "x:y:z:Kraina"
 * używa współrzędnych GMCP i służy do pozycjonowania gracza.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_BASE = 'https://github.com/Delwing/arkadia-mapa/releases/latest/download';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data');

const DIR_CODES = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  up: 'u', down: 'd',
};

async function loadSource(name) {
  const argIdx = process.argv.indexOf('--input');
  if (argIdx !== -1) {
    const dir = process.argv[argIdx + 1];
    return JSON.parse(await readFile(join(dir, name), 'utf8'));
  }
  const url = `${RELEASE_BASE}/${name}`;
  console.log(`Pobieram ${url} ...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.json();
}

function compactRoom(room) {
  const out = { i: room.id, x: room.x, y: room.y, z: room.z, e: room.env };
  const ex = {};
  for (const [dir, target] of Object.entries(room.exits ?? {})) {
    const code = DIR_CODES[dir];
    if (code) ex[code] = target;
  }
  if (Object.keys(ex).length) out.ex = ex;
  const sp = room.specialExits ?? {};
  if (Object.keys(sp).length) out.sp = sp;
  if (room.hash) out.h = room.hash;
  if (room.stubs?.length) out.st = room.stubs.length;
  if (room.doors && Object.keys(room.doors).length) out.dr = 1;
  return out;
}

function compactLabel(label) {
  if (!label.Text) return null;
  return {
    x: label.X, y: label.Y, z: label.Z ?? 0,
    t: label.Text,
    c: [label.FgColor?.r ?? 255, label.FgColor?.g ?? 255, label.FgColor?.b ?? 255],
  };
}

const [mapExport, colors, npcs] = await Promise.all([
  loadSource('mapExport.json'),
  loadSource('colors.json'),
  loadSource('npc.json'),
]);

await mkdir(join(OUT, 'areas'), { recursive: true });

const index = [];
for (const area of mapExport) {
  if (!area.rooms?.length) continue;
  const rooms = area.rooms.map(compactRoom);
  const labels = (area.labels ?? []).map(compactLabel).filter(Boolean);
  const bbox = rooms.reduce(
    (b, r) => [
      Math.min(b[0], r.x), Math.min(b[1], r.y), Math.min(b[2], r.z),
      Math.max(b[3], r.x), Math.max(b[4], r.y), Math.max(b[5], r.z),
    ],
    [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
  );
  const levels = [...new Set(rooms.map((r) => r.z))].sort((a, b) => a - b);
  const file = `areas/area-${area.areaId}.json`;
  await writeFile(join(OUT, file), JSON.stringify({
    id: Number(area.areaId), name: area.areaName, rooms, labels,
  }));
  index.push({
    id: Number(area.areaId), name: area.areaName, file,
    rooms: rooms.length, bbox, levels,
  });
}

const palette = {};
for (const { envId, colors: rgb } of colors) palette[envId] = rgb;

const npcByRoom = {};
for (const { name, loc } of npcs) (npcByRoom[loc] ??= []).push(name);

await writeFile(join(OUT, 'index.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: 'github.com/Delwing/arkadia-mapa',
  areas: index.sort((a, b) => a.id - b.id),
}));
await writeFile(join(OUT, 'colors.json'), JSON.stringify(palette));
await writeFile(join(OUT, 'npcs.json'), JSON.stringify(npcByRoom));

const totalRooms = index.reduce((s, a) => s + a.rooms, 0);
console.log(`OK: ${index.length} krain, ${totalRooms} lokacji -> data/`);
