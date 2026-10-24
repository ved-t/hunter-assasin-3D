// The guard character and its clips, as downloaded from Mixamo into art-src/mixamo/ (see
// art-src/README.md). Read by build-characters.mjs. Clip names must match GuardClip in
// src/render/guard-anim.ts. A source may be FBX (converted with FBX2glTF) or already GLB.
//   take: which animation in the file to use (default: the first one with channels)
//   keep: 'all' keeps the hips' translation and turn (death falls); 'inPlace' removes the hips'
//         horizontal drift; 'turn' also removes the hips' yaw, since the game turns the guard itself

export const CHARACTER = {
  model: 'art-src/mixamo/guard.fbx',
  clips: {
    idle: { file: 'art-src/mixamo/pistol-idle.fbx', keep: 'inPlace' },
    walk: { file: 'art-src/mixamo/pistol-walk.fbx', keep: 'inPlace' },
    run: { file: 'art-src/mixamo/pistol-run.fbx', keep: 'inPlace' },
    turnLeft: { file: 'art-src/mixamo/turn-left.fbx', keep: 'turn' },
    turnRight: { file: 'art-src/mixamo/turn-right.fbx', keep: 'turn' },
    look: { file: 'art-src/mixamo/looking-around.fbx', keep: 'inPlace' },
    shoot: { file: 'art-src/mixamo/shooting.fbx', keep: 'inPlace' },
    deathBack: { file: 'art-src/mixamo/death-back.fbx', keep: 'all' },
    deathFront: { file: 'art-src/mixamo/death-front.fbx', keep: 'all' },
  },
  /** Which way the model faces in its file (Mixamo: +z); the build turns it to face −Z. */
  facing: '+z',
  out: 'public/assets/characters/guard.glb',
  /** Longest texture side kept (px); guards are seen in the dark at a distance. */
  maxTexturePx: 1024,
  /** Size budget for the output (bytes). */
  budget: 3 * 1024 * 1024,
};
