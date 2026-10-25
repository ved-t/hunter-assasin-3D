// The guard character and its clips, as downloaded from Mixamo into art-src/anims/ (see
// art-src/README.md). Read by build-characters.mjs. Clip names must match GuardClip in
// src/render/guard-anim.ts. A source may be FBX (converted with FBX2glTF) or already GLB.
// Clips without a file are left out (the build stops on a missing file); the game plays idle
// in their place. Not downloaded yet: turnLeft/turnRight ('turn'), shoot ('inPlace').
//   take: which animation in the file to use (default: the first one with channels)
//   keep: 'all' keeps the hips' translation and turn (death falls); 'inPlace' removes the hips'
//         horizontal drift; 'turn' also removes the hips' yaw, since the game turns the guard itself

export const CHARACTER = {
  model: 'art-src/anims/guard.fbx',
  clips: {
    idle: { file: 'art-src/anims/pistol_idle.fbx', keep: 'inPlace' },
    walk: { file: 'art-src/anims/pistol_walk.fbx', keep: 'inPlace' },
    run: { file: 'art-src/anims/pistol_run.fbx', keep: 'inPlace' },
    look: { file: 'art-src/anims/looking_around.fbx', keep: 'inPlace' },
    deathBack: { file: 'art-src/anims/death_from_the_back.fbx', keep: 'all' },
    deathFront: { file: 'art-src/anims/death_from_the_front.fbx', keep: 'all' },
  },
  /** Which way the model faces in its file (Mixamo: +z); the build turns it to face −Z. */
  facing: '+z',
  out: 'public/assets/characters/guard.glb',
  /** Triangles per guard at most (meshes are simplified down to it); up to 10 guards, each drawn
   * again for every shadow-casting light. */
  maxTriangles: 12000,
  /** Longest texture side kept (px); guards are seen in the dark at a distance. */
  maxTexturePx: 1024,
  /** Size budget for the output (bytes). */
  budget: 3 * 1024 * 1024,
};
