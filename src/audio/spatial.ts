// Positional sound: the listener follows the camera, and each positional voice runs through
// lowpass → panner. The panner supplies direction only; loudness comes from path distance through the
// grid (the same rule guards and the player hear by), and the lowpass muffles sources behind walls.

import type { VoiceHandle } from './audio-manager';

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Set an AudioParam-or-legacy position (older Safari lacks positionX and friends). */
function setListener(l: AudioListener, p: ListenerPose): void {
  const cp = Math.cos(p.pitch);
  const fx = -Math.sin(p.yaw) * cp;
  const fy = Math.sin(p.pitch);
  const fz = -Math.cos(p.yaw) * cp;
  if (l.positionX) {
    l.positionX.value = p.x;
    l.positionY.value = p.y;
    l.positionZ.value = p.z;
    l.forwardX.value = fx;
    l.forwardY.value = fy;
    l.forwardZ.value = fz;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(fx, fy, fz, 0, 1, 0);
  }
}

export class Spatial {
  panningModel: PanningModelType = 'HRTF';

  updateListener(ctx: AudioContext, pose: ListenerPose): void {
    setListener(ctx.listener, pose);
  }

  /** Builds lowpass → panner → voice output at (x, y, z); connect the sound to the returned node. */
  chain(v: VoiceHandle, x: number, y: number, z: number, cutoffHz: number): AudioNode {
    const { ctx } = v;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = cutoffHz;
    const panner = ctx.createPanner();
    panner.panningModel = this.panningModel;
    // Direction only: path distance already set the gain.
    panner.distanceModel = 'inverse';
    panner.rolloffFactor = 0;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }
    lowpass.connect(panner).connect(v.out);
    return lowpass;
  }
}
