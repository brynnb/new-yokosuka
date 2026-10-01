import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const indexPath = new URL(
  "../play/data/events/nativeEventProgramIndex.generated.json",
  import.meta.url,
);
const index = JSON.parse(readFileSync(indexPath));
const corpus = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));

function assetFile(path) {
  assert.match(path, /^\/data\/native-event-programs\/[0-9a-f]{64}\.json$/);
  return new URL(`../public${path}`, import.meta.url);
}

test("production event index is compact and contains no executable closures", () => {
  assert.equal(index.schema, "new-yokosuka-native-event-program-index-v1");
  assert.deepEqual(index.programs.map(program => program.id), corpus.programs.map(program => program.id));
  assert.equal(new Set(index.programs.map(program => program.id)).size, index.programs.length);
  for (const id of ["preview-s1-op00-mail", "preview-s1-op00-dream"]) {
    assert.ok(index.programs.some(program => program.id === id), `${id} is missing`);
  }
  assert.ok(statSync(indexPath).size < 100_000);
  assert.ok(index.programs.every(program => !Object.hasOwn(program, "functions")));

  const playSource = readFileSync(new URL("../play/events/NativeEventAssembly.js", import.meta.url), "utf8");
  assert.match(playSource, /nativeEventProgramIndex\.generated\.json/);
  assert.doesNotMatch(playSource, /nativeEventPrograms\.generated\.json/);
});

test("every indexed program has one exact content-addressed runtime asset", () => {
  const paths = new Set();
  for (const descriptor of index.programs) {
    assert.equal(paths.has(descriptor.asset.path), false);
    paths.add(descriptor.asset.path);
    const bytes = readFileSync(assetFile(descriptor.asset.path));
    assert.equal(bytes.byteLength, descriptor.asset.byteLength);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      descriptor.asset.sha256,
    );
    const program = JSON.parse(bytes);
    assert.equal(program.id, descriptor.id);
    assert.equal(program.area, descriptor.area);
    assert.equal(program.entryFunction, descriptor.entryFunction);
    assert.ok(Array.isArray(program.functions));
    assert.ok(program.functions.length > 0);
    for (const key of [
      "directEntries",
      "entryInvocation",
      "scriptedInteractions",
      "automaticEvents",
      "roomControllers",
      "preview",
    ]) {
      assert.deepEqual(descriptor[key], program[key]);
    }
  }
});
