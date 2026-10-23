// Mission props: the bottle in flight and the objective item (cyan-white, the player-relevant colour,
// floating and turning so it reads in the dark). One draw call each; a pure view of Mission state.

import * as THREE from 'three';
import { PROPS } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Bottle } from '../player/throw';

export class MissionProps {
  readonly group = new THREE.Group();
  private readonly bottle: THREE.Mesh;
  private readonly item: THREE.Mesh;
  private time = 0;

  constructor() {
    this.group.name = 'mission-props';
    this.bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(PROPS.bottleRadius, PROPS.bottleRadius, PROPS.bottleLength, 8),
      new THREE.MeshStandardMaterial({ color: PROPS.bottleColor, roughness: 0.25 }),
    );
    this.bottle.visible = false;
    this.item = new THREE.Mesh(
      new THREE.OctahedronGeometry(PROPS.itemSize),
      new THREE.MeshBasicMaterial({ color: PROPS.itemColor }),
    );
    this.item.visible = false;
    this.group.add(this.bottle, this.item);
  }

  /** Once per rendered frame. `item` is null when there is none left to collect. */
  update(dt: number, alpha: number, bottle: Bottle, item: Vec2 | null): void {
    this.time += dt;
    this.bottle.visible = bottle.flying;
    if (bottle.flying) {
      const { pos, prevPos } = bottle;
      this.bottle.position.set(
        prevPos.x + (pos.x - prevPos.x) * alpha,
        prevPos.y + (pos.y - prevPos.y) * alpha,
        prevPos.z + (pos.z - prevPos.z) * alpha,
      );
      // Tumbling end over end.
      this.bottle.rotation.x = this.time * PROPS.bottleSpinRadPerS;
    }
    this.item.visible = item !== null;
    if (item) {
      const bob = Math.sin(this.time * PROPS.itemBobHz * 2 * Math.PI) * PROPS.itemBobM;
      this.item.position.set(item.x, PROPS.itemHeight + bob, item.z);
      this.item.rotation.y = this.time * PROPS.itemSpinRadPerS;
    }
  }

  dispose(): void {
    for (const m of [this.bottle, this.item]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}
