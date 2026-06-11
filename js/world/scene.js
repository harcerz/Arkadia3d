// Wspólna scena Three.js dla obu widoków: render na żądanie, pauza,
// limit pixelRatio — oszczędzanie baterii telefonu.
import * as THREE from 'three';

export class SceneManager {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101018);
    this.scene.fog = new THREE.Fog(0x101018, 40, 140);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
    this.sun.position.set(30, 60, 20);
    this.scene.add(this.hemi, this.sun);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
    this.camera.position.set(10, 14, 10);

    this.dirty = true;
    this.paused = false;
    this.animations = new Set(); // aktywne animacje: fn(dt) -> false gdy koniec
    this.beforeRender = null;

    new ResizeObserver(() => this.#resize()).observe(canvas.parentElement);
    this.#resize();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.invalidate();
    });

    this.clock = new THREE.Clock();
    this.#loop();
  }

  invalidate() {
    this.dirty = true;
  }

  setPaused(paused) {
    this.paused = paused;
    if (!paused) this.invalidate();
  }

  /** Rejestruje animację; fn(dt) zwraca false, gdy zakończona. */
  animate(fn) {
    this.animations.add(fn);
    this.invalidate();
  }

  #loop() {
    requestAnimationFrame(() => this.#loop());
    if (this.paused || document.hidden) return;
    const dt = this.clock.getDelta();
    if (this.animations.size) {
      for (const fn of [...this.animations]) {
        if (fn(dt) === false) this.animations.delete(fn);
      }
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.beforeRender?.();
    this.renderer.render(this.scene, this.camera);
  }

  #resize() {
    const el = this.canvas.parentElement;
    if (!el) return;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
}
