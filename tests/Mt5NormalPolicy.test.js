import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMt5NormalPolicy,
  shouldFlipMt5Normals,
} from "../src/Mt5NormalPolicy.js";

function fakeMesh(name, normals) {
  return {
    name,
    metadata: null,
    getVerticesData: (kind) => kind === "normal" ? normals : null,
    setVerticesData(kind, values, updatable, stride) {
      this.written = { kind, values, updatable, stride };
    },
  };
}

test("experimental normal flips are restricted to two JHD0 foliage types", () => {
  assert.equal(
    shouldFlipMt5Normals("S1_JHD0_MAP01.MT5", "mt5_tex_57"),
    true,
  );
  assert.equal(
    shouldFlipMt5Normals("S1_JHD0_MAP01.MT5", "mt5_tex_63"),
    true,
  );
  assert.equal(
    shouldFlipMt5Normals("S1_JHD0_MAP01.MT5", "mt5_tex_58"),
    false,
  );
  assert.equal(
    shouldFlipMt5Normals("S2_JHD0_MAP01.MT5", "mt5_tex_63"),
    false,
  );
});

test("normal policy reverses only the targeted bush normals", () => {
  const bush = fakeMesh("mt5_tex_63", [0.25, 0.75, -0.5]);
  const neighbor = fakeMesh("mt5_tex_62", [0, 1, 0]);
  const root = {
    getDescendants: () => [bush, neighbor],
  };

  assert.equal(applyMt5NormalPolicy(root, "S1_JHD0_MAP01.MT5"), 1);
  assert.deepEqual(bush.written, {
    kind: "normal",
    values: [-0.25, -0.75, 0.5],
    updatable: false,
    stride: 3,
  });
  assert.equal(bush.metadata.experimentalFlippedNormals, true);
  assert.equal(neighbor.written, undefined);
});
