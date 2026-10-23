// The environment kit's material: a MeshStandardMaterial patched to read one trim sheet per theme.
// Each vertex names a sheet slot (kitSlot); the fragment shader tiles that slot's cell with fract() and
// samples with explicit gradients, so textures repeat in 2D without seams or mip bleed between cells.
// Vertex colour carries tint × baked AO, and kitBake (or, on instanced meshes, instanceColor) adds the
// baked lamp light as emissive × albedo. Until the sheet loads, each slot draws in its flat fallback
// colour. One program serves every theme: switching themes changes only uniforms and textures.

import * as THREE from 'three';
import { KIT_SLOTS, type SlotName } from '../level/kit/kit-common';

const SLOT_COUNT = KIT_SLOTS.length;

/** A theme's sheet layout, from public/assets/themes/<theme>/sheet.json. */
export interface TrimSheet {
  slots: Record<SlotName, { rect: [number, number, number, number]; tileM: number }>;
}

export interface SheetTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  /** Ambient occlusion, roughness, metalness in R, G, B. */
  orm: THREE.Texture;
}

export interface KitMaterial {
  material: THREE.MeshStandardMaterial;
  /** True once the trim sheet is applied. */
  readonly textured: boolean;
  applySheet(textures: SheetTextures, sheet: TrimSheet): void;
}

const VERTEX_PARS = /* glsl */ `
attribute float kitSlot;
attribute vec3 kitBake;
uniform vec4 kitRects[${SLOT_COUNT}];
uniform float kitScales[${SLOT_COUNT}];
uniform vec3 kitBases[${SLOT_COUNT}];
varying vec2 vKitUv;
varying vec4 vKitRect;
varying float vKitScale;
varying vec3 vKitBase;
varying vec3 vKitBake;
`;

// Replaces color_vertex: instanceColor is the per-instance lamp bake here, not a colour multiplier.
const COLOR_VERTEX = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
int kitIndex = int( kitSlot + 0.5 );
vKitRect = kitRects[ kitIndex ];
vKitScale = kitScales[ kitIndex ];
vKitBase = kitBases[ kitIndex ];
vKitBake = kitBake;
#ifdef USE_INSTANCING_COLOR
  vKitBake += instanceColor.rgb;
#endif
vKitUv = uv;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec2 vKitUv;
varying vec4 vKitRect;
varying float vKitScale;
varying vec3 vKitBase;
varying vec3 vKitBake;
vec4 kitSample( sampler2D tex ) {
  vec2 t = vKitUv * vKitScale;
  vec2 cell = vKitRect.zw;
  return textureGrad( tex, vKitRect.xy + fract( t ) * cell, dFdx( t ) * cell, dFdy( t ) * cell );
}
`;

// The ORM texture backs the roughness, metalness and AO maps; sample it once (applySheet always sets
// all three together).
const ROUGHNESS = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 kitOrm = kitSample( roughnessMap );
  roughnessFactor *= kitOrm.g;
#endif
`;
const METALNESS = /* glsl */ `
float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
  metalnessFactor *= kitOrm.b;
#endif
`;

function patchChunk(source: string, name: string, from: string, to: string): string {
  const chunk = THREE.ShaderChunk[name as keyof typeof THREE.ShaderChunk] as string;
  if (!chunk.includes(from)) throw new Error(`kit-material: three.js chunk ${name} changed`);
  return source.replace(`#include <${name}>`, chunk.split(from).join(to));
}

function patch(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <color_vertex>', COLOR_VERTEX);
  let fs = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb *= vKitBase;',
    )
    .replace('#include <roughnessmap_fragment>', ROUGHNESS)
    .replace('#include <metalnessmap_fragment>', METALNESS)
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vKitBake * diffuseColor.rgb;',
    );
  fs = patchChunk(fs, 'map_fragment', 'texture2D( map, vMapUv )', 'kitSample( map )');
  fs = patchChunk(
    fs,
    'normal_fragment_maps',
    'texture2D( normalMap, vNormalMapUv )',
    'kitSample( normalMap )',
  );
  fs = patchChunk(fs, 'aomap_fragment', 'texture2D( aoMap, vAoMapUv )', 'kitOrm');
  shader.fragmentShader = fs;
}

export function createKitMaterial(fallback: Record<SlotName, number>): KitMaterial {
  const rects = KIT_SLOTS.map(() => new THREE.Vector4(0, 0, 1, 1));
  const scales = KIT_SLOTS.map(() => 1);
  const bases = KIT_SLOTS.map((s) => new THREE.Color(fallback[s]));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  material.name = 'kit';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.kitRects = { value: rects };
    shader.uniforms.kitScales = { value: scales };
    shader.uniforms.kitBases = { value: bases };
    patch(shader);
  };
  material.customProgramCacheKey = () => 'kit-v1';
  let textured = false;

  return {
    material,
    get textured() {
      return textured;
    },
    applySheet(textures, sheet) {
      KIT_SLOTS.forEach((slot, i) => {
        const entry = sheet.slots[slot];
        rects[i]?.set(...entry.rect);
        scales[i] = 1 / entry.tileM;
        bases[i]?.setRGB(1, 1, 1);
      });
      material.map = textures.albedo;
      material.normalMap = textures.normal;
      material.roughnessMap = material.metalnessMap = material.aoMap = textures.orm;
      material.roughness = 1;
      material.metalness = 1;
      material.needsUpdate = true;
      textured = true;
    },
  };
}
