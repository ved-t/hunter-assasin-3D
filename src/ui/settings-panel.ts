// Pause / settings panel (DOM). In a level it is the pause menu (Esc, losing Pointer Lock, or the touch
// gear button), with Resume, Restart and Quit to menu; from the main menu it is plain Settings with Back.
// The gyro toggle requests iOS motion permission directly inside its change handler (a real tap).

import { QUALITY_TIERS, isQualitySetting } from '../config/quality';
import { SETTINGS_LIMITS } from '../config/tunables';
import { clampSensitivity, clampVolume, type Settings } from '../save/settings';
import { isMinimapMode } from './minimap-math';
import { createOverlay, type Overlay } from './overlay';

export interface SettingsPanelOptions {
  /** Called after every change with the full new settings. */
  onChange: (settings: Settings) => void;
  /** Resume in a level, or Back to the main menu (a user gesture, so Pointer Lock may be requested). */
  onResume: () => void;
  /** Pause mode only: start the level over, or leave it for the main menu. */
  onRestart: () => void;
  onQuit: () => void;
  /** Asks for gyro permission; must run synchronously inside the input event. */
  requestGyro: () => Promise<boolean>;
  /** Whether to offer the gyro toggle at all (touch devices only). */
  gyroAvailable: boolean;
}

const L = SETTINGS_LIMITS;

/** In a level (pause menu) or from the main menu. */
export type SettingsPanelMode = 'pause' | 'menu';

export class SettingsPanel {
  private readonly overlay: Overlay;
  private settings: Settings;
  private readonly title: HTMLHeadingElement;
  private readonly resume: HTMLButtonElement;
  private readonly pauseButtons: HTMLDivElement;

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
        <button type="button" class="resume">Resume</button>
        <div class="pause-buttons">
          <button type="button" class="restart">Restart</button>
          <button type="button" class="quit">Quit to menu</button>
        </div>
        <label class="row"><span class="label">Volume</span>
          <input name="volMaster" type="range" min="0" max="1" step="${L.volumeStep}" />
        </label>
        <label class="row"><span class="label">Effects</span>
          <input name="volSfx" type="range" min="0" max="1" step="${L.volumeStep}" />
        </label>
        <label class="row"><span class="label">Music</span>
          <input name="volMusic" type="range" min="0" max="1" step="${L.volumeStep}" />
        </label>
        <label class="row"><span class="label">Look sensitivity</span>
          <input name="sens" type="range" min="${L.sensitivityMin}" max="${L.sensitivityMax}" step="${L.sensitivityStep}" />
          <output name="sensOut"></output>
        </label>
        <label class="row"><input name="invertY" type="checkbox" /> Invert look Y</label>
        <label class="row gyro-row"><input name="gyro" type="checkbox" /> Gyro look</label>
        <div class="note gyro-note" hidden>Motion access was denied. Allow it in your browser settings, then try again.</div>
        <label class="row">Minimap <select name="minimap"><option value="rotating">Rotating</option><option value="fixed">Fixed (north up)</option></select></label>
        <label class="row">Quality <select name="quality">${tierOptions}</select></label>
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
    const volMaster = q<HTMLInputElement>('[name=volMaster]');
    const volSfx = q<HTMLInputElement>('[name=volSfx]');
    const volMusic = q<HTMLInputElement>('[name=volMusic]');
    this.title = q('h2');
    this.resume = q('.resume');
    this.pauseButtons = q('.pause-buttons');
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
    volMaster.value = String(this.settings.volumeMaster);
    volSfx.value = String(this.settings.volumeSfx);
    volMusic.value = String(this.settings.volumeMusic);

    sens.addEventListener('input', () => {
      showSens();
      commit({ lookSensitivity: clampSensitivity(Number(sens.value)) });
    });
    volMaster.addEventListener('input', () =>
      commit({ volumeMaster: clampVolume(Number(volMaster.value)) }),
    );
    volSfx.addEventListener('input', () =>
      commit({ volumeSfx: clampVolume(Number(volSfx.value)) }),
    );
    volMusic.addEventListener('input', () =>
      commit({ volumeMusic: clampVolume(Number(volMusic.value)) }),
    );
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
    this.resume.addEventListener('click', () => {
      this.close();
      opts.onResume();
    });
    q<HTMLButtonElement>('.restart').addEventListener('click', () => {
      this.close();
      opts.onRestart();
    });
    q<HTMLButtonElement>('.quit').addEventListener('click', () => {
      this.close();
      opts.onQuit();
    });
  }

  get isOpen(): boolean {
    return this.overlay.visible;
  }

  open(mode: SettingsPanelMode): void {
    const pause = mode === 'pause';
    this.title.textContent = pause ? 'Paused' : 'Settings';
    this.resume.textContent = pause ? 'Resume' : 'Back';
    this.pauseButtons.hidden = !pause;
    this.overlay.show();
  }

  close(): void {
    this.overlay.hide();
  }
}
