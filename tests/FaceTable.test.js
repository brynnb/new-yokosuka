import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseFaceTable } from "../src/FaceTable.js";

const FIXTURES = Object.freeze({
  YKC: Object.freeze({
    vertices: 311,
    contributions: 428,
    eyeLimits: [2184, -364, 1456, -4369, 4369, -1274],
  }),
  FUK: Object.freeze({
    vertices: 218,
    contributions: 360,
    eyeLimits: [3276, 0, 2548, -4186, 4186, -2548],
  }),
  INE: Object.freeze({
    vertices: 285,
    contributions: 323,
    eyeLimits: [2548, -1274, 1274, -2002, 2002, -1456],
  }),
  IWA: Object.freeze({
    vertices: 285,
    contributions: 268,
    eyeLimits: [3276, -1092, 1456, -4369, 4369, -1274],
  }),
  KOK: Object.freeze({
    vertices: 390,
    contributions: 626,
    eyeLimits: [3276, -364, 2002, -2730, 2002, -2730],
  }),
});

test("native FTBL sections resolve exact per-face vertex weights", () => {
  for (const [faceCode, expected] of Object.entries(FIXTURES)) {
    const table = parseFaceTable(readFileSync(
      `play/assets/introduction/op00/faces/${faceCode}_FTBL.BIN`,
    ), { vertexCount: expected.vertices });
    assert.equal(table.controlCount, 25);
    assert.equal(table.vertexCount, expected.vertices);
    assert.equal(table.contributionCount, expected.contributions);
    assert.equal(table.vertexContributions.length, expected.vertices);
    assert.ok(table.vertexContributions.some(value => value.length > 1));
    assert.deepEqual([
      table.eyeAngleLimits.raw.vertical.maximum,
      table.eyeAngleLimits.raw.vertical.minimum,
      table.eyeAngleLimits.raw.eyes[0].maximum,
      table.eyeAngleLimits.raw.eyes[0].minimum,
      table.eyeAngleLimits.raw.eyes[1].maximum,
      table.eyeAngleLimits.raw.eyes[1].minimum,
    ], expected.eyeLimits);
  }
});
