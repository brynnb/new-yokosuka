import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const mapinfoPath = "extracted_files/data/SCENE/01/D000/MAPINFO.BIN";
const motionPath = "extracted_files/data/MOTION/MOTION.BIN";
const evidence = JSON.parse(fs.readFileSync("tools/evidence/d000-door-1-closed-check.json"));
const doors = JSON.parse(fs.readFileSync("tools/evidence/d000-door-logic.json"));

test("door 1 evidence retains the exact selector, native branches, and side routes", {
  skip: !fs.existsSync(mapinfoPath) && "requires the locally extracted Disc 1 D000 MAPINFO",
}, () => {
  // Read extraction-only evidence after the source-dependent skip gate.
  const regions = JSON.parse(fs.readFileSync(".disc-work/dialogue/code-regions.json"));
  const bytes = fs.readFileSync(mapinfoPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), evidence.source.mapinfoSha256);
  const door = doors.doors.find(item => item.selector === 1);
  assert.equal(door.mappedStaticDoorIndex, evidence.selection.mappedStaticDoorIndex);
  assert.equal(door.visibleStaticDoorIndex, evidence.selection.visibleDoorIndex);
  assert.equal(door.usesInvisibleProxy, true);
  assert.equal(door.model, evidence.selection.model);
  assert.deepEqual(door.position, evidence.selection.browserPosition);

  const region = regions.regions.find(item => (
    item.disc === 1 && item.area === "D000"
    && item.executableTargetIndex === evidence.selection.targetIndex
    && item.regionStartFileOffset === evidence.selection.regionStartFileOffset
  ));
  assert.ok(region);
  assert.deepEqual(region.voiceIds, [
    "SA1080A003", "SA1080A002", "SA1080A004",
    "SA1080A005", "SA1080A004", "SA1080A006",
  ]);
  assert.deepEqual(
    region.operations.filter(item => item.operationHex === "0x0051")
      .map(item => item.arguments.map(argument => argument.value)),
    [[11, 170], [11, 170]],
  );
  assert.equal(bytes.readUInt16LE(0x7667e), 0xe501, "dispatcher no longer compares selector 1");
  assert.equal(bytes.readUInt32LE(0x74ab8), 0xc8);
  assert.equal(bytes.readUInt16LE(0x74a9c), 0xe50a, "morning boundary changed");
  assert.equal(bytes.readUInt16LE(0x74bfa), 0xe515, "night boundary changed");

  assert.equal(bytes.readFloatLE(0x74f90), evidence.alignment.whenNativeActorXIsPositive.targetNative[0]);
  assert.equal(bytes.readFloatLE(0x74f8c), evidence.alignment.whenNativeActorXIsPositive.targetNative[1]);
  assert.equal(bytes.readFloatLE(0x74f88), evidence.alignment.whenNativeActorXIsPositive.targetNative[2]);
  assert.equal(bytes.readUInt32LE(0x74f84), evidence.alignment.whenNativeActorXIsPositive.requestDword);
  assert.equal(bytes.readFloatLE(0x75068), evidence.alignment.otherwise.targetNative[0]);
  assert.equal(bytes.readUInt32LE(0x7505c), evidence.alignment.otherwise.requestDword);
  assert.equal(
    Math.trunc(evidence.alignment.inputDegrees / 360 * 65536) & 0xffff,
    evidence.alignment.requestWord,
  );
});

test("door 1 motion request resolves to the exact source sequence", {
  skip: !fs.existsSync(motionPath) && "requires the locally extracted Disc 1 MOTION.BIN",
}, async () => {
  const { MotnLoader } = await import("../src/MotnLoader.js");
  const motion = MotnLoader.parse(fs.readFileSync(motionPath), {
    sequenceIndices: [evidence.source.playerMotionIndex],
  }).sequences[0];
  assert.equal(motion.index, evidence.source.playerMotionIndex);
  assert.equal(motion.name, evidence.source.playerMotionName);
  assert.equal(motion.index + 1, evidence.source.playerMotionRequest);
});

test("closed-door voice manifest contains the five used SA1080 lines", () => {
  const manifest = JSON.parse(fs.readFileSync("public/audio/dialogue/manifest.json"));
  for (const voiceId of ["SA1080A002", "SA1080A003", "SA1080A004", "SA1080A005", "SA1080A006"]) {
    const line = manifest.lines.find(item => item.voiceId === voiceId);
    assert.equal(line?.url, `/audio/dialogue/${voiceId}.wav`);
    const wav = fs.readFileSync(`public/audio/dialogue/${voiceId}.wav`);
    assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  }
});
