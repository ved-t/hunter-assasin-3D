# art-src — source art (not shipped)

Everything in this folder except this README is ignored by git. It holds downloads that the asset
scripts turn into files under `public/assets/`. Raw Mixamo files must not be redistributed, so only
the built `guard.glb` is committed.

| Folder | Filled by | Built by |
| --- | --- | --- |
| `polyhaven/` | `npm run assets:textures` (downloads automatically) | `build-trimsheets.mjs` |
| `audio/` | `npm run assets:audio` (downloads automatically) | `build-audio.mjs` |
| `mixamo/` | **you, by hand** (checklist below) | `npm run assets:characters` |
| `build/` | intermediate files from the scripts | — |

## Mixamo checklist (guards)

Mixamo has no API and needs an Adobe login, so these are downloaded by hand from
<https://www.mixamo.com>. Save each file into `art-src/mixamo/` under the name in the first column.

**1. The character.** Pick one guard-like humanoid in dark clothing, for example by searching
`swat`, `soldier` or `police`. Prefer a character with one material, because each extra material
costs one draw call per guard. Use the download button with **no animation** selected.

| Save as | Format | Skin | Frames per second | Pose |
| --- | --- | --- | --- | --- |
| `guard.fbx` | FBX Binary (.fbx) | With Skin | 30 | T-pose |

**2. The animations.** With the same character selected, search each name, set the options, then download:

- Format: **FBX Binary (.fbx)**
- Skin: **Without Skin**
- Frames per second: **30**
- Keyframe Reduction: **none**
- **In Place: ticked** wherever the animation offers it

| Save as | Mixamo search | Notes |
| --- | --- | --- |
| `pistol-idle.fbx` | Pistol Idle | |
| `pistol-walk.fbx` | Pistol Walk | In Place |
| `pistol-run.fbx` | Pistol Run | In Place |
| `turn-left.fbx` | Left Turn | the pistol version if listed |
| `turn-right.fbx` | Right Turn | the pistol version if listed |
| `looking-around.fbx` | Looking Around | |
| `shooting.fbx` | Shooting | the pistol one (one-handed or two-handed) |
| `death-back.fbx` | Death From The Back | he falls forward |
| `death-front.fbx` | Death From Front | he falls backward |

**3. Build:** `npm run assets:characters`. The script prints the clip list, the size (budget 3 MB),
and the draw calls per guard. It writes `public/assets/characters/guard.glb` and adds the guard to
the asset manifest. The game uses the model on the next load. Until the file exists, guards are
capsules.

If a clip's walking pace doesn't match how fast guards actually move (feet sliding), tune
`GUARD_ANIM.walkClipMps` / `runClipMps` in `src/config/tunables.ts`.

## Licences

- **Mixamo:** free to use in games under Adobe's terms. Raw files may not be redistributed (hence
  this ignored folder). Credited in `CREDITS.md`.
- **Poly Haven and the audio sources:** CC0. See `CREDITS.md` for each one.
