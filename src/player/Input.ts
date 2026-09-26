import * as THREE from "three";
import type { PlayerInput } from "./Player";

/**
 * Keyboard + mouse (pointer lock) + touch (virtual stick on the left, drag to look on the
 * right). Also the binocular zoom: hold the right mouse button or use the wheel / pinch.
 */
export class Input implements PlayerInput {
  readonly move = new THREE.Vector2();
  readonly look = new THREE.Vector2();
  run = false;
  sensitivity = 1;
  /** 1 = normal, larger = zoomed in. */
  zoom = 1;
  zoomTarget = 1;
  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lookLast = new THREE.Vector2();
  private stickOrigin = new THREE.Vector2();
  private rightHeld = false;
  private pinchDist = 0;
  locked = false;
  touch = false;
  /** Run held from the touch button. */
  holdRun = false;
  /** Called on single key presses (not repeats). */
  onKey: ((code: string) => void) | null = null;
  /** Called when the pointer lock is lost without the menu asking for it. */
  onUnlock: (() => void) | null = null;

  constructor(private el: HTMLElement, private stickEl: HTMLElement | null) {
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Tab") e.preventDefault();
      this.onKey?.(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    el.addEventListener("mousedown", (e) => {
      if (this.touch) return;
      if (!this.locked) {
        this.lock();
        return;
      }
      if (e.button === 2) {
        this.rightHeld = true;
      }
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 2) this.rightHeld = false;
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      const k = (0.0022 * this.sensitivity) / this.zoom;
      // browsers occasionally report a huge jump when the lock engages
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.look.x += e.movementX * k;
      this.look.y += e.movementY * k;
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.exp(-e.deltaY * 0.0015), 1, 8);
    }, { passive: false });
    document.addEventListener("pointerlockchange", () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (was && !this.locked) {
        this.keys.clear();
        this.onUnlock?.();
      }
    });

    // touch
    el.addEventListener("touchstart", (e) => this.touchStart(e), { passive: false });
    el.addEventListener("touchmove", (e) => this.touchMove(e), { passive: false });
    el.addEventListener("touchend", (e) => this.touchEnd(e));
    el.addEventListener("touchcancel", (e) => this.touchEnd(e));
  }

  lock() {
    if (this.touch) return;
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* not allowed yet */
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private touchStart(e: TouchEvent) {
    this.touch = true;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < innerWidth * 0.42 && this.stickId === null) {
        this.stickId = t.identifier;
        this.stickOrigin.set(t.clientX, t.clientY);
        this.stick.set(0, 0);
        if (this.stickEl) {
          this.stickEl.style.left = `${t.clientX - 60}px`;
          this.stickEl.style.top = `${t.clientY - 60}px`;
          this.stickEl.classList.add("active");
        }
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast.set(t.clientX, t.clientY);
      } else {
        // second finger on the right: pinch zoom
        const a = Array.from(e.touches).find((x) => x.identifier === this.lookId);
        if (a) this.pinchDist = Math.hypot(a.clientX - t.clientX, a.clientY - t.clientY);
      }
    }
  }
  private touchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        const dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
        const r = 55;
        const l = Math.hypot(dx, dy);
        const s = l > r ? r / l : 1;
        this.stick.set((dx * s) / r, (-dy * s) / r);
        const knob = this.stickEl?.firstElementChild as HTMLElement | null;
        if (knob) knob.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
      } else if (t.identifier === this.lookId) {
        const k = (0.0052 * this.sensitivity) / this.zoom;
        this.look.x += (t.clientX - this.lookLast.x) * k;
        this.look.y += (t.clientY - this.lookLast.y) * k;
        this.lookLast.set(t.clientX, t.clientY);
      }
    }
    if (e.touches.length >= 2 && this.pinchDist > 0) {
      const ts = Array.from(e.touches).filter((x) => x.identifier !== this.stickId);
      if (ts.length >= 2) {
        const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
        this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * (d / this.pinchDist), 1, 8);
        this.pinchDist = d;
      }
    }
  }
  private touchEnd(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.stick.set(0, 0);
        this.stickEl?.classList.remove("active");
        const knob = this.stickEl?.firstElementChild as HTMLElement | null;
        if (knob) knob.style.transform = "";
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
        this.pinchDist = 0;
      }
    }
  }

  /** Call once per frame before the player update. */
  update(dt: number) {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) y += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (this.stickId !== null) {
      x = this.stick.x;
      y = this.stick.y;
    }
    this.move.set(x, y);
    this.run = k.has("ShiftLeft") || k.has("ShiftRight") || this.stick.length() > 0.98 || this.holdRun;
    const want = this.rightHeld || k.has("KeyZ") ? Math.max(4, this.zoomTarget) : this.zoomTarget;
    this.zoom += (want - this.zoom) * (1 - Math.exp(-10 * dt));
  }

  /** Forget held keys (e.g. when the menu opens). */
  clear() {
    this.keys.clear();
    this.move.set(0, 0);
    this.look.set(0, 0);
    this.rightHeld = false;
  }
}
