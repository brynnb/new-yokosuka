import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  extractNativeAseqCallbackPresentation,
  extractNativeAseqCallbackHandPresentation,
  extractNativeHandPoseOperation,
  extractNativeHandComponentTimeline,
  extractNativeAseqTelephonePresentation,
} from "../tools/lib/NativeAseqCallbackPresentation.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../tools/lib/NativeAseqCallbackObjectPresentation.mjs";

const tattooMap = path.resolve(process.env.SHENMUE_DISC1_EXTRACTED_ROOT || "extracted_files", "data/SCENE/01/TATQ/MAPINFO.BIN");
const mirrorMap = path.resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2", "data/SCENE/02/MS8A/MAPINFO.BIN");
const homeMap = path.resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2", "data/SCENE/02/JOMO/MAPINFO.BIN");
for(const [name,disc,frames,expected]of [
  ["jimmy",2,1600,[[160,"attach","FUKU",3],[170,"attach","FUKU",3],[521,"attach","AKIR",4],[1135,"detach",undefined,undefined]]],
  ["nozomi",3,2265,[[790,"attach","AKIR",3],[2018,"detach",undefined,undefined]]],
]){
  const map=path.resolve(process.env[`SHENMUE_DISC${disc}_EXTRACTED_ROOT`]||`extracted_disc${disc}_v2`,`data/SCENE/0${disc}/JOMO/MAPINFO.BIN`);
  test(`${name} telephone uses original pickup, handover and hangup frames`,{skip:!fs.existsSync(map)&&"requires original disc extraction"},()=>{
    const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url)));
    const evidence=read(`../tools/evidence/${name}-telephone-callback-ir.json`),bytes=fs.readFileSync(map);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),evidence.source.mapinfoSha256);
    const input={bytes,nativeFunction:evidence.function,durationFrames:frames,
      bindingEvidence:read("../tools/evidence/tagged-telm-control-operation-evidence.json")};
    const result=extractNativeAseqTelephonePresentation(input);
    assert.deepEqual(result.nativeTelephoneCues.map(c=>[c.frame,c.action,c.receiver?.actorCode,c.receiver?.bindingIndex]),expected);
    const manifest=read(`../play/assets/hazuki/${name}-${name==="jimmy"?"morning":"night"}-call/manifest.json`);
    assert.deepEqual(manifest.activities[0].nativeTelephoneCues,result.nativeTelephoneCues);
    const first=result.nativeTelephoneCues[0].receiver;
    assert.deepEqual(first.controllerRotationWords,name==="jimmy"?[30208,38034,26203]:[18379,38580,26749]);
    assert.equal(first.handCorrection.translation[0],0.07499999552965164);
    assert.ok(Object.keys(manifest.handAssets).includes("AKIR"));
    const broken=structuredClone(evidence.function);
    broken.blocks.flatMap(b=>b.actions).find(a=>a.operationHex==="0x00f1"&&a.arguments[0].value===0).arguments[3].value=2;
    assert.throws(()=>extractNativeAseqTelephonePresentation({...input,nativeFunction:broken}),/selector/);
  });
}
test("home callbacks compile native hands, expression durations, bankbook hinge and piggy-bank transfer", {
  skip: !fs.existsSync(homeMap) && "requires original Disc 2 JOMO extraction",
}, () => {
  const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url)));
  const evidence=read("../tools/evidence/home-ticket-callback-ir.json"),bytes=fs.readFileSync(homeMap);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),evidence.source.mapinfoSha256);
  const functions=[evidence.function,...evidence.supportingFunctions];
  for(const [name,id]of [["post-chen-home","0x70b18"],["bank-savings","0x71190"],["travel-family","0x7353c"],["fuku-travel-funds","0x71f20"]]){
    const manifest=read(`../play/assets/hazuki/${name}/manifest.json`),activity=manifest.activities[0];
    const fn=functions.find(f=>f.id===id),input={bytes,nativeFunction:fn,callbackFunction:Number(id)};
    const hands=extractNativeAseqCallbackHandPresentation(input);
    assert.deepEqual(hands.nativeHandComponentLimitations,[]);
    for(const key of ["nativeHandPoseCues","nativeBodyHandPoseCues","nativeHandComponentCues"])
      assert.deepEqual(activity[key],hands[key].filter(c=>c.frame<activity.durationFrames));
    const faceFn={...fn,blocks:fn.blocks.map(b=>({...b,actions:b.actions.filter(a=>a.semanticId!=="resolved-object-face-record-request")}))};
    const presentation=extractNativeAseqCallbackPresentation({...input,nativeFunction:faceFn,durationFrames:activity.durationFrames+1});
    assert.deepEqual(activity.nativeFaceClipCues,presentation.nativeFaceClipCues.filter(c=>c.frame<activity.durationFrames));
    assert.equal(activity.nativeFaceClipCues.every(c=>c.durationNativeTicks>=1),true);
    if(name==="post-chen-home"){
      assert.deepEqual(activity.nativeFaceClipCues.map(c=>[c.frame,c.actorTag,c.durationNativeTicks]),[[0,"AKIR",1],[0,"FUKU",1],[250,"FUKU",10]]);
      const changed=structuredClone(faceFn);
      changed.blocks.flatMap(b=>b.actions).find(a=>a.semanticId==="actor-face-clip-control-write").arguments[3].value=0xffff;
      assert.equal(extractNativeAseqCallbackPresentation({...input,nativeFunction:changed,durationFrames:651}).nativeFaceClipCues[0].durationNativeTicks,1);
    }
  }
  const bank=read("../play/assets/hazuki/bank-savings/manifest.json");
  assert.deepEqual(bank.attachedObjects.BANK.attachments,[],"AUTH, not a guessed wrist grip, owns the book trajectory");
  assert.deepEqual(bank.attachedObjects.BANK.nodeTransforms.map(c=>[c.frame,c.nodeKey,c.rotationRaw]),[[0,152,[0,0,0]],[270,152,[-23718,0,0]],[665,152,[0,0,0]]]);
  const funds=read("../play/assets/hazuki/fuku-travel-funds/manifest.json");
  assert.deepEqual(funds.attachedObjects.PIG_.attachments.map(c=>[c.frame,c.action,c.parentActorTag,c.controlId]),[[345,"attach","FUKU",18],[890,"attach","AKIR",12],[1134,"detach",undefined,undefined]]);
  assert.equal(funds.sceneObjects.PIG_.objectTag,"PIG_");
  assert.deepEqual(Object.keys(funds.handAssets).sort(),["AKIR","FUKU"]);
});

