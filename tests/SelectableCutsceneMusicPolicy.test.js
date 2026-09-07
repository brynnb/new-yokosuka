import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = JSON.parse(fs.readFileSync(
  new URL("../tools/evidence/selectable-cutscene-music-policy.json", import.meta.url),
));
const packageSource = fs.readFileSync(
  new URL("../play/cutscenes/nativeCutscenePackages.js", import.meta.url),
  "utf8",
);

function packageDefinition(id, nextId) {
  const start = packageSource.indexOf(`    id: "${id}",`);
  const end = packageSource.indexOf(`    id: "${nextId}",`, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return packageSource.slice(start, end);
}

test("reviewed selectable music policy only emits the proven DRAUTH cue", () => {
  assert.equal(policy.schema, "new-yokosuka-selectable-cutscene-music-policy-v1");
  const drauth = policy.families.find(value => value.packageId === "drauth");
  const drauthDefinition = packageDefinition("drauth", "yq14");
  assert.match(drauthDefinition, new RegExp(`trackId: "${drauth.browserCue.trackId}"`));
  assert.match(drauthDefinition, /startActivity: true/);
  assert.match(drauthDefinition, /loop: false/);
  for (const [packageId, nextId] of [["yq14", "ybhn"], ["djhn", "d0w0"]]) {
    const family = policy.families.find(value => value.packageId === packageId);
    assert.equal(family.classification, "ambient-room-inheritance");
    assert.equal(family.packageCue, null);
    assert.doesNotMatch(packageDefinition(packageId, nextId), /music:\s*Object\.freeze/);
  }
});
