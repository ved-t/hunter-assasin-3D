// High-tier post-processing: bloom on the brightest lights (lens glows, lamps, the exit), then a
// vignette and film grain in display space. An optional overlay (the viewmodel) is drawn over the world
// with cleared depth before bloom, so the hand gets the same grade. Built from three's examples; no extra dependency. Lower
// tiers skip this module entirely and fake glow with additive sprites.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { POST } from '../config/tunables';

const GradeShader = {
  name: 'NoirGrade',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: POST.vignette },
    vignetteStart: { value: POST.vignetteStart },
    grain: { value: POST.grain },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float vignetteStart;
    uniform float grain;
    varying vec2 vUv;
    float hash( vec2 p ) {
      return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      float r = length( vUv - 0.5 ) * 1.41421;
      c.rgb *= 1.0 - vignette * smoothstep( vignetteStart, 1.0, r );
      c.rgb += ( hash( gl_FragCoord.xy + fract( time ) * 97.0 ) - 0.5 ) * grain;
      gl_FragColor = c;
    }`,
};

export class PostFx {
  private readonly composer: EffectComposer;
  private readonly grade: ShaderPass;
  private readonly size = new THREE.Vector2();
  private readonly lastSize = new THREE.Vector2();
  private time = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    antialias: boolean,
    overlay?: { scene: THREE.Scene; camera: THREE.Camera },
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: antialias ? POST.msaaSamples : 0,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(scene, camera));
    if (overlay) {
      const pass = new RenderPass(overlay.scene, overlay.camera);
      pass.clear = false;
      pass.clearDepth = true;
      this.composer.addPass(pass);
    }
    // UnrealBloomPass blurs from half resolution down.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      POST.bloomStrength,
      POST.bloomRadius,
      POST.bloomThreshold,
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  /** Renders the frame, following the renderer's drawing-buffer size. */
  render(frameDt: number): void {
    this.renderer.getDrawingBufferSize(this.size);
    if (!this.size.equals(this.lastSize)) {
      this.lastSize.copy(this.size);
      this.composer.setSize(this.size.x, this.size.y);
    }
    this.time += frameDt;
    (this.grade.uniforms.time as THREE.IUniform<number>).value = this.time % 1000;
    this.composer.render(frameDt);
  }

  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}