test("mirror callbacks retain original hands and grips without the guessed permanent attachment", {
  skip: !fs.existsSync(mirrorMap) && "requires original Disc 2 MS8A extraction",
}, () => {
  const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
  const evidence=read("../tools/evidence/mirror-meeting-callback-ir.json");
  const manifest=read("../play/assets/harbor/mirror-meeting/manifest.json");
  const bytes=fs.readFileSync(mirrorMap),functions=[evidence.function,...evidence.supportingFunctions];
  assert.equal(createHash("sha256").update(bytes).digest("hex"),evidence.source.mapinfoSha256);
  for(const [slot,id]of ["0xaf0","0x10f4","0x160c","0x200c","0x272c","0x2d8c","0x38b4","0x3e14"].entries()){
    const input={bytes,functions,nativeFunction:functions.find(f=>f.id===id),callbackFunction:Number(id),activitySlot:slot};
    const hands=extractNativeAseqCallbackHandPresentation(input);
    assert.deepEqual(hands.nativeHandComponentLimitations,[]);
    assert.deepEqual(manifest.activities[slot].nativeHandPoseCues,hands.nativeHandPoseCues);
    assert.equal(hands.nativeHandCleanupHelpers.length,1);
    assert.equal(hands.nativeBodyHandPoseCues.every(c=>c.channel===2&&c.frame===0),true);
  }
  assert.deepEqual(manifest.attachedObjects.KAGA.attachments.map(c=>[c.activitySlot,c.frame,c.action,c.parentActorTag,c.controlId]),[
    [2,0,"attach","CHAI",12],[3,0,"detach",undefined,undefined],
    [6,723,"attach","AKIR",18],[6,2262,"detach",undefined,undefined],
    [7,0,"attach","AKIR",18],[7,3630,"detach",undefined,undefined],
  ]);
  assert.equal(manifest.attachedObjects.KAGA.attachments.every(c=>c.callFileOffset),true);
  assert.equal(manifest.sceneObjects.KAGA.source.model,"PNX02H6G");
});
const bunkadoMap = path.resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2", "data/SCENE/02/DKTY/MAPINFO.BIN");
test("Bunkado source guards retain exact grip transfers and reject a visual skip branch", {
  skip: !fs.existsSync(bunkadoMap) && "requires original Disc 2 DKTY extraction",
}, () => {
  const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
  const evidence = read("../tools/evidence/bunkado-handguard-callback-ir.json");
  const manifest = read("../play/assets/dobuita/bunkado-handguard/manifest.json");
  const bytes = fs.readFileSync(bunkadoMap), functions = [evidence.function, ...evidence.supportingFunctions];
  assert.equal(createHash("sha256").update(bytes).digest("hex"), evidence.source.mapinfoSha256);
  for (const [slot,id] of ["0x18da8","0x19edc","0x187d4"].entries()) {
    const input = { bytes, functions, callbackFunction:Number(id), nativeFunction:functions.find(f=>f.id===id),
      activitySlot:slot, durationFrames:manifest.activities[slot].durationFrames };
    const hands = extractNativeAseqCallbackHandPresentation(input);
    assert.deepEqual(hands.nativeHandComponentLimitations, []);
    for (const key of ["nativeHandPoseCues","nativeBodyHandPoseCues","nativeHandComponentCues"])
      assert.deepEqual(manifest.activities[slot][key], hands[key]);
    const grips = extractNativeAseqCallbackObjectPresentation({...input,objectTags:["TUBA"]});
    assert.deepEqual(grips.attachedObjectCues.map(c=>[c.frame,c.action,c.parentActorTag]),[
      [[1630,"attach","OISI"],[2760,"detach",undefined],[2760,"attach","AKIR"]],
      [[0,"attach","AKIR"],[590,"detach",undefined]],
      [[0,"attach","AKIR"],[780,"detach",undefined]],
    ][slot]);
    if (slot === 2) {
      const altered = structuredClone(input.nativeFunction);
      altered.blocks.find(b=>b.id==="0x18d84").actions[0].semanticId="resolved-object-runtime-flag";
      assert.throws(()=>extractNativeAseqCallbackHandPresentation({...input,nativeFunction:altered}), /no governing ASEQ frame/);
    }
  }
  assert.equal(manifest.sceneObjects.TOKE.model,"TOKT203G");
  assert.equal(manifest.handAssets.OISI.bodyModelCode,"KOT_L");
  assert.equal(manifest.attachedObjects.TUBA.sceneObject,true);
});

