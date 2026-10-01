import assert from "node:assert/strict";
import test from "node:test";
import { TransparentTriangleSortWorkspace } from "../src/rendering/TransparentTriangleSortWorkspace.js";

const identity = () => Float32Array.from([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);
const layers = () => Float32Array.from([
  -1, -1, 1, 1, -1, 1, 0, 1, 1,
  -1, -1, 3, 1, -1, 3, 0, 1, 3,
]);

// Independently retained original arithmetic/order/packing algorithm. This is
// intentionally not implemented in terms of the new workspace's legacy mode.
function referenceSorter(indices, vertexCount) {
  const order = Uint32Array.from({length: indices.length / 3}, (_, i) => i);
  const depths = new Float64Array(order.length);
  const output = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  return {
    output, order,
    sort(positions, source, matrix, rightHanded = false) {
      const direction = rightHanded ? -1 : 1;
      for (let triangle = 0; triangle < order.length; triangle += 1) {
        let depth = 0;
        for (let corner = 0; corner < 3; corner += 1) {
          const offset = source[triangle * 3 + corner] * 3;
          depth += positions[offset] * matrix[2]
            + positions[offset + 1] * matrix[6]
            + positions[offset + 2] * matrix[10];
        }
        depths[triangle] = depth * direction;
      }
      order.sort((a, b) => depths[b] - depths[a] || a - b);
      let changed = false;
      for (let triangle = 0; triangle < order.length; triangle += 1) {
        for (let corner = 0; corner < 3; corner += 1) {
          const offset = triangle * 3 + corner;
          const index = source[order[triangle] * 3 + corner];
          if (output[offset] !== index) changed = true;
          output[offset] = index;
        }
      }
      return changed;
    },
  };
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

test("stable order skips sorting and packing, but observes a new pose immediately", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  const output = workspace.output;
  assert.equal(workspace.sort(positions, indices, identity()), true);
  assert.deepEqual([...output], [3, 4, 5, 0, 1, 2]);
  assert.equal(workspace.didSort, true);
  assert.equal(workspace.sort(positions, indices, identity()), false);
  assert.equal(workspace.didSort, false);
  assert.equal(workspace.output, output, "no replacement output array");
  for (let v = 0; v < 3; v += 1) positions[v * 3 + 2] = 5;
  assert.equal(workspace.sort(positions, indices, identity()), true);
  assert.deepEqual([...output], indices);
});

test("shared vertices calculate depth once per invocation", () => {
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 1];
  const positions = Float32Array.from([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
  const workspace = new TransparentTriangleSortWorkspace(indices, 4);
  workspace.sort(positions, indices, identity());
  assert.equal(workspace.vertexDepthCalculations, 4);
  assert.equal(workspace.didSort, false);
  workspace.sort(positions, indices, identity(), false, false);
  assert.equal(workspace.vertexDepthCalculations, 9);
  assert.equal(workspace.didSort, true);
});

test("an in-place topology edit is packed even if permutation remains sorted", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  workspace.sort(positions, indices, identity());
  [indices[3], indices[4]] = [indices[4], indices[3]];
  assert.equal(workspace.sort(positions, indices, identity()), true);
  assert.equal(workspace.didSort, false);
  assert.deepEqual([...workspace.output], [4, 3, 5, 0, 1, 2]);
  assert.deepEqual(indices, [0, 1, 2, 4, 3, 5], "input topology is never mutated");
});

test("ties return to authored triangle-ID order", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  workspace.sort(positions, indices, identity());
  for (let i = 2; i < positions.length; i += 3) positions[i] = 1;
  assert.equal(workspace.sort(positions, indices, identity()), true);
  assert.deepEqual([...workspace.order], [0, 1]);
  assert.deepEqual([...workspace.output], indices);
});

test("camera direction and handedness changes are not cached across calls", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const matrix = identity();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  workspace.sort(positions, indices, matrix);
  matrix[10] = -1;
  workspace.sort(positions, indices, matrix);
  assert.deepEqual([...workspace.output], indices);
  workspace.sort(positions, indices, matrix, true);
  assert.deepEqual([...workspace.output], [3, 4, 5, 0, 1, 2]);
});

test("stamp rollover invalidates all cached vertex depths", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  workspace.sort(positions, indices, identity());
  workspace.generation = 0xffffffff;
  for (let v = 0; v < 3; v += 1) positions[v * 3 + 2] = 5;
  workspace.sort(positions, indices, identity());
  assert.equal(workspace.generation, 1);
  assert.equal(workspace.vertexDepthCalculations, 6);
  assert.deepEqual([...workspace.output], indices);
});

test("32-bit output retains vertex indices above 65535", () => {
  const indices = [0, 1, 2, 65535, 65536, 65537];
  const positions = new Float32Array(65538 * 3);
  for (const v of indices.slice(3)) positions[v * 3 + 2] = 3;
  const workspace = new TransparentTriangleSortWorkspace(indices, 65538);
  workspace.sort(positions, indices, identity());
  assert.ok(workspace.output instanceof Uint32Array);
  assert.deepEqual([...workspace.output], [65535, 65536, 65537, 0, 1, 2]);
  assert.equal(workspace.vertexDepthCalculations, 6, "unused vertices are not evaluated");
});

