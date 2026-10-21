// Touch input: nipplejs dynamic joystick on the left half (push depth picks sneak/walk/run),
// custom drag-to-look on the right half. Each zone tracks its own pointer, so move + look
// works with two thumbs at once.

import nipplejs from 'nipplejs';
import { INPUT } from '../config/tunables';
import { gaitFromStick, smoothingFactor, type InputState } from './input-state';

type Collection = ReturnType<typeof nipplejs.create>;

export class TouchInput {
  /** Look sensitivity multiplier from settings. */
  sensitivity = 1;

  readonly moveZone: HTMLDivElement;
  readonly lookZone: HTMLDivElement;
  private readonly joystick: Collection;
  private stickX = 0;
  private stickY = 0;
  private stickForce = 0;
  private lookPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  /** Look in pixels not yet applied (smoothed out over the next frames). */
  private pendingX = 0;
  private pendingY = 0;

  constructor(
    root: HTMLElement,
    private readonly state: InputState,
  ) {
    this.moveZone = document.createElement('div');
    this.moveZone.className = 'touch-zone touch-zone-move';
    this.lookZone = document.createElement('div');
    this.lookZone.className = 'touch-zone touch-zone-look';
    root.append(this.moveZone, this.lookZone);

    this.joystick = nipplejs.create({
      zone: this.moveZone,
      mode: 'dynamic',
      size: INPUT.joystickSizePx,
      color: { front: 'rgba(191,244,255,0.55)', back: 'rgba(191,244,255,0.15)' },
      fadeTime: 120,
      multitouch: false,
    });
    this.joystick.on('move', (e) => {
      const { vector, force } = e.data;
      this.stickX = vector.x;
      this.stickY = vector.y; // nipplejs: +y = up the screen = forward
      this.stickForce = Math.min(1, force);
    });
    this.joystick.on('end', () => this.clearStick());

    const z = this.lookZone;
    z.addEventListener('pointerdown', (e) => {
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      z.setPointerCapture(e.pointerId);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointer) return;
      this.pendingX += e.clientX - this.lastX;
      this.pendingY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.lookPointer) this.lookPointer = null;
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
  }

  set visible(v: boolean) {
    this.moveZone.hidden = !v;
    this.lookZone.hidden = !v;
    if (!v) this.releaseAll();
  }

  /** Writes the stick into state, overriding keys while the stick is pushed. Once per sim step. */
  poll(): void {
    const gait = gaitFromStick(this.stickForce);
    if (gait === null) return;
    const len = Math.hypot(this.stickX, this.stickY) || 1;
    this.state.moveX = this.stickX / len;
    this.state.moveY = this.stickY / len;
    this.state.gait = gait;
  }

  /** Feeds smoothed look into state. Once per rendered frame. */
  flushLook(frameDt: number): void {
    const f = smoothingFactor(frameDt, INPUT.touchSmoothingS);
    const dx = this.pendingX * f;
    const dy = this.pendingY * f;
    this.pendingX -= dx;
    this.pendingY -= dy;
    const k = INPUT.touchRadPerPx * this.sensitivity;
    this.state.addLook(dx * k, dy * k);
  }

  releaseAll(): void {
    this.clearStick();
    this.lookPointer = null;
    this.pendingX = this.pendingY = 0;
  }

  dispose(): void {
    this.joystick.destroy();
    this.moveZone.remove();
    this.lookZone.remove();
  }

  private clearStick(): void {
    this.stickX = this.stickY = this.stickForce = 0;
  }
}
