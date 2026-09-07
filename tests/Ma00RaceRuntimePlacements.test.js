import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = JSON.parse(fs.readFileSync("public/models.json", "utf8"));
const manifest = JSON.parse(
  fs.readFileSync("play/data/ma00-race-runtime-placements.json", "utf8"),
);

test("the forklift race retains every captured static modeled fixture", () => {
  assert.equal(manifest.summary.capturedModeledWorldObjectCount, 19);
  assert.equal(manifest.placements.length, 10);
  assert.equal(
    manifest.placements.length
      + manifest.summary.omittedActorTags.length
      + manifest.summary.omittedAlternateStateTags.length,
    manifest.summary.capturedModeledWorldObjectCount + 1,
  );

  const tags = new Set(
    manifest.placements.map((placement) => placement.runtime.objectTag),
  );
  assert.deepEqual(
    [...tags].sort(),
    [
      "DR1C",
      "DR8C",
      "JIH0",
      "JIH2",
      "JIH3",
      "JIH4",
      "SH18",
      "SHT2",
      "SHT3",
      "SHT4",
    ],
  );
});

test("every race fixture is source-backed and available to the browser", () => {
  const available = new Set(catalog);
  for (const placement of manifest.placements) {
    assert.ok(available.has(placement.model), placement.model);
    assert.match(placement.runtime.placementSource, /^runtime-task/);
    assert.equal(placement.position.length, 3);
    assert.ok(placement.position.every(Number.isFinite));
    assert.equal(placement.rotationDegrees.length, 3);
    assert.ok(placement.rotationDegrees.every(Number.isFinite));
  }
});
