import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/jomo-object-phase-callbacks.json",
    import.meta.url,
  ),
));
const manifest = JSON.parse(readFileSync(
  new URL(
    "../public/audio/world/f1omoyaa/drawer-manifest.json",
    import.meta.url,
  ),
));

test("JOMO ATS drawer pack ships the three runtime-labeled native phases", () => {
  assert.equal(
    manifest.schema,
    "new-yokosuka-jomo-drawer-audio-pack-v1",
  );
  assert.equal(
    manifest.source.bankSha256,
    evidence.source.locationBankSha256,
  );
  assert.deepEqual(
    manifest.tracks.map((track) => [
      track.phase,
      track.commandHex,
      track.playbackId,
      track.sampleId,
      track.sampleRate,
    ]),
    [
      ["openingStart", "a9050b00", 8, 31, 11025],
      ["closingStart", "a9050a00", 7, 30, 11025],
      ["closingImpact", "a9056400", 56, 32, 11025],
    ],
  );
  for (const track of manifest.tracks) {
    const asset = new URL(
      `../public/audio/world/f1omoyaa/${track.asset}`,
      import.meta.url,
    );
    assert.ok(existsSync(asset));
    const bytes = readFileSync(asset);
    assert.equal(bytes.length, track.byteLength);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      track.sha256,
    );
  }
});
