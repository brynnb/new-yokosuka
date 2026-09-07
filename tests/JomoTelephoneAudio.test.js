import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/jomo-telephone-audio.json",
    import.meta.url,
  ),
));
const sharedManifest = JSON.parse(readFileSync(
  new URL("../public/audio/world/manifest.json", import.meta.url),
));
const jomoManifest = JSON.parse(readFileSync(
  new URL(
    "../public/audio/world/f1omoyaa/manifest.json",
    import.meta.url,
  ),
));

test("JOMO telephone cadence uses an exact shared start/stop pair", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-jomo-telephone-audio-v1",
  );
  assert.equal(evidence.cadenceRoutine.start.commandHex, "ab050400");
  assert.equal(evidence.cadenceRoutine.stop.commandHex, "ab050500");
  assert.equal(evidence.cadenceRoutine.stop.controlOnly, true);
  assert.equal(
    evidence.cadenceRoutine.audibilityWait
      .schedulerYieldWhileCounterAtMost,
    45,
  );
  assert.equal(
    evidence.cadenceRoutine.silenceWait
      .schedulerYieldWhileCounterAtMost,
    45,
  );
  assert.equal(
    evidence.cadenceRoutine.repeatControl
      .constantRepeatInvocation.repeatLimit,
    6,
  );
  assert.deepEqual(
    evidence.cadenceRoutine.directCallers.map(
      ({ callFileOffset }) => callFileOffset,
    ),
    ["0x1f0cc", "0x1f446"],
  );

  const sharedStart = sharedManifest.sharedSystemDirectTracks.find(
    ({ commandHex }) => commandHex === "ab050400",
  );
  const sharedStop = sharedManifest.sharedSystemDirectTracks.find(
    ({ commandHex }) => commandHex === "ab050500",
  );
  assert.equal(sharedStart.controlOnly, false);
  assert.equal(sharedStart.playbackId, 121);
  assert.equal(sharedStop.controlOnly, true);
  assert.equal(sharedStop.asset, null);
  assert.equal(sharedStop.operations[0].playbackId, 121);
  assert.equal(sharedStop.operations[0].rawVolume, 0);
});

test("literal TEL_ route scopes AB06:1 to JOMO's location bank", () => {
  const route = evidence.literalPhoneEvent;
  assert.equal(route.guard.localStateRequired, 30);
  assert.equal(route.sharedStopCommandHex, "ab050500");
  assert.deepEqual(route.locationCue, {
    commandHex: "ab060100",
    bankScope: "map-named-location",
    bank: "F1OMOYAA.SND",
  });
  assert.equal(route.targetTag, "TEL_");
  assert.equal(route.linkedActorTag, "AKIR");
  assert.deepEqual(
    route.orderedOperations.slice(0, 5).map(
      ({ operationHex }) => operationHex,
    ),
    ["0x006c", "0x006c", "0x00f1", "0x00f1", "0x00f1"],
  );
  assert.equal(evidence.runtimePolicy.implemented, false);
  assert.match(evidence.runtimePolicy.reason, /would invent a trigger/i);
});

test("JOMO's exact location cue ships as deterministic WebM Opus", () => {
  assert.equal(
    jomoManifest.schema,
    "new-yokosuka-jomo-telephone-audio-pack-v1",
  );
  assert.equal(jomoManifest.source.bankSha256, evidence.source.locationBankSha256);
  assert.equal(jomoManifest.tracks.length, 1);
  const [track] = jomoManifest.tracks;
  assert.equal(track.commandHex, "ab060100");
  assert.equal(track.compositionHex, "c0df495f80ff");
  assert.equal(track.playbackId, 73);
  assert.equal(track.sampleId, 26);
  assert.equal(track.rawVolume, 95);
  assert.equal(track.sampleRate, 11025);
  const asset = new URL(
    "../public/audio/world/f1omoyaa/ab060100.webm",
    import.meta.url,
  );
  assert.ok(existsSync(asset));
  const bytes = readFileSync(asset);
  assert.equal(bytes.length, track.byteLength);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    track.sha256,
  );
});
