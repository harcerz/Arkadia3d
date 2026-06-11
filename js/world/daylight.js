// Pora dnia z gmcp.room.time -> oświetlenie i tło sceny.
// Format payloadu nie jest publicznie udokumentowany, więc parsujemy
// defensywnie: liczbę-godzinę, pole hour/godzina albo słowa kluczowe.
import * as THREE from 'three';

const PHASES = {
  day:   { sky: 0x27313f, sun: 0xfff3d6, sunI: 1.5, hemiI: 0.95 },
  dusk:  { sky: 0x2d2433, sun: 0xff9c6b, sunI: 0.9, hemiI: 0.6 },
  night: { sky: 0x0c0e16, sun: 0x7a86b8, sunI: 0.35, hemiI: 0.35 },
  dawn:  { sky: 0x2a2c38, sun: 0xffc89b, sunI: 0.9, hemiI: 0.6 },
};

export function applyDaylight(sceneManager, timePayload) {
  const phase = PHASES[phaseFrom(timePayload)] ?? PHASES.day;
  const sky = new THREE.Color(phase.sky);
  sceneManager.scene.background = sky;
  if (sceneManager.scene.fog) sceneManager.scene.fog.color = sky;
  sceneManager.sun.color.setHex(phase.sun);
  sceneManager.sun.intensity = phase.sunI;
  sceneManager.hemi.intensity = phase.hemiI;
  sceneManager.invalidate();
}

function phaseFrom(payload) {
  let hour = null;
  if (typeof payload === 'number') hour = payload;
  else if (payload && typeof payload === 'object') {
    hour = Number(payload.hour ?? payload.godzina ?? NaN);
  } else if (typeof payload === 'string') {
    const lower = payload.toLowerCase();
    if (lower.includes('noc')) return 'night';
    if (lower.includes('swit') || lower.includes('świt') || lower.includes('rano')) return 'dawn';
    if (lower.includes('zmierzch') || lower.includes('wiecz')) return 'dusk';
    const m = lower.match(/\d{1,2}/);
    if (m) hour = Number(m[0]);
  }
  if (hour === null || Number.isNaN(hour)) return 'day';
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 8) return 'dawn';
  if (hour >= 19) return 'dusk';
  return 'day';
}
