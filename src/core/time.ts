// Simulation vs real time counters, advanced by the game loop.

export class GameTime {
  /** Seconds of simulated time (advances only while the sim runs). */
  simSeconds = 0;
  /** Number of fixed sim steps executed. */
  simSteps = 0;
  /** Seconds of wall-clock time the loop has been running (clamped per frame, excludes pauses). */
  realSeconds = 0;
}