test("tattoo introduction retains original detailed grips and later body-hand request", {
  skip: !fs.existsSync(tattooMap) && "requires original Disc 1 TATQ extraction",
}, () => {
  const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
  const cb = read("../tools/evidence/tatq-introduction-callback-ir.json"), bytes = fs.readFileSync(tattooMap);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), cb.source.mapinfoSha256);
  const hands = extractNativeAseqCallbackHandPresentation({ bytes, nativeFunction: cb.function,
    callbackFunction: 0x19fb4, activitySlot: 0, durationFrames: 1780 });
  assert.deepEqual(hands.nativeHandPoseCues.map(c => [c.frame,c.actorTag,c.side,c.poseTableOffset]),
    [[1,"HORS","left","0x2376c"],[1,"HORS","right","0x23850"],[1,"TONY","left","0x2376c"]]);
  assert.deepEqual(hands.nativeBodyHandPoseCues.map(c => [c.frame,c.actorTag,c.channel,c.targetIndex]), [[60,"HORS",0,3]]);
  const manifest = read("../play/assets/dobuita/tattoo-introduction/manifest.json");
  for (const key of ["nativeHandPoseCues","nativeBodyHandPoseCues","nativeHandComponentCues"])
    assert.deepEqual(manifest.activities[0][key], hands[key]);
  assert.deepEqual(manifest.nativeHandPoseTables, hands.nativeHandPoseTables);
  assert.deepEqual(Object.keys(manifest.handAssets).sort(), ["HORS","TONY"]);
});

