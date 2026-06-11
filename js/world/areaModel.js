// Model krainy: indeksy lokacji, graf przejść, wyszukiwanie ścieżek.
import { DIR_OFFSETS } from './moveMapper.js';

export class AreaModel {
  /** @param {{id:number, name:string, rooms:object[], labels:object[]}} data */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.rooms = data.rooms;
    this.labels = data.labels ?? [];
    this.byId = new Map();
    this.byHash = new Map();
    for (const room of data.rooms) {
      this.byId.set(room.i, room);
      if (room.h) this.byHash.set(room.h, room);
    }
  }

  /** Wyjścia lokacji: [{code, target, special?}] (tylko zwykłe kierunki + specjalne). */
  exitsOf(room) {
    const out = [];
    for (const [code, target] of Object.entries(room.ex ?? {})) {
      out.push({ code, target });
    }
    for (const [cmd, target] of Object.entries(room.sp ?? {})) {
      out.push({ code: cmd, target, special: true });
    }
    return out;
  }

  /** Czy `to` jest bezpośrednim sąsiadem `from`? Zwraca kod kierunku/komendę. */
  adjacency(from, to) {
    for (const { code, target } of this.exitsOf(from)) {
      if (target === to.i) return code;
    }
    return null;
  }

  /**
   * BFS po grafie wyjść (w obrębie krainy). Zwraca listę kodów kierunków
   * albo null, gdy brak ścieżki / przekroczono limit.
   */
  findPath(fromId, toId, maxSteps = 60) {
    if (fromId === toId) return [];
    const prev = new Map([[fromId, null]]);
    let frontier = [fromId];
    for (let depth = 0; depth < maxSteps && frontier.length; depth++) {
      const next = [];
      for (const id of frontier) {
        const room = this.byId.get(id);
        if (!room) continue;
        for (const { code, target, special } of this.exitsOf(room)) {
          if (special || prev.has(target) || !this.byId.has(target)) continue;
          prev.set(target, { id, code });
          if (target === toId) return rebuild(prev, toId);
          next.push(target);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Przybliżona pozycja sąsiada bez lokacji w danych (kierunkowy "stub"). */
  static neighborOffset(room, code) {
    const [dx, dy, dz] = DIR_OFFSETS[code] ?? [0, 0, 0];
    return { x: room.x + dx, y: room.y + dy, z: room.z + dz };
  }
}

function rebuild(prev, toId) {
  const path = [];
  let cur = toId;
  while (prev.get(cur)) {
    const { id, code } = prev.get(cur);
    path.unshift(code);
    cur = id;
  }
  return path;
}
