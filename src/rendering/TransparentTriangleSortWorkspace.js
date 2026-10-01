/**
 * Reusable-workspace triangle ordering. No Babylon dependencies.
 *
 * Deliberately retains the original depth expression and authored-ID tie break.
 * Vertex depths are reused only WITHIN one call, never across poses/frames.
 */
export class TransparentTriangleSortWorkspace {
  constructor(indices, vertexCount) {
    if (!Number.isSafeInteger(vertexCount) || vertexCount < 0
      || !indices || indices.length % 3 !== 0) {
      throw new TypeError("Triangle sorting requires a vertex count and triangle indices");
    }
    this.vertexCount = vertexCount;
    this.indexCount = indices.length;
    this.order = Uint32Array.from({ length: indices.length / 3 }, (_, i) => i);
    this.depths = new Float64Array(this.order.length);
    this.output = vertexCount > 65535
      ? new Uint32Array(indices) : new Uint16Array(indices);
    // A content snapshot, not just identity: FACE/inspection code may edit an
    // existing index array in place. Its new values must reach the GPU even
    // when the triangle permutation does not change.
    this.topology = new Uint32Array(indices);
    this.vertexDepths = new Float64Array(vertexCount);
    this.vertexStamps = new Uint32Array(vertexCount);
    this.generation = 0;
    this.didSort = false;
    this.didFullSort = false;
    this.vertexDepthCalculations = 0;
    const depths = this.depths;
    this.compare = (a, b) => depths[b] - depths[a] || a - b;
  }

  sort(positions, indices, matrix, rightHanded = false, optimized = true) {
    if (!positions || positions.length < this.vertexCount * 3
      || indices.length !== this.indexCount || !matrix || matrix.length < 16) {
      throw new RangeError("Triangle sorting inputs do not match the workspace");
    }
    this.didSort = false;
    this.didFullSort = false;
    let vertexDepthCalculations = 0;
    let topologyChanged = false;
    const direction = rightHanded ? -1 : 1;
    const { order, depths, topology, vertexDepths, vertexStamps, compare } = this;
    if (optimized) {
      this.generation = (this.generation + 1) >>> 0;
      if (this.generation === 0) {
        vertexStamps.fill(0);
        this.generation = 1;
      }
    }
    let finiteDepths = true;
    for (let triangle = 0; triangle < order.length; triangle += 1) {
      let depth = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceOffset = triangle * 3 + corner;
        const vertex = indices[sourceOffset];
        if (topology[sourceOffset] !== vertex) {
          topologyChanged = true;
          topology[sourceOffset] = vertex;
        }
        const offset = vertex * 3;
        if (!optimized) {
          // Reference path: the original expression, evaluated per corner.
          depth += positions[offset] * matrix[2]
            + positions[offset + 1] * matrix[6]
            + positions[offset + 2] * matrix[10];
          vertexDepthCalculations += 1;
        } else {
          if (vertexStamps[vertex] !== this.generation) {
            vertexDepths[vertex] = positions[offset] * matrix[2]
              + positions[offset + 1] * matrix[6]
              + positions[offset + 2] * matrix[10];
            vertexStamps[vertex] = this.generation;
            vertexDepthCalculations += 1;
          }
          depth += vertexDepths[vertex];
        }
      }
      depths[triangle] = depth * direction;
      if (!Number.isFinite(depths[triangle])) finiteDepths = false;
    }

    this.vertexDepthCalculations = vertexDepthCalculations;

    // Repair nearly sorted permutations in linear time plus a bounded number
    // of shifts. Small camera/pose changes often swap just a few neighbors;
    // falling back to a full sort on the first inversion wastes that locality.
    // Include authored IDs in EVERY comparison, including the fast path.
    let needsFullSort = !optimized || !finiteDepths;
    let reordered = false;
    // Avoid spending the repair budget on obviously scrambled frames. Eight
    // spread-out adjacent comparisons suffice as a cheap heuristic; either
    // path still computes the same exact final order.
    if (!needsFullSort && order.length >= 64) {
      let inversions = 0;
      for (let sample = 1; sample <= 8; sample += 1) {
        const i = Math.floor(sample * (order.length - 1) / 8);
        if (compare(order[i - 1], order[i]) > 0) inversions += 1;
        if (inversions >= 3) { needsFullSort = true; break; }
      }
    }
    if (!needsFullSort) {
      const shiftBudget = Math.max(8, order.length);
      let shifts = 0;
      for (let i = 1; i < order.length; i += 1) {
        const value = order[i];
        if (compare(order[i - 1], value) <= 0) continue;
        reordered = true;
        let j = i;
        do {
          order[j] = order[j - 1];
          j -= 1;
          shifts += 1;
        } while (j > 0 && shifts < shiftBudget
          && compare(order[j - 1], value) > 0);
        // Restore the held element BEFORE a fallback; order must remain a
        // permutation (no duplicate/missing triangles) even at the budget.
        order[j] = value;
        if (shifts >= shiftBudget) {
          needsFullSort = true;
          break;
        }
      }
    }
    // NaN/Infinity do not define a transitive comparator. Do not repair their
    // order first: invoke the original full sorter from the original order.
    if (needsFullSort) {
      order.sort(compare);
      this.didFullSort = true;
    }
    this.didSort = reordered || needsFullSort;
    if (!this.didSort && !topologyChanged) return false;

    let changed = false;
    for (let triangle = 0; triangle < order.length; triangle += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = triangle * 3 + corner;
        const index = indices[order[triangle] * 3 + corner];
        if (this.output[offset] !== index) changed = true;
        this.output[offset] = index;
      }
    }
    return changed;
  }
}