const allowanceMap = path.resolve(process.env.SHENMUE_DISC1_EXTRACTED_ROOT || "extracted_files", "data/SCENE/01/JOMO/MAPINFO.BIN");
test("tattoo aftermath compiles the complete held wrist vector and bounded adjustment", {
  skip: !fs.existsSync(tattooMap) && "requires original Disc 1 TATQ extraction",
}, () => {
  const callback = JSON.parse(fs.readFileSync(new URL("../tools/evidence/tatq-aftermath-callback-ir.json", import.meta.url)));
  const input = { bytes: fs.readFileSync(tattooMap), callbackFunction: 0x1a69c, nativeFunction: callback.function };
  assert.equal(createHash("sha256").update(input.bytes).digest("hex"), callback.source.mapinfoSha256);
  const result = extractNativeAseqCallbackHandPresentation(input);
  assert.deepEqual(result.nativeHandComponentLimitations, []);
  const cues = result.nativeHandComponentCues;
  assert.equal(cues.length, 35);
  assert.deepEqual(cues.filter(c => [0, 510, 539, 580].includes(c.frame)).map(c => [c.frame, c.rotationRaw]),
    [[0, [-1092, 3640, 0]], [510, [3567, 443, 5115]], [539, [6728, -2544, 5637]], [580, [10376, -2002, 3094]]]);
  assert.deepEqual(cues.filter(c => c.frame >= 510 && c.frame < 580).map(c => c.frame),
    Array.from({ length: 30 }, (_, i) => i + 510));
  const dynamic = structuredClone(callback.function);
  const block = dynamic.blocks.find(b => b.id === "0x1ac0c");
  block.actions[0].expression.right = { kind: "frame-field", offset: 40, width: 4 };
  const omitted = extractNativeAseqCallbackHandPresentation({ ...input, nativeFunction: dynamic });
  assert.equal(omitted.nativeHandComponentCues.length, 0, "unknown feedback must not leave a partial frozen wrist lane");
  assert.ok(omitted.nativeHandComponentLimitations.some(c => c.callFileOffset === "0x1ac6a"));
  const escaped = structuredClone(callback.function);
  escaped.blocks[0].actions.push({ kind: "engineOperation", semanticId: "resolved-object-component-read",
    callFileOffset: "0x1a6d2", arguments: [{ kind: "frame-address", offset: 0 }] });
  const operation = escaped.blocks.flatMap(b => b.actions).find(a => a.callFileOffset === "0x1ac6a");
  assert.throws(() => extractNativeHandComponentTimeline({ ...input, nativeFunction: escaped, operation }), /dynamic native frame-vector/);
  const badClock = structuredClone(callback.function);
  badClock.blocks.find(b => b.id === "0x1aff4").actions[0].expression.right.value = 2;
  const unclocked = extractNativeAseqCallbackHandPresentation({ ...input, nativeFunction: badClock });
  assert.equal(unclocked.nativeHandComponentCues.length, 0, "an arbitrary counter is not an ASEQ frame clock");
});

