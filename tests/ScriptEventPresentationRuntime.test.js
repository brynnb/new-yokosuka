import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {NativeAseqActivityCatalog} from "../play/events/NativeAseqActivityRuntime.js";
import authoredScenes from "../play/scripts/AuthoredSceneCatalog.js";
import {evaluateAuthActor} from "../src/AuthMovement.js";

import {
  createScriptEventPresentationCatalog,
  scriptEventPlayerMotionDefinitions,
} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {
  createScriptEventPresentationRuntime,
} from "../play/scripts/ScriptEventPresentationRuntime.js";

function command(name, ...values) {
  return {
    name,
    arguments: values.map(value => ({
      type: "string",
      isStatic: true,
      value,
    })),
  };
}

test("Mark's lunch films retain original bindings and cannot settle the rescue themselves",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [part,resource] of [["intro","SEQDATA1.AUTH"],["aftermath","SEQDATA2.AUTH"]]){
    const activity=catalog.activity(`s1.mfsy.mark-lunch-${part}.scene`);
    assert.equal(activity.durableEffects,"forbidden");assert.equal(activity.returnPlayerState,true);
    assert.equal(activity.cutscene.activity.binding.activityId,`MIZUMARK/${resource}`);
    const manifest=JSON.parse(readFileSync(new URL(`../play/assets/harbor/mark-lunch-${part}/manifest.json`,import.meta.url)));
    assert.equal(new NativeAseqActivityCatalog(manifest).has(activity.cutscene.activity),true);
    assert.equal(manifest.packageActors.MARK.modelCode,"GIC_L");
    assert.equal(manifest.packageActors.MRSK.modelCode,"PPL_L");assert.equal(manifest.packageActors.OKYS.modelCode,"OKA_L");
  }
  const audio=JSON.parse(readFileSync(new URL("../public/audio/world/mark-lunch-intro/manifest.json",import.meta.url)));
  const missing=audio.sounds.filter(s=>s.unavailable);
  assert.equal(missing.length,1);assert.equal(missing[0].commandHex,"a9041500");assert.match(missing[0].sourcePath,/\/body\/ikepocha\.aiff$/);
});

test("Jimmy films retain exact source bindings and running beats form one continuous owned route",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [part,area,resource]of [["jimmy-knock","d000","CTERMO1/SEQDATA3.AUTH"],["jimmy-caught","d000","CTERMO1/SEQDATA1.AUTH"],["jimmy-escaped","d000","CTERMO1/SEQDATA2.AUTH"],["jimmy-interrogation","daza","A0174/A0174.AUTH"]]){
    const activity=catalog.activity(`s1.${area}.${part}.scene`);
    assert.equal(activity.durableEffects,"forbidden");assert.equal(activity.returnPlayerState,true);
    assert.equal(activity.cutscene.activity.binding.activityId,resource);
    const manifest=JSON.parse(readFileSync(new URL(`../play/assets/dobuita/${part}/manifest.json`,import.meta.url)));
    assert.equal(new NativeAseqActivityCatalog(manifest).has(activity.cutscene.activity),true);
  }
  const beats=authoredScenes.scenes.filter(s=>s.continuationGroup==="s1.d000.jimmy-chase");
  assert.equal(beats.length,13);
  for(let i=0;i<beats.length;i++){
    const scene=beats[i];assert.equal(catalog.sequence(`${scene.id}.start`).kind,i?"scene-staging-transition":"scene-staging-start");
    assert.deepEqual(scene.actors.map(a=>a.tag),["AKIR","JIMY"]);
    for(const actor of scene.actors){
      const end=evaluateAuthActor(actor.movement,scene.durationSeconds);
      if(i<beats.length-1)for(const key of ["x","y","z"])assert.ok(Math.abs(end[key]-beats[i+1].actors.find(a=>a.tag===actor.tag).pose[key])<1e-8,`${scene.id}/${actor.tag}/${key}`);
      assert.equal(actor.endMotion.name,"AKI_AKI_STAND_LP");
    }
  }
});

