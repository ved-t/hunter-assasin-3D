// Wires keyboard/mouse, touch and gyro into one InputState and switches the touch UI on hybrid devices:
// a touch shows the touch controls, a mouse press hides them again.

import { GyroLook } from './gyro';
import { InputState } from './input-state';
import { KeyboardMouse } from './keyboard-mouse';
import { TouchInput } from './touch';

export interface InputSettings {
  lookSensitivity: number;
  gyro: boolean;
}

export class InputManager {
  readonly state = new InputState();
  readonly keyboardMouse: KeyboardMouse;
  readonly touch: TouchInput;
  readonly gyro: GyroLook;
  /** Fired when the touch UI is shown or hidden. */
  onTouchModeChange: ((touch: boolean) => void) | null = null;
  private touchMode: boolean;
  private readonly abort = new AbortController();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, startInTouchMode: boolean) {
    this.keyboardMouse = new KeyboardMouse(canvas, this.state);
    this.touch = new TouchInput(uiRoot, this.state);
    this.gyro = new GyroLook(this.state);
    this.touchMode = startInTouchMode;
    this.touch.visible = startInTouchMode;
    window.addEventListener(
      'pointerdown',
      (e) => this.setTouchMode(e.pointerType === 'touch' || e.pointerType === 'pen'),
      { capture: true, signal: this.abort.signal },
    );
  }

  get isTouchMode(): boolean {
    return this.touchMode;
  }

  apply(settings: InputSettings): void {
    this.keyboardMouse.sensitivity = settings.lookSensitivity;
    this.touch.sensitivity = settings.lookSensitivity;
    this.gyro.sensitivity = settings.lookSensitivity;
    this.gyro.setEnabled(settings.gyro);
  }

  /** Refresh held movement into state. Call once per sim step, before the controller. */
  pollMovement(): void {
    this.state.moveX = this.state.moveY = 0;
    this.state.gait = 'walk';
    this.keyboardMouse.poll();
    if (this.touchMode) this.touch.poll();
  }

  /** Move device look into state. Call once per rendered frame, before consuming look. */
  flushLook(frameDt: number): void {
    this.keyboardMouse.flushLook();
    this.touch.flushLook(frameDt);
  }

  /** Drop everything held (pause, menus). */
  releaseAll(): void {
    this.keyboardMouse.releaseAll();
    this.touch.releaseAll();
    this.state.reset();
  }

  dispose(): void {
    this.abort.abort();
    this.gyro.setEnabled(false);
    this.keyboardMouse.dispose();
    this.touch.dispose();
  }

  private setTouchMode(on: boolean): void {
    if (on === this.touchMode) return;
    this.touchMode = on;
    this.touch.visible = on;
    if (on) this.keyboardMouse.unlock();
    this.onTouchModeChange?.(on);
  }
}
