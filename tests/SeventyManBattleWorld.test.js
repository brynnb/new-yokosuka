import assert from "node:assert/strict";
import test from "node:test";
import { WORLDS } from "../play/config/worlds.js";

test("Combat Practice uses the MFBT identity and selected practice spawn", () => {
  const world = WORLDS.mfbt;

  assert.equal(world.id, "mfbt");
  assert.equal(world.nativeArea, "MFBT");
  assert.equal(world.prefix, "S3_MFBT");
  assert.deepEqual(
    [world.spawn.x, world.spawn.y, world.spawn.z],
    [-23.4, 0, 65.8],
  );
  assert.equal(world.yaw, Math.PI / 4);
  assert.deepEqual(world.placements, []);
});