function harness() {
  const calls = [];
  const adapters = Object.fromEntries([
    "startCamera", "stopCamera", "playPlayerMotion", "lookAtActor",
    "clearActorLook", "playSequence", "startActivity", "commit", "rollback", "update",
  ].map(name => [name, (...args) => {
    calls.push([name, ...args]);
    return true;
  }]));
  adapters.begin = context => {
    calls.push(["begin", context]);
    return { owner: "event-1" };
  };
  return {
    calls,
    runtime: createScriptEventPresentationRuntime({ adapters }),
  };
}

test("catalog exposes only exact reviewed presentation and activity records", () => {
  const catalog = createScriptEventPresentationCatalog();
  assert.deepEqual(catalog.camera("d000.hato.camera.2952"), {
    area: "D000",
    cameraNumber: 2952,
  });
  assert.deepEqual(catalog.playerMotion("d000.hato.player-motion.903"), {
    actorCode: "AKIR",
    request: 903,
    name: "AKI_AKI_TATI_IWA_L",
    motionFile: null,
    parameters: [-1, -1, -1, 1],
  });
  assert.equal(catalog.camera("d000.hato.camera.guessed"), null);
  assert.deepEqual(catalog.activity("d000.telephone-book.native"), {
    kind: "native-object-interaction",
    area: "D000",
    objectTag: "TBK1",
    action: 1,
    durableEffects: "forbidden",
    programId: "disc1-d000-phone-book-0x6a49c",
    source: "D000 persistent owner 0x69b14 > TBK1 > 0x6a49c",
  });
});

test("mirror follow-up borrows original HOUO/MS8A without allowing cinematics to save or win",()=>{
  const catalog=createScriptEventPresentationCatalog();
  const fuku=catalog.activity("s1.jhd0.fuku-phoenix-mirror.scene");
  assert.equal(fuku.cutscene.packageId,"houo");
  assert.deepEqual(fuku.cutscene.activity,{slot:9,binding:{primaryPointer:394211,secondaryPointer:394224}});
  for(const [part,slot]of [["explanation",6],["theft-start",0],["pursuit",1],["scaffolding",2],["crane",3],["failure",4],["save-mirror",5],["hong-kong",7]]){
    const activity=catalog.activity(`s1.ms08.mirror-meeting.${part}`);
    assert.equal(activity.durableEffects,"forbidden");assert.equal(activity.returnPlayerState,true);
    assert.equal(activity.cutscene.packageId,"mirror-meeting");assert.equal(activity.cutscene.activity.slot,slot);
  }
  assert.equal(catalog.sequence("s1.ms08.save-mirror.start").scene.id,"s1.ms08.save-mirror");
});

test("home cinematics cannot grant savings or advance the personal calendar themselves",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [part,resource,area] of [["jimmy-morning-call","A0169","jomo"],["post-chen-home","A0160","jomo"],["bank-savings","01BNK","jomo"],["travel-family","01EAR","jomo"],
    ["fuku-travel-funds","01MON","jomo"],["global-airfare","01MIT","dski"],["asia-airfare","01ETU","daza"],
    ["global-boat","01MIT","dski"],["boat-ticket-purchase","01ETU","daza"],["boat-ticket-collection","A0165","daza"]]){
    const activity=catalog.activity(`s1.${area}.${part}.scene`);
    assert.equal(activity.durableEffects,"forbidden");assert.equal(activity.returnPlayerState,true);
    assert.equal(activity.cutscene.packageId,part);
    assert.deepEqual(activity.cutscene.activity,{slot:0,binding:{kind:"map-embedded-slot",activityId:`${resource}/${resource}.AUTH`}});
    const manifest=JSON.parse(readFileSync(new URL(`../play/assets/${area==="jomo"?"hazuki":"dobuita"}/${part}/manifest.json`,import.meta.url)));
    assert.equal(new NativeAseqActivityCatalog(manifest).has(activity.cutscene.activity),true);
  }
  assert.deepEqual(catalog.activity("s1.jomo.mirror-dream.scene").cutscene.activity,
    {slot:51,binding:{primaryPointer:614200,secondaryPointer:614213}});
  const snow=catalog.activity("s1.jomo.snow-dream.scene");
  assert.equal(snow.durableEffects,"forbidden");assert.equal(snow.returnPlayerState,true);
  assert.equal(new NativeAseqActivityCatalog(JSON.parse(readFileSync(new URL("../play/assets/hazuki/kkyc/manifest.json",import.meta.url)))).has(snow.cutscene.activity),true);
  assert.equal(catalog.sequence("s1.jomo.fuku-travel-advice.start").scene.actors[1].tag,"FUKU");
});