test("original allowance callback recovers indexed-clock handover without a frame override", {
  skip: !fs.existsSync(allowanceMap) && "requires original Disc 1 JOMO extraction",
}, () => {
  const bytes = fs.readFileSync(allowanceMap);
  const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
  const callback = read("../tools/evidence/first-allowance-native-callback-ir.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), callback.source.mapinfoSha256);
  const input = { bytes, callbackFunction: 0x634ec, nativeFunction: callback.function,
    activitySlot: 35, durationFrames: 1696 };
  const object = extractNativeAseqCallbackObjectPresentation(input);
  assert.deepEqual(object.attachedObjectCues.map(cue => [cue.frame, cue.action, cue.parentActorTag, cue.controlId]),
    [[775, "attach", "INE_", 18], [1035, "detach", undefined, undefined], [1696, "detach", undefined, undefined]]);
  const manifest = read("../play/assets/hazuki/first-allowance/manifest.json");
  assert.deepEqual(manifest.attachedObjects.KOZU.attachments.map(({ activityId, ...cue }) => cue), object.attachedObjectCues);
  const presentation = extractNativeAseqCallbackPresentation(input);
  for (const key of ["nativeHandPoseCues", "nativeBodyHandPoseCues", "nativeHandComponentCues", "nativeHandComponentLimitations"]) {
    // The pack omits an empty limitations field, unlike executable cue lists.
    assert.deepEqual(key === "nativeHandComponentLimitations" ? manifest.activities[0][key] || [] : manifest.activities[0][key], presentation[key], key);
  }
  assert.deepEqual(manifest.nativeHandPoseTables, presentation.nativeHandPoseTables);
  assert.deepEqual(presentation.nativeHandComponentLimitations, []);
  const handover = presentation.nativeHandComponentCues.filter(c => c.callFileOffset === "0x63734");
  assert.deepEqual(handover.map(c => c.frame), Array.from({ length: 50 }, (_, i) => i + 951));
  assert.deepEqual(handover[0].rotationRaw, [-1820, -6925, -4329]);
  assert.deepEqual(handover.at(-1).rotationRaw, [-1820, -4622, 277]);
});

test("zero-duration HAND commands keep their authored frame and vectors", () => {
  const bytes = Buffer.alloc(19 * 12);
  bytes.writeInt32LE(-7827, 8);
  const result = extractNativeHandPoseOperation({
    bytes, frame: 121, activitySlot: 2,
    operation: {
      callFileOffset: "0x28",
      arguments: [
        { kind: "constant", ascii: "FUKU" },
        { kind: "constant", value: 1 },
        { kind: "static-pointer", value: 0 },
        { kind: "constant", value: 0 },
      ],
    },
  });
  assert.equal(result.cue.frame, 121);
  assert.equal(result.cue.durationNativeTicks, 1);
  assert.deepEqual(result.table.vectors[0], [0, 0, -7827]);
});

test("the combined presentation extractor does not discard body-hand commands", () => {
  const presentation = extractNativeAseqCallbackPresentation({ bytes: Buffer.alloc(64), callbackFunction: 0,
    durationFrames: 30, nativeFunction: { id: "0x0", entryBlock: "0x0", blocks: [{ id: "0x0", successors: [],
      actions: [{ kind: "engineOperation", semanticId: "actor-mhnd-controller-request", callFileOffset: "0x10",
        arguments: [{ kind: "constant", ascii: "INE_" }, ...[2, 8, 16].map(value => ({ kind: "constant", value }))] }] }] } });
  assert.deepEqual(presentation.nativeBodyHandPoseCues.map(cue => [cue.frame, cue.actorTag, cue.channel, cue.targetIndex]),
    [[0, "INE_", 2, 8]]);
});

test("FACE duration uses the original signed-low16 minimum-one clamp without requiring disc fixtures",()=>{
  const bytes=Buffer.alloc(0x100);
  // Minimal generated SH-4 callback with a timer comparison against frame 5.
  [0x2de6,0x4d22,0x7de0,0x6ed3,0x54e3,0xe505,0x3450,0x344a,0x6043,0x8800,0x8b02,0xd10f,0x0123]
    .forEach((word,index)=>bytes.writeUInt16LE(word,index*2));
  bytes.writeUInt32LE(0x40-28,0x54);
  for(const [duration,expected]of [[0,1],[1,1],[10,10],[0xffff,1],[0x1000a,10]]){
    const presentation=extractNativeAseqCallbackPresentation({bytes,callbackFunction:0,durationFrames:30,
      nativeFunction:{id:"0x0",entryBlock:"0x0",blocks:[{id:"0x0",successors:[],actions:[{
        kind:"engineOperation",semanticId:"actor-face-clip-control-write",callFileOffset:"0x28",
        arguments:[{kind:"constant",ascii:"FUKU"},...[0,0,duration].map(value=>({kind:"constant",value}))],
      }]}]}});
    assert.equal(presentation.nativeFaceClipCues[0].durationNativeTicks,expected);
  }
});

test("native callback presentation rejects a hand pose without static vectors", () => {
  const bytes = Buffer.alloc(0x100);
  bytes.writeUInt16LE(0x2de6, 0);
  bytes.writeUInt16LE(0x4d22, 2);
  bytes.writeUInt16LE(0x7de0, 4);
  bytes.writeUInt16LE(0x6ed3, 6);
  bytes.writeUInt16LE(0x54e0, 8);
  bytes.writeUInt16LE(0xe501, 10);
  bytes.writeUInt16LE(0x3450, 12);
  bytes.writeUInt16LE(0x344a, 14);
  bytes.writeUInt16LE(0x6043, 16);
  bytes.writeUInt16LE(0x8800, 18);
  bytes.writeUInt16LE(0x8b02, 20);
  bytes.writeUInt16LE(0xd10f, 22);
  bytes.writeUInt16LE(0x0123, 24);
  bytes.writeUInt32LE(0x40 - 28, 0x54);
  assert.throws(
    () => extractNativeAseqCallbackPresentation({
      bytes,
      callbackFunction: 0,
      durationFrames: 10,
      nativeFunction: {
        blocks: [{
          actions: [{
            kind: "engineOperation",
            semanticId: "resolved-object-hndl-hndr-vector-install",
            callFileOffset: "0x28",
            arguments: [
              { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
              { kind: "constant", value: 0 },
              { kind: "constant", value: 0 },
              { kind: "constant", value: 1 },
            ],
          }],
        }],
      },
    }),
    /no exact static HAND pose table/,
  );
});

test("native callback presentation extracts exact FACE controller setup cues", () => {
  const bytes = Buffer.alloc(0x100);
  bytes.writeUInt16LE(0x2de6, 0);
  bytes.writeUInt16LE(0x4d22, 2);
  bytes.writeUInt16LE(0x7de0, 4);
  bytes.writeUInt16LE(0x6ed3, 6);
  bytes.writeUInt16LE(0x54e3, 8);
  bytes.writeUInt16LE(0xe505, 10);
  bytes.writeUInt16LE(0x3450, 12);
  bytes.writeUInt16LE(0x344a, 14);
  bytes.writeUInt16LE(0x6043, 16);
  bytes.writeUInt16LE(0x8800, 18);
  bytes.writeUInt16LE(0x8b02, 20);
  bytes.writeUInt16LE(0xd10f, 22);
  bytes.writeUInt16LE(0x0123, 24);
  bytes.writeUInt32LE(0x40 - 28, 0x54);
  const presentation = extractNativeAseqCallbackPresentation({
    bytes,
    callbackFunction: 0,
    durationFrames: 10,
    nativeFunction: {
      blocks: [{
        actions: [{
          kind: "engineOperation",
          semanticId: "resolved-face-controller-setup",
          callFileOffset: "0x28",
          arguments: [
            { kind: "constant", value: 0x554b5546, ascii: "FUKU" },
            { kind: "constant", value: 1 },
            { kind: "constant", value: 2 },
            { kind: "constant", value: 0 },
          ],
        }],
      }],
    },
  });
  assert.deepEqual(presentation.nativeFaceControllerCues, [{
    activitySlot: 0,
    frame: 5,
    actorTag: "FUKU",
    mode: 1,
    intervalNativeTicks: 2,
    parameter: 0,
    callFileOffset: "0x28",
  }]);
});
