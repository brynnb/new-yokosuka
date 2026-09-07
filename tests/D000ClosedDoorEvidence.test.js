import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const mapinfoPath = "extracted_files/data/SCENE/01/D000/MAPINFO.BIN";
const regionsPath = ".disc-work/dialogue/code-regions.json";
const controlPath = ".disc-work/dialogue/control-flow-index.json";
const evidence = JSON.parse(fs.readFileSync("tools/evidence/d000-door-51-closed-check.json"));
const doors = JSON.parse(fs.readFileSync("tools/evidence/d000-door-logic.json"));

function hasLegacyD000ControlEvidence() {
  if (!fs.existsSync(controlPath)) return false;
  const control = JSON.parse(fs.readFileSync(controlPath));
  return control.maps?.some(item => item.disc === 1 && item.area === "D000") === true;
}

function float32(word) {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32LE(word);
  return bytes.readFloatLE();
}

test("door 51 evidence joins the exact logical selector and dialogue target", {
  skip: (
    !fs.existsSync(mapinfoPath)
    || !fs.existsSync(regionsPath)
    || !hasLegacyD000ControlEvidence()
  ) && "requires the locally generated legacy D000 dialogue evidence",
}, () => {
  const bytes = fs.readFileSync(mapinfoPath);
  const regions = JSON.parse(fs.readFileSync(regionsPath));
  const control = JSON.parse(fs.readFileSync(controlPath));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), evidence.source.mapinfoSha256);
  const door = doors.doors.find(item => item.selector === 51);
  assert.equal(door.visibleStaticDoorIndex, evidence.selection.visibleDoorIndex);
  assert.equal(door.model, evidence.selection.model);
  assert.deepEqual(door.position, evidence.selection.browserPosition);

  const room = control.maps.find(item => item.disc === 1 && item.area === "D000");
  const dispatcher = room.dialoguePathFunctions.find(item => item.fileOffset === "0x75b84");
  const route = dispatcher.directCalls.find(item => item.callFileOffset === evidence.selection.dispatcherCallFileOffset);
  assert.equal(route.targetFileOffset, evidence.selection.regionStartFileOffset);
  assert.equal(bytes.readUInt16LE(0x765e6), 0xe533, "dispatcher no longer compares selector 51");
  assert.deepEqual(
    [0x75326, 0x75328, 0x7532a, 0x7532c, 0x7532e].map(offset => bytes.readUInt16LE(offset)),
    [0x3543, 0x344a, 0x6043, 0x8800, 0x8b09],
    "story sequence <= 202 branch encoding changed",
  );

  const region = regions.regions.find(item => (
    item.disc === 1 && item.area === "D000"
    && item.executableTargetIndex === evidence.selection.targetIndex
    && item.regionStartFileOffset === evidence.selection.regionStartFileOffset
  ));
  assert.ok(region);
  assert.deepEqual(region.voiceIds, [
    "SA1081A002", "SA1081A003", "SA1081A002", "SA1081A005", "SA1081A006",
  ]);
  const motion = region.operations.find(item => item.callFileOffset === "0x7517c");
  assert.equal(motion.operationHex, "0x0028");
  assert.equal(motion.arguments[1].value, evidence.motion.request);
  assert.deepEqual(motion.arguments.slice(2, 6).map(item => float32(item.value)), evidence.motion.parameters);
  assert.deepEqual(
    region.operations.filter(item => item.operationHex === "0x006c").map(item => item.arguments[0].hex),
    ["0x004205a9", "0x004205a9"],
  );

  const function_ = room.dialoguePathFunctions.find(item => item.fileOffset === evidence.selection.regionStartFileOffset);
  const alignment = function_.directCalls.find(item => item.targetFileOffset === "0x6faa0");
  assert.deepEqual(alignment.arguments.slice(0, 3).map(item => item.float32), evidence.alignment.targetNative);
  assert.equal(alignment.arguments[3].value, evidence.alignment.inputDegrees);
  assert.equal(
    evidence.alignment.requestWord,
    Math.trunc(evidence.alignment.inputDegrees / 360 * 65536) & 0xffff,
  );
  for (const [offset, value] of [[0x751ec, 58], [0x7526c, 82], [0x752ec, 150]]) {
    assert.equal(bytes.readFloatLE(offset), value);
  }
  assert.equal(bytes.readUInt32LE(0x75338), 0xf8);
  assert.equal(bytes.readUInt32LE(0x7533c), evidence.branches.storySequenceBoundaryInclusive);
  assert.equal(bytes.readFloatLE(0x75360), evidence.branches.nativeRandomThreshold);
  assert.equal(bytes.readFloatLE(0x753cc), evidence.branches.nativeRandomThreshold);
  assert.equal(bytes.readUInt32LE(0x75428), 0xc8);
});

test("closed-door voice manifest contains packaged source-native WAVs", () => {
  const manifest = JSON.parse(fs.readFileSync("public/audio/dialogue/manifest.json"));
  for (const voiceId of ["SA1081A002", "SA1081A003", "SA1081A005", "SA1081A006"]) {
    const line = manifest.lines.find(item => item.voiceId === voiceId);
    assert.equal(line?.url, `/audio/dialogue/${voiceId}.wav`);
    const wav = fs.readFileSync(`public/audio/dialogue/${voiceId}.wav`);
    assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  }
});
