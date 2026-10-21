// Runs the light-spotted test for every guard at PERCEPTION.hz, staggered across sim steps so the cost
// is spread out, and feeds the results into the minimap memory. Sim-side: grid and plain data only.

import type { GuardState } from '../ai/guard-fsm';
import { GUARD, PERCEPTION, PLAYER_HEARING, SIM } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import type { BeamLight } from '../lighting/light-sampling';
import { createSoundField, type DistanceField } from '../nav/sound';
import { MinimapMemory } from './minimap-memory';
import { createSpotResult, spotGuard, type SpotResult, type SpotSubject } from './spotted';
import type { PlayerView } from './view';

/** What perception reads from a guard (Guard satisfies this). */
export interface PerceivableGuard {
  readonly pos: Vec2;
  readonly yaw: number;
  readonly speed: number;
  readonly state: GuardState;
}

/** Sim steps between two tests of the same guard. */
const BUCKETS = Math.max(1, Math.round(SIM.hz / PERCEPTION.hz));
const PITCH = (GUARD.flashlightPitchDeg * Math.PI) / 180;

export class PlayerPerception {
  readonly memory: MinimapMemory;
  /** Latest test result per guard (the debug overlay shows these). */
  readonly results: SpotResult[];
  private readonly sound: DistanceField;
  private readonly subject: SpotSubject = {
    x: 0,
    z: 0,
    speed: 0,
    yaw: 0,
    intensity: 0,
    lens: { x: 0, y: 0, z: 0, pitch: PITCH },
  };
  private stepIndex = 0;

  constructor(
    private readonly grid: Grid,
    count: number,
  ) {
    this.memory = new MinimapMemory(count);
    this.results = Array.from({ length: count }, createSpotResult);
    this.sound = createSoundField(grid);
  }

  /**
   * One sim step. `beams[i]` is guard i's flashlight as the sim sees it (lens, yaw, brightness).
   * Tests the guards whose turn it is, then advances the minimap fades.
   */
  step(
    dt: number,
    view: PlayerView,
    guards: readonly PerceivableGuard[],
    beams: readonly BeamLight[],
  ): void {
    const bucket = this.stepIndex % BUCKETS;
    this.stepIndex++;
    let flooded = false;
    for (let i = bucket; i < guards.length; i += BUCKETS) {
      const g = guards[i] as PerceivableGuard;
      const b = beams[i] as BeamLight;
      if (!flooded) {
        // One flood from the player serves every guard tested this step.
        this.sound.flood(view.x, view.z, PLAYER_HEARING.runRangeM);
        flooded = true;
      }
      const s = this.subject;
      s.x = g.pos.x;
      s.z = g.pos.z;
      s.speed = g.speed;
      s.yaw = b.yaw;
      s.intensity = b.intensity;
      s.lens.x = b.x;
      s.lens.y = b.height;
      s.lens.z = b.z;
      const r = spotGuard(this.grid, view, s, this.sound.at(g.pos.x, g.pos.z), this.results[i]);
      this.memory.report(i, r.kind, { x: g.pos.x, z: g.pos.z, yaw: g.yaw, state: g.state });
    }
    this.memory.update(dt);
  }
}
