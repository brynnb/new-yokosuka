import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const json = file => JSON.parse(fs.readFileSync(file, "utf8"));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const evidence = json("tools/evidence/bebf-native-lifecycle.json");
const index = json("play/data/events/nativeEventProgramIndex.generated.json");
const manifest = json("play/assets/hazuki/bebf/manifest.json");
const audio = json("public/audio/world/bebf/manifest.json");

test("the served 01BEDB program plays the three shots selected by the March 31 caller", () => {
  const entry = index.programs.find(program => program.id === "preview-s1-bebf-01");
  const bytes = fs.readFileSync(path.join("public", entry.asset.path));
  assert.equal(digest(bytes), entry.asset.sha256);
  const program = JSON.parse(bytes);
  const entrypoint = program.functions.find(fn => fn.id === program.entryFunction);
  const calls = entrypoint.blocks.flatMap(block => block.actions)
    .filter(action => action.operationId === 0x50 && action.arguments[0].value !== 0xffffffff);
  const order = calls.map(action => action.arguments[0].value);
  assert.deepEqual(order, [60, 61, 62]);
  assert.deepEqual(evidence.owner.playbackBranches.find(b => b.input === 0).slots, order);
  assert.equal(entry.preview.packageId, "bebf");
  assert.equal(entry.preview.worldId, "interior");
  const shots = entry.preview.activities.map(ref => manifest.activities.find(a => a.activityId === ref.activityId));
  assert.deepEqual(shots.map(a => a.actors), [["AKID"], ["SINF"], ["AKID"]]);
  assert.deepEqual(shots.map(a => a.durationFrames), [260, 700, 370]);
  assert.deepEqual(shots.map(a => !!a.browserIsolatedStage), [false, true, false]);
  assert.equal(manifest.ownerAudioCommands.find(c => c.kind === "music").trackId, "bgm129");
});

test("the original available voices, lip cues and effects are bundled and the absent Ryo cue stays silent", () => {
  const present = audio.voices.filter(v => !v.unavailable);
  assert.deepEqual(present.map(v => [v.voiceId, v.speakerId]), [
    ["01BEDBA002", "AKID"], ["01BEDBA003", "AKID"],
    ["01BEDBB001", "SINF"], ["01BEDBB002", "SINF"], ["01BEDBB003", "SINF"],
  ]);
  assert.ok(present.every(v => v.lipSync && v.displayText));
  assert.deepEqual(audio.voices.filter(v => v.unavailable).map(v => [v.voiceId, v.asset]), [["01BEDBA004", undefined]]);
  for (const record of [...manifest.outputs, ...present, ...audio.sounds]) {
    const bytes = fs.readFileSync(record.path || record.asset);
    assert.equal(bytes.byteLength, record.byteLength);
    assert.equal(digest(bytes), record.sha256);
  }
});

for (const [disc, fallback] of [[1, "extracted_files"], [2, "extracted_disc2_v2"], [3, "extracted_disc3_v2"]]) {
  const root = process.env[`SHENMUE_DISC${disc}_EXTRACTED_ROOT`] || fallback;
  const mapPath = path.join(root, "data", "SCENE", `0${disc}`, "JOMO", "MAPINFO.BIN");
  test(`Disc ${disc} March 31 dispatch selects branch zero and records flag 181`, {
    skip: !fs.existsSync(mapPath) && `requires original Disc ${disc} JOMO`,
  }, () => {
    const bytes = fs.readFileSync(mapPath);
    const gate = evidence.owner.bedtimeGate;
    const [start, end] = gate.gateRange.map(Number);
    assert.equal(digest(bytes.subarray(start, end)), gate.gateSha256);
    const word = offset => bytes.readUInt16LE(offset);
    assert.equal(word(0x4fa14), 0xe51f); // compare day with 31
    assert.equal(word(0x4fa24), 0xe603); // compare month with 3
    assert.equal(word(0x4fa64), 181);
    assert.equal(word(0x4fa52), 0xe500); // test that the flag is clear
    assert.equal(word(0x4fa6c), 0xe400); // literal zero passed to BEBF
    assert.equal(0x4fa72 + 4 + bytes.readInt32LE(0x4fadc), Number(evidence.owner.activityInstallerFunction));
    assert.equal(word(0x4fa78), 0xe401); // write one after the owner returns
    assert.equal(word(0x4fae0), 181);
  });
}
