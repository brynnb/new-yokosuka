import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const json = path => JSON.parse(readFileSync(path, "utf8"));
const audit = json("tools/evidence/selectable-cutscene-music-audit.json");
const programs = json("play/data/events/nativeEventPrograms.generated.json");
const discovery = json("tools/evidence/player-cutscene-owner-discovery.json");
const banks = json("tools/evidence/native-audio-bank-inventory.json");
const smoke = json("tools/evidence/selectable-cutscene-smoke.json");

function family(resource) {
  return audit.families.find(value => value.resource === resource);
}

function program(id) {
  return programs.programs.find(value => value.id === id);
}

function actionAt(nativeProgram, callFileOffset) {
  return nativeProgram.functions
    .flatMap(fn => fn.blocks)
    .flatMap(block => block.actions)
    .find(action => action.callFileOffset === callFileOffset);
}

function argumentValues(action) {
  return action.arguments.map(argument => argument.value);
}

function bankForSource(path) {
  return banks.banks.find(bank => bank.sources.some(source => source.path === path));
}

function selector(id) {
  return smoke.scenes.find(scene => scene.cutsceneId === id);
}

test("HOUO exact owner and event bank author no cutscene music", () => {
  const evidence = family("HOUO");
  const owner = discovery.candidates
    .flatMap(value => value.scenes || [])
    .find(value => value.id === "houo-phoenix-mirror");
  assert.equal(evidence.classification, "native-owner-silent-during-activity");
  assert.deepEqual(owner.playFunctions, [evidence.owner.activityPlayFunction]);
  assert.deepEqual(owner.installCallOffsets, [evidence.owner.activityInstallCallFileOffset]);
  assert.deepEqual(evidence.owner.branchSoundCommandCallOffsets, []);
  assert.deepEqual(evidence.owner.playFunctionSoundCommandCallOffsets, []);
  const bank = bankForSource(evidence.soundBank.path);
  assert.equal(bank.sha256, evidence.soundBank.sha256);
  assert.deepEqual(bank.families, ["event"]);
  assert.equal(bank.songTrackCount, 0);
  assert.equal(selector("S1-HOUO-01").coverage.musicTrackCount, 0);
});

test("HIHY restores BGM009 only after releasing its activity", () => {
  const evidence = family("HIHY");
  const nativeProgram = program(evidence.owner.programId);
  assert.equal(nativeProgram.mapinfoSha256, evidence.owner.mapinfoSha256);
  const release = actionAt(nativeProgram, evidence.owner.activityReleaseCallFileOffset);
  const reconcile = actionAt(
    nativeProgram,
    evidence.owner.postActivityBankReconcileCallFileOffset,
  );
  const start = actionAt(nativeProgram, evidence.owner.postActivityMusicCommandCallFileOffset);
  assert.equal(release.semanticId, "native-operation-013e-resource-slot-control");
  assert.equal(reconcile.semanticId, "native-sound-bank-slot-reconcile");
  assert.equal(start.semanticId, "sound-command-dispatch");
  assert.deepEqual(argumentValues(start), [0x3fa8, 0, 0]);
  assert.ok(Number.parseInt(release.callFileOffset, 16) < Number.parseInt(start.callFileOffset, 16));
  const bank = bankForSource("SCENE/01/SOUND/BGM009.SND");
  assert.deepEqual(bank.families, ["background-music"]);
  assert.equal(bank.sha256, evidence.postActivityRoomRestoration.bankSha256);
  assert.equal(selector("S1-HIHY-01").coverage.musicTrackCount, 0);
});

test("SAKR loads only an event bank and never starts an authored song", () => {
  const evidence = family("SAKR");
  const nativeProgram = program(evidence.owner.programId);
  assert.equal(nativeProgram.mapinfoSha256, evidence.owner.mapinfoSha256);
  for (const expected of evidence.owner.preActivitySoundCommands) {
    const action = actionAt(nativeProgram, expected.callFileOffset);
    assert.equal(action.semanticId, "sound-command-dispatch");
    assert.deepEqual(argumentValues(action).slice(1), expected.exactArguments);
  }
  assert.deepEqual(evidence.owner.musicStartCallOffsets, []);
  const bank = bankForSource(evidence.soundBank.path);
  assert.equal(bank.sha256, evidence.soundBank.sha256);
  assert.deepEqual(bank.families, ["event"]);
  assert.equal(bank.songTrackCount, 0);
  assert.equal(selector("S1-SAKR-01").coverage.musicTrackCount, 0);
});

test("audited native silence is explicit package metadata, not an unresolved review", () => {
  assert.deepEqual(audit.summary, {
    familyCount: 3,
    missingBindingCount: 0,
    authoredSilentDuringActivityCount: 3,
    postActivityRoomRestorationCount: 1,
  });
  for (const evidence of audit.families) {
    for (const selectorId of evidence.selectorIds) {
      assert.deepEqual(selector(selectorId).fidelityFindings.find(finding => (
        finding.kind === "native-owner-authors-no-cutscene-music"
      )), {
        kind: "native-owner-authors-no-cutscene-music",
        severity: "informational",
        resource: evidence.resource,
        evidence: "tools/evidence/selectable-cutscene-music-audit.json",
      });
    }
  }
});