test("legacy and optimized can switch without resetting the displayed order", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  const reference = referenceSorter(indices, 6);
  for (let frame = 0; frame < 50; frame += 1) {
    positions[2] = Math.sin(frame) * 20;
    assert.equal(workspace.sort(positions, indices, identity(), false, frame % 2 === 0),
      reference.sort(positions, indices, identity()));
    assert.deepEqual(workspace.output, reference.output);
  }
});

test("nonfinite depths take the full reference-sort path", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  const reference = referenceSorter(indices, 6);
  for (const z of [NaN, Infinity, -Infinity, 5, NaN, 1]) {
    positions[2] = z;
    workspace.sort(positions, indices, identity());
    reference.sort(positions, indices, identity());
    assert.deepEqual(workspace.output, reference.output);
    if (!Number.isFinite(z)) assert.equal(workspace.didSort, true);
  }
});

test("floating-point cancellation preserves the original expression and addition order", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = [1e16, 1, -1e16, 1e-12, -1e-12, 1, -0, 0, 0,
    1e16, 2, -1e16, 1e-13, 0, 1, 0, 0, 0];
  const matrix = identity();
  matrix[2] = 1; matrix[6] = 1;
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  const reference = referenceSorter(indices, 6);
  workspace.sort(positions, indices, matrix);
  reference.sort(positions, indices, matrix);
  assert.deepEqual(workspace.order, reference.order);
  assert.deepEqual(workspace.output, reference.output);
});

test("randomized differential test: 3000 changing poses/cameras/topologies", () => {
  const random = rng(0x51cace);
  for (let model = 0; model < 100; model += 1) {
    const vertexCount = 6 + Math.floor(random() * 180);
    const triangleCount = 2 + Math.floor(random() * 400);
    const positions = new Float32Array(vertexCount * 3);
    const indices = Uint32Array.from({length: triangleCount * 3}, () => Math.floor(random() * vertexCount));
    const workspace = new TransparentTriangleSortWorkspace(indices, vertexCount);
    const reference = referenceSorter(indices, vertexCount);
    const matrix = identity();
    for (let frame = 0; frame < 30; frame += 1) {
      if (frame % 3 !== 1) {
        for (let i = 0; i < positions.length; i += 1) positions[i] = (random() - 0.5) * 200;
        matrix[2] = random() - 0.5;
        matrix[6] = random() - 0.5;
        matrix[10] = random() - 0.5;
      }
      if (frame % 7 === 0) indices[Math.floor(random() * indices.length)] = Math.floor(random() * vertexCount);
      const handed = frame >= 15;
      const expected = reference.sort(positions, indices, matrix, handed);
      const changed = workspace.sort(positions, indices, matrix, handed);
      assert.deepEqual(workspace.output, reference.output, `model ${model}, frame ${frame}`);
      assert.deepEqual(workspace.order, reference.order);
      assert.equal(changed, expected, "same GPU-upload decision");
    }
  }
});

test("invalid dimensions fail explicitly", () => {
  assert.throws(() => new TransparentTriangleSortWorkspace([0, 1], 3), TypeError);
  assert.throws(() => new TransparentTriangleSortWorkspace([], -1), TypeError);
  const workspace = new TransparentTriangleSortWorkspace([0, 1, 2], 3);
  assert.throws(() => workspace.sort([], [0, 1, 2], identity()), RangeError);
});

test("small order changes are repaired without a full sort", () => {
  const indices = [0, 1, 2, 3, 4, 5];
  const positions = layers();
  const workspace = new TransparentTriangleSortWorkspace(indices, 6);
  workspace.sort(positions, indices, identity());
  assert.equal(workspace.didSort, true);
  assert.equal(workspace.didFullSort, false);
  assert.deepEqual([...workspace.output], [3, 4, 5, 0, 1, 2]);
});

test("exhausting the repair budget preserves the complete triangle permutation", () => {
  const triangleCount = 40; // Below the coarse-disorder sample threshold.
  const indices = Uint32Array.from({length: triangleCount * 3}, (_, i) => i);
  const positions = new Float32Array(indices.length * 3);
  for (let vertex = 0; vertex < indices.length; vertex += 1) {
    positions[vertex * 3 + 2] = Math.floor(vertex / 3);
  }
  const workspace = new TransparentTriangleSortWorkspace(indices, indices.length);
  const reference = referenceSorter(indices, indices.length);
  workspace.sort(positions, indices, identity());
  reference.sort(positions, indices, identity());
  assert.equal(workspace.didFullSort, true);
  assert.equal(new Set(workspace.order).size, triangleCount);
  assert.deepEqual(workspace.output, reference.output);
});
