# Guard animation plan: real Mixamo guards

Status: done 2026-10-25 (commits 5a0fc69 onward), except the on-device fps check in step 8. The owner
playtested on desktop and approved the look. `guard.glb` is 1.29 MB, 2 draw calls per guard.
Findings: both Mixamo deaths (and `dying`) fall forward, none backward; guard meshes are now culled
per shadow light (mansion-4 high tier 78 → 64 draw calls at the start).

## What already exists (Phase 5d, tested only on stand-ins)

| Piece | File | Does |
| --- | --- | --- |
| Clip config | `scripts/assets/characters.mjs` | which file becomes which clip, hips trimming per clip, budgets |
| Build | `scripts/assets/build-characters.mjs` (`npm run assets:characters`) | FBX → GLB (FBX2glTF), clips copied onto the character's skeleton by bone name, facing flip, simplify to 12k tris, KTX2 textures, meshopt, manifest entry |
| Clip picker | `src/render/guard-anim.ts` (+ `guard-anim.test.ts`) | pure: sim state → clip + playback rate |
| Runtime | `src/render/guard-models.ts` | GLB loader (lazy chunk), one mixer per guard, crossfades, LOD update rate, torch/pistol props on the hand bones |
| Tunables | `GUARD_ANIM` in `src/config/tunables.ts` | fade time, walk/run speeds, stride speeds, culling |

The work below is mostly hooking up the real files, plus the two missing clips.

## The files we have (checked 2026-10-24 with three.js FBXLoader)

All of them use the same 69-bone Mixamo skeleton, and every animated bone exists in the character.

| Source | Becomes | Notes |
| --- | --- | --- |
| `~/Downloads/Double Dagger Stab.fbx` | the **character** (`model`) | 2 skinned meshes, embedded textures. Its own take is discarded by the build |
| `art-src/anims/pistol_idle.fbx` | `idle` | 8.30 s |
| `art-src/anims/pistol_walk.fbx` | `walk` | 0.80 s loop, In Place |
| `art-src/anims/pistol_run.fbx` | `run` | 0.50 s loop, In Place |
| `art-src/anims/looking_around.fbx` | `look` | 6.33 s |
| `art-src/anims/death_from_the_back.fbx` | `deathBack` | hips travel ~1.1 m |
| `art-src/anims/death_from_the_front.fbx` | `deathFront` | hips travel ~1.0 m |
| `art-src/anims/dying.fbx` | optional 3rd death | hips travel ~1.4 m |
| `art-src/anims/pistol_whip.fbx` | unused for now | no guard melee in the design |
| `~/Downloads/Double Dagger Stab (1).fbx` | unused for now | the player is first person and the viewmodel is code-built |
| — | `shoot` | **missing** (no pistol shoot clip found on Mixamo), see step 4 |
| — | `turnLeft` / `turnRight` | **missing**, see step 3 |

## Steps

Each step is one small commit. Don't mix these commits with the uncommitted Phase 6a platform work
that's in the tree right now.

### 1. Point the config at the real files
- Copy `Double Dagger Stab.fbx` to `art-src/anims/guard.fbx`. `art-src/` is git-ignored, so nothing
  raw gets committed.
- In `scripts/assets/characters.mjs`, change the paths to `art-src/anims/` with the downloaded names
  (underscores). Leave out the clips we don't have instead of pointing at missing files. The build
  stops on a missing file.
- Update the checklist in `art-src/README.md` to match: the folder, the names, and turn/shoot as
  optional.
- Commit: `assets: build guard from the downloaded Mixamo files`.

### 2. First build and the checks it must pass
Run `npm run assets:characters` and check:
- [ ] Size ≤ 3 MB (the `budget`). Expected roughly 1.5–3 MB.
- [ ] **Draw calls per guard.** The character has 2 meshes, so 2 per guard, times 10 guards, plus
  shadow passes on high tier. Check against the 100 draw-call cap with `?debug=1` in the busiest level.
  If it's too many, merge the two primitives in the build (same material) or drop the smaller mesh.
- [ ] **Duplicate bones.** FBXLoader reported `Spine2` and `Neck` twice. The build maps bones by
  name (`new Map(nodes.map(n => [name, n]))`), so if the duplicates are separate nodes, only one gets
  animated, and whatever is skinned to the other (a head, helmet or second mesh) would stay frozen
  in bind pose. Check the head and neck in the idle and walk clips. If it happens, give every
  same-named node the same channels in the build, or re-parent the second mesh's skin onto the first
  set of bones.
- [ ] Hands: `leftHand` / `rightHand` are found, so the torch and pistol props sit in the hands.

### 3. Turn clips: decide, then simplify
There are no turn clips, so the picker falls back to `idle` while he turns on the spot. That's
acceptable for v1, since turns are short and the beam sweep is what the player reads. Either:
- **(recommended)** remove `turnLeft`/`turnRight` from `GUARD_CLIPS` and `pickClip` so nothing
  refers to missing clips, and update `guard-anim.test.ts`; or
