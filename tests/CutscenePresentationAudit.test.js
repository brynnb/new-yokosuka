import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { auditSceneObjectCoverage, classifyVoiceCoverage } from "../tools/cutscenes/audit_cutscene_presentation.mjs";

test("voice audit retains playable missing cues while separating absent and off-stage recordings", () => {
  const voices = [
    {voiceId:"missing",speakerId:"ACTR",unavailable:true,unavailableReason:"source absent"},
    {voiceId:"needs-lips",speakerId:"ACTR",lipSync:null},
    {voiceId:"complete",speakerId:"ACTR",lipSync:{frames:[1]}},
    {voiceId:"offstage",speakerId:"OFF_",lipSync:null},
  ];
  assert.deepEqual(classifyVoiceCoverage(voices,new Set(["ACTR"])),{
    unavailableVoices:[{voice:"missing",speaker:"ACTR",sourcePath:undefined,reason:"source absent",resolution:undefined}],
    voicesWithoutLipCues:[{voice:"needs-lips",speaker:"ACTR"}],
  });
});

test("cutscene audit distinguishes absent recordings from playable speech without lip cues", () => {
  const scratch = mkdtempSync("/var/tmp/ny-cutscene-audit-test-");
  try {
    const output = path.join(scratch, "audit.json");
    execFileSync(process.execPath, ["tools/cutscenes/audit_cutscene_presentation.mjs", "--output", output], {
      cwd: process.cwd(), stdio: "pipe", timeout: 60_000,
    });
    const report = JSON.parse(readFileSync(output, "utf8"));
    const jimmy = report.packages.find(pkg => pkg.id === "jimmy-caught");
    const missing = jimmy.unavailableVoices.find(voice => voice.voice === "01JIMB001");
    assert.ok(missing?.reason);
    assert.equal(report.packages.find(pkg => pkg.id === "op00-opening").unavailableVoices
      .find(voice => voice.voice === "A0114A015")?.resolution, "absent-from-pinned-native-stream");
    assert.equal(jimmy.voicesWithoutLipCues.some(voice => voice.voice === "01JIMB001"), false);
    assert.equal(report.summary.unavailableVoiceCues,
      report.packages.reduce((total, pkg) => total + pkg.unavailableVoices.length, 0));
    assert.equal(report.summary.playableVoicesWithoutLipCues,
      report.packages.reduce((total, pkg) => total + pkg.voicesWithoutLipCues.length, 0));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("scene-object audit checks packaged props and scene-owned attachments without flagging borrowed scenery", () => {
  const pkg = {
    assets: { "prop.bin": "/prop.bin", "texture.bin": "/texture.bin" },
    environment: {
      sceneObjects: {
        PROP: { assetPath: "prop.bin", textureAssetPath: "texture.bin" },
        DOOR: { objectTag: "door" },
        LITE: { referenceOnly: true, assetPath: "unused.bin" },
      },
      attachedObjects: { PROP: { sceneObject: true }, DOOR: { sceneObject: true } },
    },
  };
  assert.deepEqual(auditSceneObjectCoverage(pkg, () => true), []);
  delete pkg.assets["texture.bin"];
  pkg.environment.attachedObjects.MISS = { sceneObject: true };
  pkg.environment.attachedObjects.LITE = { sceneObject: true };
  assert.deepEqual(auditSceneObjectCoverage(pkg, file => file !== "prop.bin"), [
    { actor: "PROP", path: "prop.bin", kind: "not-restored-locally" },
    { actor: "PROP", path: "texture.bin", kind: "not-bundled" },
    { actor: "MISS", kind: "missing-scene-object" },
    { actor: "LITE", kind: "missing-scene-object" },
  ]);
});

test("scene-object audit also checks standalone attached assets", () => {
  const pkg = { assets: {}, environment: { attachedObjects: {
    ITEM: { assetPath: "item.bin", textureAssetPath: "item-textures.bin" },
  } } };
  assert.deepEqual(auditSceneObjectCoverage(pkg, () => false), [
    { actor: "ITEM", path: "item.bin", kind: "not-bundled" },
    { actor: "ITEM", path: "item.bin", kind: "not-restored-locally" },
    { actor: "ITEM", path: "item-textures.bin", kind: "not-bundled" },
    { actor: "ITEM", path: "item-textures.bin", kind: "not-restored-locally" },
  ]);
});
