// Pause / settings panel (DOM). Opened by Esc, losing Pointer Lock, or the touch gear button.
// The gyro toggle requests iOS motion permission directly inside its change handler (a real tap).

import { QUALITY_TIERS, isQualitySetting } from '../config/quality';
import { SETTINGS_LIMITS } from '../config/tunables';
import { clampSensitivity, type Settings } from '../save/settings';
import { isMinimapMode } from './minimap-math';
import { createOverlay, type Overlay } from './overlay';

export interface SettingsPanelOptions {
  /** Called after every change with the full new settings. */
  onChange: (settings: Settings) => void;
  /** Called when the player presses Resume (a user gesture, so Pointer Lock may be requested). */
  onResume: () => void;
  /** Asks for gyro permission; must run synchronously inside the input event. */
  requestGyro: () => Promise<boolean>;
  /** Whether to offer the gyro toggle at all (touch devices only). */
  gyroAvailable: boolean;
}

const L = SETTINGS_LIMITS;

export class SettingsPanel {
  private readonly overlay: Overlay;
  private settings: Settings;

  constructor(root: HTMLElement, initial: Settings, opts: SettingsPanelOptions) {
    this.settings = { ...initial };
    const tierOptions = ['auto', ...QUALITY_TIERS]
      .map((t) => `<option value="${t}">${t[0]?.toUpperCase()}${t.slice(1)}</option>`)
      .join('');
    this.overlay = createOverlay(
      root,
      'settings-overlay',
      `<div class="panel" role="dialog" aria-label="Settings">
        <h2>Paused</h2>
        <label class="row">Look sensitivity
          <input name="sens" type="range" min="${L.sensitivityMin}" max="${L.sensitivityMax}" step="${L.sensitivityStep}" />
          <output name="sensOut"></output>
        </label>
        <label class="row"><input name="invertY" type="checkbox" /> Invert look Y</label>
        <label class="row gyro-row"><input name="gyro" type="checkbox" /> Gyro look</label>
        <div class="note gyro-note" hidden>Motion access was denied. Allow it in your browser settings, then try again.</div>
        <label class="row">Minimap <select name="minimap"><option value="rotating">Rotating</option><option value="fixed">Fixed (north up)</option></select></label>
        <label class="row">Quality <select name="quality">${tierOptions}</select></label>
        <button type="button" class="resume">Resume</button>
        <div class="note keys">WASD move · Shift run · Q sneak · C crouch · E / click takedown · F / right-click bottle · Esc pause</div>
      </div>`,
    );
    const el = this.overlay.element;
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
    const sens = q<HTMLInputElement>('[name=sens]');
    const sensOut = q<HTMLOutputElement>('[name=sensOut]');
    const invertY = q<HTMLInputElement>('[name=invertY]');
    const gyro = q<HTMLInputElement>('[name=gyro]');
    const gyroNote = q<HTMLDivElement>('.gyro-note');
    const quality = q<HTMLSelectElement>('[name=quality]');
    const minimap = q<HTMLSelectElement>('[name=minimap]');
    q<HTMLElement>('.gyro-row').hidden = !opts.gyroAvailable;

    const commit = (patch: Partial<Settings>) => {
      this.settings = { ...this.settings, ...patch };
      opts.onChange({ ...this.settings });
    };
    const showSens = () => (sensOut.value = Number(sens.value).toFixed(2));

    sens.value = String(this.settings.lookSensitivity);
    showSens();
    invertY.checked = this.settings.invertY;
    gyro.checked = this.settings.gyro;
    quality.value = this.settings.quality;
    minimap.value = this.settings.minimapMode;

    sens.addEventListener('input', () => {
      showSens();
      commit({ lookSensitivity: clampSensitivity(Number(sens.value)) });
    });
    invertY.addEventListener('change', () => commit({ invertY: invertY.checked }));
    gyro.addEventListener('change', () => {
      gyroNote.hidden = true;
      if (!gyro.checked) {
        commit({ gyro: false });
        return;
      }
      // Called synchronously in the handler so iOS sees the user activation.
      void opts.requestGyro().then((granted) => {
        gyro.checked = granted;
        gyroNote.hidden = granted;
        commit({ gyro: granted });
      });
    });
    minimap.addEventListener('change', () => {
      if (isMinimapMode(minimap.value)) commit({ minimapMode: minimap.value });
    });
    quality.addEventListener('change', () => {
      if (isQualitySetting(quality.value)) commit({ quality: quality.value });
    });
    q<HTMLButtonElement>('.resume').addEventListener('click', () => {
      this.close();
      opts.onResume();
    });
  }

  get isOpen(): boolean {
    return this.overlay.visible;
  }

  open(): void {
    this.overlay.show();
  }

  close(): void {
    this.overlay.hide();
  }
}