test("Chai cinematics retain exact source bindings and cannot decide the fight",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [id,resource,cast]of [["chai-intro","A0172",["AKIR","CHAI"]],["chai-victory","A0172",["DOOR","SLOT","AKIR","CHAI","NITO"]],["chai-rescue","A0172A",["DOOR","SLOT","AKIR","CHAI","FUKU"]]]){
    const activity=catalog.activity(`s1.dgct.${id}.scene`),manifest=JSON.parse(readFileSync(new URL(`../play/assets/dobuita/${id}/manifest.json`,import.meta.url)));
    assert.equal(activity.durableEffects,"forbidden");assert.equal(activity.returnPlayerState,true);assert.equal(activity.cutscene.worldId,"arcade");
    assert.deepEqual(manifest.activities[0].actors,cast);assert.equal(new NativeAseqActivityCatalog(manifest).has(activity.cutscene.activity),true);
    assert.equal(manifest.packageActors.CHAI.modelCode,"CHA_M");
    assert.equal(activity.cutscene.activity.binding.activityId,`${resource}/${resource}.AUTH`);
    for(const [tag,prop]of Object.entries(manifest.sceneObjects||{})){
      assert.equal(prop.model,tag==="DOOR"?"DR17_001":"GAMT101G");assert.equal(prop.referenceOnly,true);
      assert.ok(Number.isInteger(prop.sourceBinding.defImageRecordOffset));
    }
  }
});

test("Asia props use original CHRS model bindings instead of semantic filename guesses",()=>{
  for(const [id,expected]of [["asia-airfare",{INF1:"TIRT230G.MT5",INF2:"TIRS703G.MT5",MAGA:"ZSR3H03G.MT5"}],
    ["boat-ticket-purchase",{INF3:"ARP3H01G.MT5",MONY:"OSAS5LOG.MT5",PURS:"SAFS500G.MT5",TRAY:"UKES500G.MT5"}]]){
    const m=JSON.parse(readFileSync(new URL(`../play/assets/dobuita/${id}/manifest.json`,import.meta.url)));
    assert.deepEqual(Object.fromEntries(Object.entries(m.sceneObjects).map(([tag,value])=>[tag,value.browserFilename])),expected);
    for(const value of Object.values(m.sceneObjects))assert.ok(Number.isInteger(value.sourceBinding.defImageRecordOffset));
  }
});

test("letter translation borrows the exact TOKI presentation in the normal shop",()=>{
  const activity=createScriptEventPresentationCatalog().activity("s1.drsa.xia-letter-translation.scene");
  assert.equal(activity.area,"DRSA");assert.equal(activity.durableEffects,"forbidden");
  assert.equal(activity.returnPlayerState,true);assert.equal(activity.cutscene.packageId,"toki");
  assert.deepEqual(activity.cutscene.activity,{slot:0,binding:{primaryPointer:0x34f7,secondaryPointer:0x3504}});
});

test("family-crest presentation borrows the embedded scene without awarding a mirror",()=>{
  const catalog=createScriptEventPresentationCatalog();
  const activity=catalog.activity("s1.jomo.ine-family-crest.scene");
  assert.equal(activity.area,"JOMO");assert.equal(activity.durableEffects,"forbidden");
  assert.equal(activity.returnPlayerState,true);assert.equal(activity.cutscene.packageId,"family-crest");
  assert.equal(activity.cutscene.activity.binding.activityId,"01136/CREST.AUTH");
  assert.equal(catalog.sequence("s1.jomo.fuku-handguard-home.start").scene.actorDefinitions[0].modelCode,"FUK_M");
});

test("the optional Nozomi encounter reuses the original YBHN presentation without native effects", () => {
  const activity = createScriptEventPresentationCatalog().activity("s1.d000.nozomi-after-parlor.scene");
  assert.equal(activity.area, "D000");
  assert.equal(activity.durableEffects, "forbidden");
  assert.equal(activity.returnPlayerState, true);
  assert.equal(activity.cutscene.packageId, "ybhn");
  assert.deepEqual(activity.cutscene.activity, {
    slot: 27, binding: { primaryPointer: 0xaf8ae, secondaryPointer: 0xaf8bb },
  });
});