- download "Left Turn" / "Right Turn" later. The config already handles them (`keep: 'turn'`).

### 4. Shoot: procedural aim and recoil instead of a clip
The design needs a readable 0.6 s wind-up, then the shot (with the muzzle flash tell already in place).
- New pure module `src/render/guard-aim.ts` (+ test): from `gun.phase`, the wind-up progress and
  `sinceShot`, it returns an aim weight (0→1 over the wind-up, ease-out) and a recoil kick (a sharp
  spike at the shot, decaying over ~0.15 s). All the numbers go in a new `GUARD_AIM` block in
  `tunables.ts`.
- In `guard-models.ts`, after `mixer.update`, apply extra rotations on top of the clip's pose to
  `RightArm`/`RightForeArm` (raise the pistol to eye line, toward the player) and `Spine2` (lean into
  it), then the recoil kick (pitch up on the forearm and hand).
  - **Pitfall:** mixers on far or off-screen guards skip frames, and an offset added to a bone that
    the mixer didn't overwrite that frame stacks up. Only apply the offset on frames where the mixer
    ran, or force a mixer update every frame for guards in `windup` (there are only a few at once).
- `pickClip`: while aiming, play `idle` (or `walk` if he's moving) underneath, not `shoot`.
- If a pistol aim/shoot clip turns up later, add it as `shoot` and keep the recoil on top.
- Commit: `render: procedural guard aim and recoil`.

### 5. Death falls vs. walls
Deaths currently use `keep: 'all'`, so the body ends 1.0–1.4 m from where the sim thinks it is.
Tiles are 2 m, so a guard killed next to a wall can fall through it. The body, the dropped torch and
"beam lands on a body" all use the sim position.
- **(recommended)** switch deaths to `keep: 'inPlace'`: he falls pivoting on the spot, the body
  stays exactly where the sim has it, and there's no wall clipping. Check that the fall still reads
  well.
- Alternative: keep the travel, have the build record each death clip's final hips offset, and pick
  the death direction that doesn't hit a wall (a grid check). Only worth doing if in-place looks bad.
- Optional: add `dying` as a 3rd variant. Pick it at random against `deathFront` when he's killed
  from the side.

### 6. Fix a crossfade glitch in `play()` (found while reading)
`GuardRigs.play()` stores the *requested* clip in `r.current`, even when it fell back to `idle`. So
going `idle` → a missing clip restarts `idle` from frame 0 with no fade (a visible pop), and
"prev" lookups for the missing name return nothing. Resolve the fallback first, then compare and
store the clip that actually plays. Add a test for the fallback rule, in pure form if it can be
pulled out. Commit: `render: crossfade guard clips by the clip actually played`.

### 7. Tune by eye (`?debug=1`)
- `GUARD_ANIM.walkClipMps` / `runClipMps` until the feet stop sliding at patrol and alert speed.
- `walkFromMps`, `runFromMps`, `fadeS`.
- Torch and pistol prop offsets in the hands, and `lensMaxOffsetM`, so the beam starts at the torch.
- Silhouettes in the dark: guards must still read against the amber beams. Check every theme
  (warehouse, office, mansion) on both tiers.

### 8. Finish
- `npm run build`, `npm test`, `node scripts/size-report.mjs`. Report initial and total MB. The
  guard GLB is in the initial pack.
- Check fps on the Android phone with 8 guards on the low tier (Phase 2 acceptance: ≥ 50 fps).
- `CREDITS.md`: the Mixamo entry already exists. Name the character used.
- Update the Phase 5d memory note: guards are no longer capsules.

## Playtest checklist
Desktop: `npm run dev`. Phone: `npm run dev -- --host`.
- Patrol: walk cycle, no foot sliding, beam from the torch in his hand.
- Suspicious/search: look-around plays when he stops.
- Alert: runs, raises the pistol over the 0.6 s wind-up, kicks on the shot. The tell must be readable.
- Kill from behind → falls forward; from the side → falls back. No body inside walls.
- A dropped torch lies next to the body. Another guard's beam on the body still triggers Alert.
- Busiest level with `?debug=1`: draw calls ≤ 100, fps on target.

## Open questions for the owner (answered 2026-10-25)
1. Use the "Double Dagger Stab" character as the guard? **Yes**, the SWAT soldier ships. The owner
   wants to explore other looks too (e.g. purchasable skins); not decided yet.
2. Is it fine for guards to turn on the spot without a turn animation in v1? **Yes.**
3. Can the stab and pistol-whip clips stay unused, or do you want a guard melee attack? **Unused.**
4. (Added) Every Mixamo death falls forward; is that fine? **Yes.**
