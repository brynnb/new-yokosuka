import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {evaluateAuthCamera, evaluateAuthCameraCuts} from "../src/AuthCamera.js";
import {evaluateAuthActor} from "../src/AuthMovement.js";
import chapters from "../play/scripts/AuthoredSceneCatalog.js";
import commandRegistry from "../play/data/server-command-registry.json" with {type:"json"};
import assetManifest from "../src/runtime-assets.generated.json" with {type:"json"};
import originalCameras from "../tools/evidence/d000-event-camera-catalog.json" with {type:"json"};

const id = "s1.d000.enoki-revenge";
const scene = stage => chapters.scenes.find(row => row.id === id + "-" + stage);
const cuts = {intro: [[0,8902],[80,8901],[230,8900],[345,8903],[430,8915]],
  defeat: [[0,8912]], win: [[0,8904],[240,8905],[280,8907],[340,8916],[670,8909],[920,8910],[1020,8911]]};
const approx = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-5, actual + " expected " + expected);
test("DEFB stage plays each original ECAM cut in the translated Dobuita frame", () => {
  for (const [stage, shots] of Object.entries(cuts)) {
    const event = scene(stage);
    assert.ok(event.playThroughFinish);
    for (const [frame, camera] of shots) {
      const source = originalCameras.records.find(r => r.cameraNumber === camera);
      const channels = Object.fromEntries(Object.entries(source.curves).map(([key,curve]) =>
        [key,{times:curve.times,values:curve.values,tangents:curve.slopes}]));
      for (const relative of [0,0.375,1,12.5]) {
        const actual = evaluateAuthCameraCuts(event.cameraCuts,(frame+relative)/30);
        const expected = evaluateAuthCamera({channels},relative/30);
        for (const field of Object.keys(expected)) {
          const offset = field.endsWith("X") ? 10 : field.endsWith("Z") ? 64 : 0;
          approx(actual[field],expected[field]+offset);
        }
      }
    }
  }
});
test("DEFB uses its five source actors, stage marks, and paired grapple motions", () => {
  for (const stage of ["intro","defeat","win"]) {
    const event=scene(stage);
    assert.deepEqual(event.actors.map(a=>a.tag),["AKIR","ENKI","NGSM","TMNY","MYTY"]);
    assert.deepEqual(event.actorDefinitions.map(d=>d.modelCode),["YAA_L","YAB_L","YAC_L","YAE_L"]);
    for (const actor of event.actors) assert.equal(actor.pose.y,5.25);
  }
  const actor=(stage,tag)=>scene(stage).actors.find(a=>a.tag===tag);
  approx(actor("intro","AKIR").pose.x,48.6);
  approx(actor("intro","AKIR").pose.z,86.1);
  assert.equal(actor("win","AKIR").motion.name,"AKI_TATASERU_SENIN_QTE");
  assert.equal(actor("win","ENKI").motion.name,"OTH_TKA_TATASERU_SENIN_QTE");
  assert.equal(actor("win","ENKI").motionCues[0].startSeconds,130/30);
  const held=evaluateAuthActor(actor("win","ENKI").movement,280/30);
  assert.equal(held.rotationY,225);
  approx(held.x,50+Math.cos(Math.PI/4)*(-0.03)+Math.sin(Math.PI/4)*(-0.85));
  const bank = chapters.motionBanks.enokiRevenge;
  assert.equal(assetManifest.assets[bank].sha256,"9ac89b9fe6ddc97a4feb1be39c24434ca691ca89173bdbf486483f28790688c8");
  const files = [bank, ...["YAC","YAE"].flatMap(code =>
    ["_L.CHRM","_textures.bin"].map(suffix => "play/assets/characters/"+code+suffix))];
  for (const name of files) {
    const entry = assetManifest.assets[name];
    assert.ok(entry?.size > 0,name);
    const file = new URL("../"+name, import.meta.url);
    if (fs.existsSync(file)) assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"),entry.sha256,name);
  }
});
test("sixteen E1065 lines have their original timing and registered Story cues", () => {
  const expected={intro:[0,80,200,290,380,440],defeat:[30,90,160],win:[120,280,350,490,650,740,830]};
  const yarn=fs.readFileSync(new URL("../tools/scripting/story-enoki-revenge.yarn",import.meta.url),"utf8");
  const capabilities=new Set(commandRegistry.capabilities.filter(c=>c.kind==="sequence").map(c=>c.identifier));
  const voices=new Set();
  for (const [stage,frames] of Object.entries(expected)) {
    const event=scene(stage);
    assert.deepEqual(event.dialogueCues.map(c=>Math.round(30*c.atSeconds)),frames);
    for (const cue of event.dialogueCues) {
      const command=event.id+".cue-"+cue.voiceId.toLowerCase();
      assert.ok(capabilities.has(command),command);
      assert.ok(yarn.includes('<<play_sequence "'+command+'">>\n{{voice:'+cue.voiceId+'}}'));
      voices.add(cue.voiceId);
    }
  }
  assert.equal(voices.size,16);
});
