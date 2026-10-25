# art-src — source art (not shipped)

Everything in this folder except this README is ignored by git. It holds downloads that the asset
scripts turn into files under `public/assets/`. Raw Mixamo files must not be redistributed, so only
the built `guard.glb` is committed.

| Folder | Filled by | Built by |
| --- | --- | --- |
| `polyhaven/` | `npm run assets:textures` (downloads automatically) | `build-trimsheets.mjs` |
| `audio/` | `npm run assets:audio` (downloads automatically) | `build-audio.mjs` |
| `anims/` | **you, by hand** (checklist below) | `npm run assets:characters` |
| `icon.png` | **you**: 1024×1024 app icon, full-bleed, key art inside the middle 66% | `npm run assets:icons` (Android launcher + Play icon) |
| `build/` | intermediate files from the scripts | — |

## Mixamo checklist (guards)

Mixamo has no API and needs an Adobe login, so these are downloaded by hand from
<https://www.mixamo.com>. Save each file into `art-src/anims/` under the name in the first column.
The names are the ones `scripts/assets/characters.mjs` points at.

**1. The character.** Pick one guard-like humanoid in dark clothing, for example by searching
`swat`, `soldier` or `police`. Prefer a character with one material, because each extra material
costs one draw call per guard. Any download with skin works: the build keeps only the mesh and
skeleton and discards the file's own animation. The current guard is Mixamo's "Double Dagger Stab"
download, saved as `guard.fbx`.

| Save as | Format | Skin | Frames per second |
| --- | --- | --- | --- |
| `guard.fbx` | FBX Binary (.fbx) | With Skin | 30 |

**2. The animations.** With the same character selected, search each name, set the options, then download:

- Format: **FBX Binary (.fbx)**
- Skin: **Without Skin**
- Frames per second: **30**
- Keyframe Reduction: **none**
- **In Place: ticked** wherever the animation offers it

| Save as | Mixamo search | Notes |
| --- | --- | --- |
| `pistol_idle.fbx` | Pistol Idle | |
| `pistol_walk.fbx` | Pistol Walk | In Place |
| `pistol_run.fbx` | Pistol Run | In Place |
| `looking_around.fbx` | Looking Around | |
| `death_from_the_back.fbx` | Death From The Back | thrown forward; built in place |
| `death_from_the_front.fbx` | Death From The Front | doubles over, falls forward; built in place |

Optional. Not downloaded yet; the game plays `idle` in its place. To use it, save it and add its
line to `CHARACTER.clips` in `characters.mjs` (the build stops on a file that's listed but
missing):

| Save as | Mixamo search | Clip | `keep` |
| --- | --- | --- | --- |
| `shooting.fbx` | a pistol shoot or aim clip | `shoot` | `'inPlace'` |

Turn clips (Left Turn / Right Turn, `keep: 'turn'`) are not used: guards turn on the spot without
one. Using them would also need `turnLeft`/`turnRight` back in `src/render/guard-anim.ts`.

Also in the folder but unused: `dying.fbx` (a possible 3rd death; it also falls forward) and `pistol_whip.fbx` (there's
no guard melee in the design).

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
