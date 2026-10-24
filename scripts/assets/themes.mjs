// Which Poly Haven (CC0) texture set fills each trim-sheet slot, per theme. Read by fetch-polyhaven.mjs
// and build-trimsheets.mjs. Slot names and order must match KIT_SLOTS in src/level/kit/kit-common.ts.
// `tileM` overrides the set's real-world size: the metres one repeat of the texture covers in game.

export const SLOTS = ['floor', 'wall', 'ceiling', 'trim', 'propA', 'propB', 'propC', 'metal'];

/** Sheet layout: cols × rows cells of `cell` px; each holds one tile of `cell − 2·gutter` px plus a wrapped border. */
export const SHEET = { cols: 4, rows: 2, cell: 512, gutter: 32 };

/** Poly Haven texture resolution downloaded (the sheet downsamples it). */
export const SOURCE_RES = '1k';

/** The theme every new player sees first ships in the initial download; the others lazy-load. */
export const INITIAL_THEME = 'warehouse';

export const THEMES = {
  warehouse: {
    floor: { id: 'concrete_floor_worn_001', tileM: 2.5 },
    wall: { id: 'factory_brick', tileM: 1.5 },
    ceiling: { id: 'corrugated_iron', tileM: 1.2 },
    trim: { id: 'painted_concrete', tileM: 1.5 },
    propA: { id: 'wood_planks_grey', tileM: 1 },
    propB: { id: 'rough_wood', tileM: 0.8 },
    propC: { id: 'green_metal_rust', tileM: 1 },
    metal: { id: 'metal_plate', tileM: 0.6 },
  },
  office: {
    floor: { id: 'dirty_carpet', tileM: 1 },
    wall: { id: 'beige_wall_001', tileM: 2 },
    ceiling: { id: 'polystyrene', tileM: 1 },
    trim: { id: 'plastered_wall_05', tileM: 1.5 },
    propA: { id: 'oak_veneer_01', tileM: 1.2 },
    propB: { id: 'blue_metal_plate', tileM: 1 },
    propC: { id: 'poly_wool_herringbone', tileM: 0.4 },
    metal: { id: 'plastered_wall_04', tileM: 1 },
  },
  mansion: {
    floor: { id: 'herringbone_parquet', tileM: 2 },
    wall: { id: 'red_plaster_weathered', tileM: 2 },
    ceiling: { id: 'white_plaster_02', tileM: 1 },
    trim: { id: 'dark_wood', tileM: 1.2 },
    propA: { id: 'velour_velvet', tileM: 0.4 },
    propB: { id: 'rosewood_veneer1', tileM: 1.2 },
    propC: { id: 'marble_01', tileM: 1 },
    metal: { id: 'plastered_wall_04', tileM: 1 },
  },
};

/** Poly Haven map keys we use: albedo, OpenGL normal, and AO/roughness/metal packed as R/G/B. */
export const MAPS = { albedo: 'Diffuse', normal: 'nor_gl', orm: 'arm' };

export const CACHE_DIR = 'art-src/polyhaven';
export const OUT_DIR = 'public/assets/themes';