test("Fuku's gate conversation borrows TGMA without granting another letter", () => {
  const activity=createScriptEventPresentationCatalog().activity("s1.jhd0.fuku-letter-gate.scene");
  assert.equal(activity.area,"JHD0");
  assert.equal(activity.returnPlayerState,true);
  assert.equal(activity.durableEffects,"forbidden");
  assert.equal(activity.cutscene.packageId,"tgma");
  assert.deepEqual(activity.cutscene.activity,{slot:0,binding:{primaryPointer:0x601b8,secondaryPointer:0x601bd}});
});

test("family mirror conversations share presentation ownership without durable effects",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [id,packageId,slot] of [
    ["family-fuku.approach","family-fuku",0],
    ["family-fuku.conversation","family-fuku",1],
    ["family-ine.conversation","family-ine",0],
  ]){
    const activity=catalog.activity(`s1.jhd0.${id}`);
    assert.equal(activity.area,"JHD0");
    assert.equal(activity.returnPlayerState,true);
    assert.equal(activity.durableEffects,"forbidden");
    assert.equal(activity.cutscene.worldId,"exterior");
    assert.equal(activity.cutscene.packageId,packageId);
    assert.deepEqual(activity.cutscene.activity,{slot,binding:{primaryPointer:0,secondaryPointer:0}});
  }
});

test("Bunkado handover owns original presentation, not inventory settlement",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [part,slot] of [["arrival",0],["remembrance",1],["phoenix-question",2]]){
    const activity=catalog.activity(`s1.dkty.handguard.${part}`);
    assert.equal(activity.area,"DKTY");assert.equal(activity.durableEffects,"forbidden");
    assert.equal(activity.returnPlayerState,true);assert.equal(activity.cutscene.packageId,"bunkado-handguard");
    assert.deepEqual(activity.cutscene.activity,{slot,binding:{primaryPointer:0,secondaryPointer:0}});
  }
});

test("Gui Zhang's movies cannot award combat completion",()=>{
  const catalog=createScriptEventPresentationCatalog();
  for(const [part,slot] of [["introduction",0],["bodyguard",1]]){
    const activity=catalog.activity(`s1.jd00.gui-zhang.${part}`);
    assert.equal(activity.area,"JD00");assert.equal(activity.durableEffects,"forbidden");
    assert.equal(activity.returnPlayerState,true);assert.equal(activity.cutscene.packageId,"gui-zhang-street");
    assert.deepEqual(activity.cutscene.activity,{slot,binding:{primaryPointer:0,secondaryPointer:0}});
  }
});

test("runtime dispatches Hato commands through an owned transaction", async () => {
  const { runtime, calls } = harness();
  runtime.begin({ area: "D000", actorCode: "HATO" });
  await runtime.execute(command("start_camera", "d000.hato.camera.2950"));
  await runtime.execute(command("look_at_actor", "HATO", "AKIR"));
  await runtime.execute(command(
    "play_player_motion",
    "d000.hato.player-motion.903",
  ));
  await runtime.execute(command("clear_actor_look", "HATO"));
  await runtime.execute(command("stop_camera"));
  runtime.commit();
  assert.deepEqual(calls.map(([name]) => name), [
    "begin", "startCamera", "lookAtActor", "playPlayerMotion",
    "clearActorLook", "stopCamera", "commit",
  ]);
  assert.equal(runtime.transaction, null);
});

test("door 51 catalog retains its exact XMPT and motion-cue route", () => {
  const catalog = createScriptEventPresentationCatalog();
  const start = catalog.sequence("d000.door.51.closed-check.start");
  const finish = catalog.sequence("d000.door.51.closed-check.finish");
  assert.deepEqual(start.alignment, {
    target: [6.452099800109863, 0.07000000029802322, 84.81649780273438],
    requestWord: 58254,
    requestDword: 594,
    stateSelector: 0,
    motion: { request: 594, name: "AKI_AKI_BASE", motionFile: null },
  });
  assert.equal(start.motion.request, 28677);
  assert.deepEqual(start.cues.map(cue => cue.phase), [58, 82]);
  assert.equal(start.dialoguePhase, 150);
  assert.equal(finish.sequenceId, start.sequenceId);
});

