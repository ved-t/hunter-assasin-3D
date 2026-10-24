// Where every recorded sound comes from (all CC0), and which bank sound each source file becomes.
// Read by fetch-audio.mjs (downloads into art-src/audio/) and build-audio.mjs (encodes into
// public/assets/audio/, with bank.json). Bank keys must be SoundKey names in src/audio/sound-bank.ts.

export const AUDIO_SRC_DIR = 'art-src/audio';
export const AUDIO_OUT_DIR = 'public/assets/audio';

/**
 * Downloads. `kenney` names an asset page on kenney.nl whose zip link is scraped (the zip URL carries a
 * hash that changes when a pack is updated); `url` is a direct file. Zips are extracted into `dir`.
 */
export const SOURCES = [
  { dir: 'kenney-impact', kenney: 'impact-sounds', author: 'Kenney', licence: 'CC0' },
  { dir: 'kenney-rpg', kenney: 'rpg-audio', author: 'Kenney', licence: 'CC0' },
  { dir: 'kenney-interface', kenney: 'interface-sounds', author: 'Kenney', licence: 'CC0' },
  { dir: 'kenney-jingles', kenney: 'music-jingles', author: 'Kenney', licence: 'CC0' },
  {
    dir: 'oga-gunshots',
    url: 'https://opengameart.org/sites/default/files/22%20Pistol.wav',
    file: '22-pistol.wav',
    page: 'https://opengameart.org/content/gunshots',
    author: 'kurt',
    licence: 'CC0',
  },
  {
    dir: 'oga-yd',
    url: 'https://opengameart.org/sites/default/files/Insistent.ogg',
    file: 'insistent.ogg',
    page: 'https://opengameart.org/content/insistent-background-loop',
    author: 'yd',
    licence: 'CC0',
  },
  {
    dir: 'oga-yd',
    url: 'https://opengameart.org/sites/default/files/Pressure.ogg',
    file: 'pressure.ogg',
    page: 'https://opengameart.org/content/pressure',
    author: 'yd',
    licence: 'CC0',
  },
  {
    dir: 'oga-yd',
    url: 'https://opengameart.org/sites/default/files/Factory.ogg',
    file: 'factory.ogg',
    page: 'https://opengameart.org/content/factory-ambiance',
    author: 'yd',
    licence: 'CC0',
  },
  {
    dir: 'oga-rain',
    url: 'https://opengameart.org/sites/default/files/Dark_Rainy_Night%28ambience%29.ogg',
    file: 'dark-rainy-night.ogg',
    page: 'https://opengameart.org/content/rain-and-thunders',
    author: 'Ylmir',
    licence: 'CC0',
  },
];

/**
 * Bank sounds: `files` are source paths under AUDIO_SRC_DIR (each one a variant picked at random),
 * `pack` decides when it loads, `kind` sets the encode (mono SFX or stereo music/ambience) and
 * `trimS` keeps only the first seconds of a one-shot, `loopS` the length of a seamless ambience loop.
 */
export const BANK = {
  // Shared one-shots: loaded with the first level.
  step: {
    pack: 'sfx',
    kind: 'sfx',
    files: [0, 1, 2, 3, 4].map((i) => `kenney-impact/Audio/footstep_concrete_00${i}.ogg`),
  },
  knife: {
    pack: 'sfx',
    kind: 'sfx',
    files: ['kenney-rpg/Audio/knifeSlice.ogg', 'kenney-rpg/Audio/knifeSlice2.ogg'],
  },
  windup: { pack: 'sfx', kind: 'sfx', files: ['kenney-rpg/Audio/metalClick.ogg'] },
  shot: { pack: 'sfx', kind: 'sfx', files: ['oga-gunshots/22-pistol.wav'], trimS: 1.2 },
  hurt: {
    pack: 'sfx',
    kind: 'sfx',
    files: [0, 1, 2].map((i) => `kenney-impact/Audio/impactPunch_heavy_00${i}.ogg`),
  },
  throw: {
    pack: 'sfx',
    kind: 'sfx',
    files: ['kenney-rpg/Audio/cloth1.ogg', 'kenney-rpg/Audio/cloth2.ogg'],
  },
  shatter: {
    pack: 'sfx',
    kind: 'sfx',
    files: [0, 1, 2].map((i) => `kenney-impact/Audio/impactGlass_heavy_00${i}.ogg`),
  },
  pickup: { pack: 'sfx', kind: 'sfx', files: ['kenney-interface/Audio/confirmation_002.ogg'] },
  win: {
    pack: 'sfx',
    kind: 'sfx',
    files: ['kenney-jingles/Audio/Pizzicato jingles/jingles_PIZZI02.ogg'],
  },
  fail: {
    pack: 'sfx',
    kind: 'sfx',
    files: ['kenney-jingles/Audio/Pizzicato jingles/jingles_PIZZI01.ogg'],
  },
  // Music: the menu track loads at boot, the level track with the first level.
  musicMenu: { pack: 'music-menu', kind: 'music', files: ['oga-yd/insistent.ogg'] },
  musicLevel: { pack: 'music-level', kind: 'music', files: ['oga-yd/pressure.ogg'] },
  // Ambience: one loop per theme, loaded with that theme. Office has none yet (procedural room tone).
  ambWarehouse: {
    pack: 'amb-warehouse',
    kind: 'ambience',
    files: ['oga-yd/factory.ogg'],
    loopS: 117,
  },
  ambMansion: {
    pack: 'amb-mansion',
    kind: 'ambience',
    files: ['oga-rain/dark-rainy-night.ogg'],
    loopS: 90,
  },
};

/** Packs in the initial download (the rest lazy-load). */
export const INITIAL_PACKS = ['sfx', 'music-menu', 'music-level', 'amb-warehouse'];
