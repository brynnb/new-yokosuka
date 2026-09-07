import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/d000-auth-audio-inventory.json",
    import.meta.url,
  ),
));

test("D000 AUTH inventory retains every exact authored sound event", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-d000-auth-audio-inventory-v1",
  );
  assert.ok(evidence.summary.authFileCount > 0);
  assert.ok(evidence.summary.soundBearingAuthFileCount > 0);
  assert.equal(
    evidence.summary.soundEventCount,
    evidence.files.reduce(
      (total, file) => total + file.sounds.length,
      0,
    ),
  );
  assert.equal(
    evidence.summary.playableEventCount + evidence.summary.stopEventCount,
    evidence.summary.soundEventCount,
  );
  for (const file of evidence.files) {
    assert.equal(file.sha256.length, 64);
    for (const sound of file.sounds) {
      assert.match(sound.commandHex, /^(?:a9[0-9a-f]{6}|ffffffff)$/);
      assert.ok(Number.isInteger(sound.frame));
      assert.match(sound.recordOffset, /^0x[0-9a-f]+$/);
    }
  }
});

test("byte-identical AUTH grouping retains all distinct archive paths", () => {
  let duplicateCopies = 0;
  for (const duplicate of evidence.duplicateContent) {
    assert.equal(duplicate.sha256.length, 64);
    assert.ok(duplicate.paths.length > 1);
    assert.equal(new Set(duplicate.paths).size, duplicate.paths.length);
    duplicateCopies += duplicate.paths.length - 1;
  }
  assert.equal(
    evidence.summary.uniqueAuthContentCount,
    evidence.summary.authFileCount - duplicateCopies,
  );
});
