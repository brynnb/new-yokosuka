import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = JSON.parse(fs.readFileSync("public/models.json", "utf8"));
const manifest = JSON.parse(
  fs.readFileSync("play/data/ma00-race-scheduled-actors.json", "utf8"),
);

test("Mark remains a source-backed race actor instead of frozen scenery", () => {
  const [mark] = manifest.actors;
  assert.equal(mark.actorCode, "MGDM");
  assert.equal(mark.model, "S3_M3FB_FONS505G.MT5");
  assert.deepEqual(mark.position, [66, 0, 109.5]);
  assert.deepEqual(mark.rotationDegrees, [0, 90, 0]);
  assert.ok(catalog.includes(mark.model));
  assert.equal(mark.activeCondition, "forklift-race-event");
});
