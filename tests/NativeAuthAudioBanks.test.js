import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL("../tools/evidence/d000-auth-audio-banks.json", import.meta.url),
));

test("D000 AUTH families resolve only through exact resource clusters", () => {
  assert.equal(evidence.status, "verified");
  assert.deepEqual(
    evidence.mappings.map(({ family }) => family),
    ["D0W0", "AUTH", "BUSS", "DJHN", "YQ14", "YBHN"],
  );
  assert.deepEqual(
    evidence.mappings.map(({ bank }) => bank.path),
    [
      "extracted_files/data/SCENE/01/SOUND/A1_YAMAW.SND",
      "extracted_files/data/SCENE/01/SOUND/A1_TELP.SND",
      "extracted_files/data/SCENE/01/SOUND/A1_BUSNO.SND",
      "extracted_files/data/SCENE/01/SOUND/A1_YANJI.SND",
      "extracted_files/data/SCENE/01/SOUND/N1014_4.SND",
      "extracted_files/data/SCENE/01/SOUND/A1_YOBI.SND",
    ],
  );
  for (const mapping of evidence.mappings) {
    assert.equal(mapping.status, "resource-cluster-and-command-set-verified");
    assert.deepEqual(mapping.absentCommands, []);
    assert.equal(mapping.bank.sha256.length, 64);
    assert.ok(mapping.authFileCount > 0);
    assert.ok(mapping.soundEventCount > 0);
    assert.ok(mapping.authoredCommands.length > 0);
  }
});

test("BUSS resolves every authored event through its exact sound-only bank", () => {
  const mapping = evidence.mappings.find(({ family }) => family === "BUSS");
  assert.equal(mapping.authFileCount, 4);
  assert.equal(mapping.soundEventCount, 42);
  assert.deepEqual(mapping.bank.groups, [{
    descriptorHex: "a904",
    trackCount: 39,
    playableTrackCount: 39,
  }]);
  assert.deepEqual(mapping.absentCommands, []);

  const manifest = JSON.parse(readFileSync(
    new URL("../public/audio/world/buss/manifest.json", import.meta.url),
  ));
  assert.equal(manifest.sources.stream, null);
  assert.deepEqual(manifest.voices, []);
  assert.equal(manifest.sounds.length, 9);
  for (const sound of manifest.sounds) {
    const asset = new URL(`../${sound.asset}`, import.meta.url);
    assert.ok(existsSync(asset));
    assert.equal(
      createHash("sha256").update(readFileSync(asset)).digest("hex"),
      sound.sha256,
    );
  }
});

test("D0W0's 188 events resolve to the native 21-track A1_YAMAW bank", () => {
  const mapping = evidence.mappings.find(({ family }) => family === "D0W0");
  assert.equal(mapping.authFileCount, 12);
  assert.equal(mapping.soundEventCount, 188);
  assert.deepEqual(mapping.bank.groups, [{
    descriptorHex: "a904",
    trackCount: 21,
    playableTrackCount: 21,
  }]);
  assert.equal(mapping.authoredCommands.length, 20);
  assert.deepEqual(
    mapping.resourceCluster.sequenceResources.map(({ value }) => value),
    [
      "seqdata1.bin",
      "seqdata2.bin",
      "seqdata3.bin",
      "seqdata4.bin",
      "seqdata5.bin",
      "seqdata6.bin",
      "seqdata7.bin",
      "seqdata8.bin",
      "seqdata9.bin",
      "seqdataA.bin",
      "seqdataB.bin",
      "seqdataC.bin",
    ],
  );
});

test("D0W0 audio pack ships every authored command with exact provenance", () => {
  const manifest = JSON.parse(readFileSync(
    new URL(
      "../public/audio/world/d0w0/manifest.json",
      import.meta.url,
    ),
  ));
  assert.equal(manifest.schema, "new-yokosuka-aseq-audio-pack-v2");
  assert.equal(manifest.sounds.length, 20);
  assert.equal(manifest.voices.length, 71);
  for (const track of [...manifest.sounds, ...manifest.voices]) {
    const asset = new URL(`../${track.asset}`, import.meta.url);
    assert.ok(existsSync(asset));
    assert.equal(
      createHash("sha256").update(readFileSync(asset)).digest("hex"),
      track.sha256,
    );
  }
});
