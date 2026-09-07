import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL("../tools/evidence/jomo-door-audio.json", import.meta.url),
));
const manifest = JSON.parse(readFileSync(
  new URL(
    "../public/audio/world/f1omoyaa/door-manifest.json",
    import.meta.url,
  ),
));

test("JOMO door pack ships all ten table-labeled native phases", () => {
  assert.equal(
    manifest.schema,
    "new-yokosuka-jomo-door-audio-pack-v2",
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
      ["openingStart", "ab020000", 62, 16, 11025],
      ["closingStart", "ab020100", 63, 15, 11025],
      ["openingStart", "ab020200", 64, 20, 11025],
      ["closingStart", "ab020300", 65, 19, 11025],
      ["openingStart", "ab020400", 66, 55, 11025],
      ["closingStart", "ab020500", 67, 54, 11025],
      ["openingStart", "ab020600", 68, 34, 11025],
      ["closingStart", "ab020700", 69, 33, 11025],
      ["openingStart", "ab020800", 70, 22, 11025],
      ["closingStart", "ab020900", 71, 21, 11025],
    ],
  );
  for (const track of manifest.tracks) {
    assert.deepEqual(
      track.models,
      evidence.modelAudioRows
        .filter((row) => row.commands.some(
          ({ commandHex }) => commandHex === track.commandHex,
        ))
        .map(({ model }) => model),
    );
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
