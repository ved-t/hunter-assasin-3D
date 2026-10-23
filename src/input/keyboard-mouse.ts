// Desktop input: WASD (by physical key position), Shift run, Q sneak, C crouch toggle, E or left click
// context (knife), F or right click throw, and mouse look through Pointer Lock. Ctrl is deliberately
// unbound: Ctrl+W closes the tab.

import { INPUT } from '../config/tunables';
import type { InputState } from './input-state';

const KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: ['ShiftLeft', 'ShiftRight'],
  sneak: 'KeyQ',
  crouch: 'KeyC',
  context: 'KeyE',
  throw: 'KeyF',
} as const;

/** MouseEvent.button values. */
const MOUSE_PRIMARY = 0;
const MOUSE_SECONDARY = 2;

export class KeyboardMouse {
  /** Look sensitivity multiplier from settings. */
  sensitivity = 1;
  /** Fired when Pointer Lock is lost without us asking (Esc, alt-tab). */
  onUnlock: (() => void) | null = null;

  private readonly down = new Set<string>();
  private readonly pendingLook = { x: 0, y: 0 };
  private readonly abort = new AbortController();
  private releasing = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: InputState,
  ) {
    const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', (e) => this.onKey(e, true), opts);
    window.addEventListener('keyup', (e) => this.onKey(e, false), opts);
    window.addEventListener('blur', () => this.down.clear(), opts);
    document.addEventListener('pointerlockchange', () => this.onLockChange(), opts);
    canvas.addEventListener(
      'click',
      () => {
        if (!this.locked) void this.lock();
      },
      opts,
    );
    document.addEventListener('mousemove', (e) => this.onMouseMove(e), opts);
    // Buttons act only while captured, so the click that takes Pointer Lock never stabs anyone.
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!this.locked) return;
        if (e.button === MOUSE_PRIMARY) this.state.context = true;
        else if (e.button === MOUSE_SECONDARY) this.state.throw = true;
      },
      opts,
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Must be called from a user gesture. Prefers raw (unaccelerated) mouse input where supported. */
  async lock(): Promise<boolean> {
    try {
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      // unadjustedMovement unsupported (Safari, Firefox, some Linux) → plain lock.
      try {
        await this.canvas.requestPointerLock();
      } catch {
        return false; // e.g. Chrome's cooldown right after Esc; the next click retries
      }
    }
    return this.locked;
  }

  /** Release the lock ourselves (e.g. opening a menu) without triggering onUnlock. */
  unlock(): void {
    if (!this.locked) return;
    this.releasing = true;
    document.exitPointerLock();
  }

  /** Writes held keys into state. Called once per sim step before the controller reads it. */
  poll(): void {
    const state = this.state;
    const x = (this.down.has(KEYS.right) ? 1 : 0) - (this.down.has(KEYS.left) ? 1 : 0);
    const y = (this.down.has(KEYS.forward) ? 1 : 0) - (this.down.has(KEYS.back) ? 1 : 0);
    if (x === 0 && y === 0) return;
    const len = Math.hypot(x, y);
    state.moveX = x / len;
    state.moveY = y / len;
    if (KEYS.run.some((k) => this.down.has(k))) state.gait = 'run';
    else if (this.down.has(KEYS.sneak)) state.gait = 'sneak';
    else state.gait = 'walk';
  }

  /** Mouse look collected since the last call, scaled to radians. */
  flushLook(): void {
    const k = INPUT.mouseRadPerPx * this.sensitivity;
    this.state.addLook(this.pendingLook.x * k, this.pendingLook.y * k);
    this.pendingLook.x = this.pendingLook.y = 0;
  }

  releaseAll(): void {
    this.down.clear();
    this.pendingLook.x = this.pendingLook.y = 0;
  }

  dispose(): void {
    this.abort.abort();
    this.unlock();
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    if (isDown) {
      this.down.add(e.code);
      if (!e.repeat && e.code === KEYS.crouch) this.state.crouchToggle = true;
      if (!e.repeat && e.code === KEYS.context) this.state.context = true;
      if (!e.repeat && e.code === KEYS.throw) this.state.throw = true;
    } else {
      this.down.delete(e.code);
    }
    // Keep the page from scrolling or the browser from acting on game keys while playing.
    if (this.locked && e.code !== 'Escape') e.preventDefault();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked) return;
    this.pendingLook.x += e.movementX;
    this.pendingLook.y += e.movementY;
  }

  private onLockChange(): void {
    if (this.locked) return;
    this.down.clear();
    if (this.releasing) {
      this.releasing = false;
      return;
    }
    this.onUnlock?.();
  }
}
