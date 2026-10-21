// Binary min-heap of (node, key) pairs over typed arrays, for A* and distance floods.
// Duplicates are allowed: callers push again with a lower key and skip stale pops ("lazy deletion").

export class MinHeap {
  private nodes: Int32Array;
  private keys: Float64Array;
  size = 0;

  constructor(capacity = 64) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

  push(node: number, key: number): void {
    if (this.size === this.nodes.length) this.grow();
    let i = this.size++;
    // Sift up.
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const pk = this.keys[parent] as number;
      if (pk <= key) break;
      this.nodes[i] = this.nodes[parent] as number;
      this.keys[i] = pk;
      i = parent;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
  }

  /** Key of the smallest entry. Only valid when size > 0. */
  peekKey(): number {
    return this.keys[0] as number;
  }

  /** Removes and returns the node with the smallest key. Only valid when size > 0. */
  pop(): number {
    const top = this.nodes[0] as number;
    const last = --this.size;
    if (last > 0) {
      const node = this.nodes[last] as number;
      const key = this.keys[last] as number;
      // Sift down.
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= last) break;
        const r = l + 1;
        const child = r < last && (this.keys[r] as number) < (this.keys[l] as number) ? r : l;
        if ((this.keys[child] as number) >= key) break;
        this.nodes[i] = this.nodes[child] as number;
        this.keys[i] = this.keys[child] as number;
        i = child;
      }
      this.nodes[i] = node;
      this.keys[i] = key;
    }
    return top;
  }

  private grow(): void {
    const nodes = new Int32Array(this.nodes.length * 2);
    const keys = new Float64Array(this.keys.length * 2);
    nodes.set(this.nodes);
    keys.set(this.keys);
    this.nodes = nodes;
    this.keys = keys;
  }
}