test("telephone sequence dispatches after its exact TEL_ adapter is proven", async () => {
  const { runtime, calls } = harness();
  runtime.begin({ area: "JOMO" });
  await runtime.execute(command(
    "play_sequence",
    "jomo.telephone.answer.sa1093.first",
  ));
  assert.equal(
    calls.some(([name]) => name === "playSequence"),
    true,
  );
  runtime.rollback("test-complete");
});

test("telephone catalog retains concurrent native call timing", () => {
  const catalog = createScriptEventPresentationCatalog();
  const answer = catalog.sequence("jomo.telephone.answer.sa1093.first");
  const hangup = catalog.sequence("jomo.telephone.hangup.sa1093.first");
  assert.equal(answer.kind, "telephone-call-start");
  assert.equal(answer.executable, true);
  assert.equal(answer.motion.request, 8254);
  assert.equal(answer.motion.name, "AKI_DERU_DENWA_A_GORODENWA_F");
  assert.equal(answer.motion.motionFile, "M_JOMO.MOTN");
  assert.deepEqual(answer.motion.nativeRegistry, {
    lowerExclusive: 0x2000,
    upperExclusive: 0x2046,
    index: 61,
  });
  assert.equal(answer.answer.tick, 123);
  assert.equal(answer.dialogueLeadInTicks, 150);
  assert.equal(answer.hangup.tick, 904);
  assert.equal(hangup.kind, "telephone-call-finish");
  assert.equal(hangup.callId, answer.callId);
  assert.equal(hangup.behavior, "join-active-call-timeline");
  assert.equal(answer.answer.receiver.objectRenderKey, 3);
  assert.equal(answer.answer.receiver.actorRenderKey, -0x42);
  assert.equal(answer.answer.receiver.actorRuntimeMatrixIndex, 30);
  assert.deepEqual(answer.answer.receiver.handCorrection, {
    translation: [0.02499999850988388, 0.07499999552965164, 0],
    rotationAxis: "z",
    rotationFixedTurnRaw: 0x4000,
  });
});

test("player motion preload definitions come from the reviewed catalog", () => {
  assert.deepEqual(scriptEventPlayerMotionDefinitions(), [
    {
      request: 903,
      name: "AKI_AKI_TATI_IWA_L",
      motionFile: null,
    },
    {
      request: 100,
      name: "AKI_AKI_TURN180_L",
      motionFile: null,
    },
    {
      request: 1554,
      name: "AKI_AKANAI_HIKIDO_F",
      motionFile: null,
    },
    {
      request: 594,
      name: "AKI_AKI_BASE",
      motionFile: null,
    },
    {
      request: 28677,
      name: "AKI_HITORIGOTO_R_RYURIHATUTEN",
      motionFile: "M_D000.MOTN",
    },
    {
      request: 8254,
      name: "AKI_DERU_DENWA_A_GORODENWA_F",
      motionFile: "M_JOMO.MOTN",
    },
    {
      request: 8255,
      name: "AKI_DERU_DENWA_B_GORODENWA_F",
      motionFile: "M_JOMO.MOTN",
    },
  ]);
});

test("runtime dispatches a registered specialized activity and waits", async () => {
  const { runtime, calls } = harness();
  runtime.begin({ area: "D000", objectTag: "TBK1" });
  await runtime.execute(command("start_activity", "d000.telephone-book.native"));
  assert.equal(calls.some(([name]) => name === "startActivity"), true);
  runtime.commit();
});

test("runtime rejects dynamic and unknown identifiers", async () => {
  const { runtime } = harness();
  runtime.begin({ area: "D000" });
  await assert.rejects(runtime.execute({
    name: "start_camera",
    arguments: [{ type: "string", isStatic: false, value: "x" }],
  }), /static string/);
  await assert.rejects(
    runtime.execute(command("start_camera", "unknown.camera")),
    /unknown authored camera/,
  );
  runtime.rollback();
});
