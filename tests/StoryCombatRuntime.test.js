import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StoryCombatRuntime } from "../play/scripts/StoryCombatRuntime.js";
import { createCombatActorAdapter } from "../play/combat/CombatActorAdapter.js";
import { applyCombatHit, MARTIAL_ARTS_MOVES } from "../src/MartialArtsCombat.js";
import catalog from "../play/data/story-combat.json" with { type: "json" };
import harborFilm from "../play/assets/harbor/charlie-harbor-interrogation/manifest.json" with { type: "json" };
import { STORY_STARTING_MOVE_IDS } from "../play/combat/StoryMoveProgression.js";

function harness(id = "s1.d000.parking-lot", flags = {}) {
  const definition = catalog.encounters.find(e => e.id === id), calls = [], records = new Map();
  let now = 1000, prepare = async () => {}, accept = true;
  let character = { id: 1, playMode: "story", storyFlags: flags };
  const controller = { cameraYaw: 0, cameraDistance: 4, setFirstPerson() {}, updateCamera() {} };
  for (const spawn of definition.actors) {
    const root = { position: new Vector3(), rotation: { y: 0 }, enabled: true,
      getAbsolutePosition() { return this.position; }, setEnabled(v) { this.enabled = v; } };
    const animation = new Proxy({ reset() {}, update() {}, activeOneShotRootMotionKind: () => null,
      activeOneShotChoreographySample: () => null, activeOneShotPoseRootTranslation: () => null }, { get: (o,k) => o[k] || (() => true) });
    records.set(spawn.tag, {root, animation, actor: createCombatActorAdapter({ root, animation, getController: () => controller, setEnabled: v => root.setEnabled(v) })});
  }
  const bindings = { cancel: "KeyX", combatHand: "KeyJ", combatLeg: "KeyK", combatThrow: "KeyL", combatGuard: "KeyI", run: "ShiftLeft",
    moveForward: "KeyW", moveBackward: "KeyS", moveLeft: "KeyA", moveRight: "KeyD", combatTargetLeft: "KeyQ", combatTargetRight: "KeyE" };
  const runtime = new StoryCombatRuntime({
    actors: { prepare: (...args) => prepare(...args), begin: () => calls.push("begin"), end: () => calls.push("end"), activeActor: tag => records.get(tag) },
    createCombatActors: async () => records, getController: () => controller, getBinding: key => bindings[key],
    createSceneObjects: () => ({ load: async () => {}, prepareActivity: () => {}, clear: () => {} }),
    getCharacter: () => character,
    capturePlayerState: () => "snapshot", restorePlayerState: s => calls.push(s),
    onIntent: (...args) => { calls.push(args); return accept; }, target: new EventTarget(), now: () => now,
    createIndicator: () => ({ dispose: () => calls.push("indicator-disposed"), projectTargets: entries => entries.map(e => ({ id:e.id, visible:true, defeated:e.combatant.defeated, screenX:e.actor.position().x })) }),
  });
  const view = { id, token: "a".repeat(32), ready: false, kind: definition.training?"training":undefined, remainingMs: definition.timeoutMs }, transaction = { area: definition.area };
  const step = (seconds = .1) => { now += seconds * 1000; return runtime.update(transaction, seconds); };
  const ready = async () => { await runtime.show(view, transaction); await runtime.show({...view,ready:true},transaction); };
  return { runtime, definition, records, calls, view, transaction, controller, step, ready,
    character: next => { character = next; },
    accept: value => { accept = value; }, prepare: fn => { prepare = fn; } };
}

test("combat borrows the same parked props as the following film and releases them", async () => {
  const h=harness("s1.mfsy.charlie-harbor"), calls=[];
  h.runtime.createSceneObjects=definitions=>({
    load:async()=>calls.push("load"),
    prepareActivity:activity=>calls.push(activity),
    clear:()=>calls.push("clear"),
  });
  await h.ready();
  const tags=["BIK0","BIK1","BIK2","RY00","RY01","RY10","RY11","RY20","RY21"];
  assert.deepEqual(Object.keys(h.definition.sceneObjects).sort(),tags);
  assert.deepEqual(h.definition.sceneObjects,harborFilm.sceneObjects);
  assert.deepEqual(catalog.encounters.find(e=>e.id==="s1.mfsy.biker-thugs").sceneObjects,harborFilm.sceneObjects);
  assert.deepEqual(calls[1].nativeSceneObjectStates.map(s=>s.actorTag).sort(),tags);
  for(const tag of tags.filter(t=>t.startsWith("RY"))){
    const light=h.definition.sceneObjects[tag],bike=h.definition.sceneObjects[light.sourceBinding.companionOf];
    assert.deepEqual(light.initialPresentation,bike.initialPresentation);
  }
  h.runtime.finish(h.transaction);
  assert.equal(calls.at(-1),"clear");
});

test("failed combat prop loading releases partial assets and restores player state", async () => {
  const h=harness("s1.mfsy.biker-thugs"), calls=[];
  h.runtime.createSceneObjects=()=>({
    load:async()=>{throw new Error("missing model");},
    prepareActivity:()=>calls.push("present"),clear:()=>calls.push("clear"),
  });
  await assert.rejects(h.runtime.show(h.view,h.transaction),/missing model/);
  assert.deepEqual(calls,["clear"]);
  assert.equal(h.runtime.active,null);
  assert.equal(h.calls.at(-1),"snapshot");
  assert.equal(h.calls.includes("begin"),false);
});

test("cancelled combat releases scene objects that finish loading late", async () => {
  const h=harness("s1.mfsy.biker-thugs"), calls=[];
  let resolveLoad;
  h.runtime.createSceneObjects=()=>({
    load:()=>new Promise(resolve=>{resolveLoad=resolve;}),
    prepareActivity:()=>calls.push("present"),
    clear:()=>calls.push("clear"),
  });
  const pending=h.runtime.show(h.view,h.transaction);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof resolveLoad,"function");
  h.runtime.finish(h.transaction);
  resolveLoad();
  await assert.rejects(pending,{name:"AbortError"});
  assert.deepEqual(calls,["clear"]);
});

test("every Story fight uses the shared engine and earned moves; lessons loan only their taught move", async () => {
  for (const def of catalog.encounters) {
    const h = harness(def.id); await h.ready(); const e = h.runtime.encounter;
    assert.equal(e.moves, MARTIAL_ARTS_MOVES); assert.equal(e.autoRematch, false);
    assert.deepEqual(Object.keys(e.playerMoves).sort(), [...new Set([
      ...STORY_STARTING_MOVE_IDS, ...(def.training ? [def.training.moveId] : []),
    ])].sort());
    assert.equal(e.enemy.allowedMoveIds, null, "player progress must not restrict the opponent");
    assert.ok(e.enemies.length); assert.equal(e.player.id, "AKIR");
    assert.equal(h.records.get("AKIR").root.position.x, def.actors[0].x);
    assert.equal(h.calls.filter(c => Array.isArray(c) && c[0] === (def.training?"challenge_ready":"combat_ready")).length, 1);
    h.runtime.finish(h.transaction); assert.equal(h.calls.at(-1), "snapshot");
  }
});

test("Story reads committed lesson flags on each encounter, including after save reload or character change", async () => {
  const h = harness(undefined, { "story.s1.tom-lesson.completed": true, "story.s1.tom-lesson.declined": true });
  await h.ready();
  assert.equal(h.runtime.encounter.performPlayerMove("tornadoKick"), false);
  h.runtime.finish(h.transaction);
  const savedCharacter = JSON.parse(JSON.stringify({ id: 1, playMode: "story", storyFlags: {
    "story.s1.tornado-kick.learned": true, "story.s1.swallow-flip.learned": true,
  } }));
  h.character(savedCharacter);
  await h.ready();
  assert.ok(h.runtime.encounter.playerMoves.tornadoKick);
  assert.ok(h.runtime.encounter.playerMoves.swallowFlip);
  assert.equal(h.runtime.encounter.playerMoves.shadowStep, undefined);
  h.runtime.finish(h.transaction);
  h.character({ id: 2, playMode: "story", storyFlags: {} });
  await h.ready();
  assert.equal(h.runtime.encounter.playerMoves.tornadoKick, undefined);
  h.runtime.finish(h.transaction);
});

test("cancelled training never teaches a move or changes the saved flags", async () => {
  const flags = Object.freeze({});
  const lesson = harness("s1.mfsy.tornado-kick", flags);
  await lesson.ready();
  assert.ok(lesson.runtime.encounter.playerMoves.tornadoKick);
  assert.equal(lesson.runtime.encounter.playerMoves.swallowFlip, undefined);
  lesson.runtime.finish(lesson.transaction);
  const fight = harness(undefined, flags);
  await fight.ready();
  assert.equal(fight.runtime.encounter.playerMoves.tornadoKick, undefined);
  assert.deepEqual(flags, {});
  fight.runtime.finish(fight.transaction);
});

test("Story runs locally between rare keepalives, with camera-relative selection and target-relative movement", async () => {
  const h = harness(); await h.ready(); const e = h.runtime.encounter;
  for (const entry of e.enemies) entry.ai = null;
  const current = e.player.targetId;
  h.runtime.active.input.targetChanges.push("right"); h.step(); assert.notEqual(e.player.targetId, current);
  const p = e.playerActor.position().clone(), target = e.enemyActor.position();
  h.controller.cameraYaw += Math.PI; // Movement still approaches the target, not the orbit camera.
  h.runtime.active.input.held.add("KeyW"); h.step();
  assert.ok(Vector3.Distance(e.playerActor.position(), target) < Vector3.Distance(p, target));
  assert.equal(h.calls.some(c => Array.isArray(c) && c[0] === "combat_input"), false);
  assert.equal(h.calls.filter(c => Array.isArray(c)).length, 1);
  h.step(6); assert.equal(h.calls.at(-1)[0], "combat_poll");
  h.runtime.finish(h.transaction);
});

test("Story starts combat with a separated target view and preserves manual orbit", async () => {
  const h=harness();await h.ready();
  const e=h.runtime.encounter,p=e.playerActor.position(),target=e.enemyActor.position();
  const behind=Math.atan2(p.x-target.x,p.z-target.z);
  assert.ok(Math.abs(h.controller.cameraYaw-behind-Math.PI/9)<1e-9);
  h.controller.cameraYaw+=.4;
  const chosenYaw=h.controller.cameraYaw;
  h.step();assert.equal(h.controller.cameraYaw,chosenYaw);
  h.runtime.finish(h.transaction);
});

test("Story chooses a clear opening camera when its preferred angle hits a wall", async () => {
  const h=harness();
  h.controller.updateCamera=function(){this.cameraResolvedDistance=Math.sin(this.cameraYaw)>.7?4:.5;};
  await h.ready();
  assert.equal(h.controller.cameraResolvedDistance,4);
  const opening=h.controller.cameraYaw;
  h.controller.cameraYaw=opening+.1;h.step();
  assert.equal(h.controller.cameraYaw,opening+.1);
  h.runtime.finish(h.transaction);
});

test("Story checks rendered scenery as well as collision before framing fighters", async () => {
  const h=harness();let picks=0,blockedYaw;
  h.controller.actorRoot=h.records.get('AKIR').root;
  h.controller.camera={position:new Vector3()};h.controller.cameraTarget=new Vector3();
  h.controller.scene={pickWithRay:()=>{picks++;return {hit:Math.abs(h.controller.cameraYaw-blockedYaw)<.01};}};
  h.controller.updateCamera=function(){
    blockedYaw??=this.cameraYaw;
    this.cameraTarget.copyFrom(this.actorRoot.position).addInPlace(new Vector3(0,1.12,0));
    this.camera.position.copyFrom(this.cameraTarget).addInPlace(new Vector3(Math.sin(this.cameraYaw)*4,1,Math.cos(this.cameraYaw)*4));
    this.cameraResolvedDistance=4;
  };
  h.runtime.createIndicator=()=>({dispose(){},projectTargets:()=>[{visible:true,screenX:.5,screenY:.5}]});
  await h.ready();
  assert.ok(picks>1,'an obstructed view should be sampled again');
  const e=h.runtime.encounter,p=e.playerActor.position(),target=e.enemyActor.position();
  assert.notEqual(h.controller.cameraYaw,Math.atan2(p.x-target.x,p.z-target.z)+Math.PI/9);
  h.runtime.finish(h.transaction);
});

test("Story avoids a scheduled bystander while excluding the fighters from camera blockers", async () => {
  const h=harness();let blockedYaw,sawBystander=false;
  const mesh=parent=>({parent,isVisible:true,visibility:1,isEnabled:()=>true,getTotalVertices:()=>10});
  const bystander=mesh({metadata:{scheduledActorInstanceId:"ambient-person"}});
  const fighter=mesh(h.records.get("AKIR").root);
  h.controller.actorRoot=h.records.get("AKIR").root;
  h.controller.camera={position:new Vector3()};h.controller.cameraTarget=new Vector3();
  h.controller.scene={pickWithRay:(_ray,predicate)=>{
    assert.equal(predicate(fighter),false,"the player's own body must not obstruct framing");
    const allowed=predicate(bystander);sawBystander ||= allowed;
    return {hit:allowed&&Math.abs(h.controller.cameraYaw-blockedYaw)<.01};
  }};
  h.controller.updateCamera=function(){
    blockedYaw??=this.cameraYaw;
    this.cameraTarget.copyFrom(this.actorRoot.position).addInPlace(new Vector3(0,1.12,0));
    this.camera.position.copyFrom(this.cameraTarget).addInPlace(new Vector3(Math.sin(this.cameraYaw)*4,1,Math.cos(this.cameraYaw)*4));
    this.cameraResolvedDistance=4;
  };
  h.runtime.createIndicator=()=>({dispose(){},projectTargets:()=>[{visible:true,screenX:.5,screenY:.5}]});
  await h.ready();
  assert.equal(sawBystander,true);
  assert.notEqual(h.controller.cameraYaw,blockedYaw);
  h.runtime.finish(h.transaction);
});

test("an obstructed combat camera keeps the opponent in view rather than choosing a longer off-screen angle", async () => {
  const h=harness();let initial;
  h.controller.actorRoot=h.records.get('AKIR').root;
  h.controller.camera={position:new Vector3()};h.controller.cameraTarget=new Vector3();
  h.controller.scene={pickWithRay:()=>({hit:true})};
  h.controller.updateCamera=function(){
    initial??=this.cameraYaw;
    this.cameraTarget.copyFrom(this.actorRoot.position).addInPlace(new Vector3(0,1.12,0));
    this.camera.position.copyFrom(this.cameraTarget).addInPlace(new Vector3(Math.sin(this.cameraYaw)*4,1,Math.cos(this.cameraYaw)*4));
    this.cameraResolvedDistance=Math.abs(this.cameraYaw-initial)<.01?1.5:4;
  };
  h.runtime.createIndicator=()=>({dispose(){},projectTargets:()=>[{visible:true,screenX:Math.abs(h.controller.cameraYaw-initial)<.01?.5:1.2,screenY:.5}]});
  await h.ready();
  assert.ok(Math.abs(h.controller.cameraYaw-initial)<.01,'the visible target beats a longer off-screen view');
  h.runtime.finish(h.transaction);
});

test("Story scales its opening combat angle for portrait viewports", async () => {
  const h=harness();h.controller.scene={getEngine:()=>({getRenderWidth:()=>390,getRenderHeight:()=>844})};
  await h.ready();
  const e=h.runtime.encounter,p=e.playerActor.position(),target=e.enemyActor.position();
  const behind=Math.atan2(p.x-target.x,p.z-target.z);
  assert.ok(Math.abs(h.controller.cameraYaw-behind-(Math.PI/9)*Math.sqrt((390/844)/(16/9)))<1e-9);
  h.runtime.finish(h.transaction);
});

test("a local defeat is reported once and cannot trigger Practice's automatic rematch", async () => {
  const h = harness(); await h.ready(); const e = h.runtime.encounter;
  applyCombatHit(e.enemy, e.player, {...MARTIAL_ARTS_MOVES.tigerKnuckle, damage:1000});
  h.step(); assert.equal(h.calls.at(-1)[2].outcome, "defeated");
  h.runtime.action("leg"); for (let i=0;i<5;i++) h.step();
  assert.equal(h.calls.filter(c => c[0] === "combat_result").length, 1);
  assert.equal(e.player.health, 0); h.runtime.finish(h.transaction);
});

test("pending result retries only until accepted, and cancellation never reports a win", async () => {
  const h=harness();await h.ready();h.accept(false);
  h.runtime.active.outcome="success";h.step();assert.equal(h.runtime.active.sentResult,false);
  h.accept(true);h.step();assert.equal(h.runtime.active.sentResult,true);
  const count=h.calls.length;h.step();assert.equal(h.calls.length,count);
  h.runtime.finish(h.transaction);h.step();assert.equal(h.runtime.active,null);
  const next=harness();await next.ready();next.runtime.finish(next.transaction);
  assert.equal(next.calls.some(c=>c[0]==="combat_result"),false);
});

test("cancelled preparation cannot acquire actors or send readiness beneath a new owner", async () => {
  const h=harness();let resolve;h.prepare(()=>new Promise(r=>{resolve=r;}));
  const pending=h.runtime.show(h.view,h.transaction);h.runtime.finish(h.transaction);resolve();
  await assert.rejects(pending,{name:"AbortError"});
  assert.equal(h.calls.includes("begin"),false);assert.equal(h.calls.some(c=>c[0]==="combat_ready"),false);
  h.prepare(async()=>{});await h.ready();h.runtime.finish(h.transaction);
});

test("nonlethal practice completes locally on elapsed active time without knocking anyone out", async () => {
  const h=harness("s1.jhd0.fuku-practice");await h.ready(); const e=h.runtime.encounter;
  for(const entry of e.enemies)entry.ai=null;
  applyCombatHit(e.player,e.enemy,{...MARTIAL_ARTS_MOVES.tigerKnuckle,damage:1000});
  applyCombatHit(e.enemy,e.player,{...MARTIAL_ARTS_MOVES.tigerKnuckle,damage:1000});
  assert.equal(e.enemy.health,1);assert.equal(e.player.health,1);
  for(let i=0;i<301;i++)h.step();
  assert.equal(h.runtime.active.outcome,"practiced");h.runtime.finish(h.transaction);
});

test("Tornado lesson requires the completed second kick through normal commands, with no time limit",async()=>{
  const h=harness("s1.mfsy.tornado-kick");await h.ready();
  h.runtime.active.elapsed=3600;h.step();assert.equal(h.runtime.active.outcome,null);
  h.runtime.action("leg");for(let i=0;i<60;i++)h.step();assert.equal(h.runtime.active.outcome,null);
  for(const command of ["up","up","leg","leg"])h.runtime.action(command);
  for(let i=0;i<120&&!h.runtime.active.outcome;i++)h.step();
  assert.equal(h.runtime.active.outcome,"success");
  assert.equal(h.calls.filter(c=>c[0]==="challenge_result").length,1);
  assert.equal(h.runtime.encounter.enemy.health,h.runtime.encounter.enemy.maxHealth);
  h.runtime.finish(h.transaction);
});

test("Swallow lesson needs an actual counter and completed throw, not just the input sequence",async()=>{
  const h=harness("s1.mend.swallow-flip");await h.ready();const e=h.runtime.encounter;
  const coach=e.enemies[0].ai;e.enemies[0].ai=null;
  for(const command of ["down","hand","leg"])h.runtime.action(command);
  for(let i=0;i<60;i++)h.step();assert.equal(h.runtime.active.outcome,null);
  e.enemies[0].ai=coach;
  // Use the real coach and core; enter the command while the practice strike
  // is in startup, as a human watching the wind-up would.
  let entered=false;const events=[];
  for(let i=0;i<2000&&!h.runtime.active.outcome;i++){
    if(e.enemy.action?.moveId==="tigerKnuckle"&&e.enemy.action.tick<4&&!entered){
      for(const command of ["down","hand","leg"])h.runtime.action(command);entered=true;
    }
    if(!e.enemy.action)entered=false;
    h.step(1/60);
    events.push(...e.lastEvents);
  }
  assert.equal(h.runtime.active.outcome,"success",JSON.stringify({player:e.player,enemy:e.enemy,events:events.slice(-10)}));
  assert.equal(h.calls.filter(c=>c[0]==="challenge_result").length,1);
  h.runtime.finish(h.transaction);
});

test('each optional lesson completes from real shared commands, including all three counter lessons',async()=>{
  for(const def of catalog.encounters.filter(d=>d.authoredStaging&&d.training)){
    const h=harness(def.id);await h.ready();const e=h.runtime.encounter;
    const move=MARTIAL_ARTS_MOVES[def.training.moveId];
    let entered=false;
    for(let i=0;i<2200&&!h.runtime.active.outcome;i++){
      const counter=Boolean(def.training.attackMoveId);
      if(!entered&&(!counter||e.enemy.action?.moveId==='tigerKnuckle'&&e.enemy.action.tick<4)){
        for(const command of move.nativeInput)h.runtime.action(command);
        entered=true;
      }
      if(counter&&!e.enemy.action)entered=false;
      h.step(1/60);
    }
    assert.equal(h.runtime.active.outcome,'success',def.id);
    assert.equal(h.calls.filter(c=>c[0]==='challenge_result').length,1,def.id);
    h.runtime.finish(h.transaction);
  }
});

test('touch chord and held guard complete the same optional lessons without granting on a bare press',async()=>{
  for(const [id,tokens]of [
    ['s1.d000.double-blow',['up',['hand','plus','leg']]],
    ['s1.mfsy.shadow-step',['up','guardDown','throw','guardUp']],
    ['s1.mfsy.shadow-blade',['up','guardDown','throw','guardUp','hand']],
    ['s1.mfsy.cross-charge',['up','up','guardDown','throw','guardUp']],
  ]){
    const h=harness(id);await h.ready();const e=h.runtime.encounter;
    let entered=false;
    for(let i=0;i<2200&&!h.runtime.active.outcome;i++){
      const counter=Boolean(h.definition.training.attackMoveId);
      if(!entered&&(!counter||e.enemy.action?.moveId==='tigerKnuckle'&&e.enemy.action.tick<4)){
        for(const command of tokens){
          if(command==='guardDown')h.runtime.setGuard(true);
          else if(command==='guardUp')h.runtime.setGuard(false);
          else h.runtime.action(command);
        }
        assert.equal(h.runtime.active.outcome,null);entered=true;
      }
      if(counter&&!e.enemy.action)entered=false;
      h.step(1/60);
    }
    assert.equal(h.runtime.active.outcome,'success',id);h.runtime.finish(h.transaction);
  }
});

test("Dobuita revenge waits for a fight outcome and can still be interrupted",async()=>{
  const h=harness("s1.d000.enoki-revenge");
  await h.ready();
  assert.equal(h.definition.timeoutMs,null);
  h.runtime.active.elapsed=60*60;
  h.step();
  assert.equal(h.runtime.active.outcome,null);
  assert.equal(h.runtime.active.view.remainingMs,null);
  h.runtime.finish(h.transaction);
  assert.equal(h.runtime.active,null);
});

test("Story preserves recovery, ally animation role, timeout and ownership on failure", async () => {
  const h=harness("s1.mfbt.seventy-man");await h.ready();const e=h.runtime.encounter;
  for(const entry of e.enemies)entry.ai=null;
  const ally=e.enemies.find(e=>e.id==="KISY");
  e.executeEnemyDecision({kind:"move",moveId:"shoulderBuster"},ally,e.enemy);
  assert.equal(ally.combatant.action.enemyVariant,true);
  applyCombatHit(e.enemy,e.player,{...MARTIAL_ARTS_MOVES.tigerKnuckle,damage:10});
  h.runtime.active.damagedAt=h.runtime.active.elapsed;
  const damaged=e.player.health;
  for(let n=0;n<29;n++)h.step();assert.equal(e.player.health,damaged);
  for(let n=0;n<20;n++)h.step();assert.ok(e.player.health>damaged);
  h.runtime.active.elapsed=h.definition.timeoutMs/1000;h.step();
  assert.equal(h.calls.at(-1)[2].outcome,"failure");h.runtime.finish(h.transaction);
});

test("slow preparation sends only keepalives; stale ownership and failed loading cannot settle", async () => {
  const h=harness();let reject;h.prepare(()=>new Promise((_,r)=>{reject=r;}));
  const pending=h.runtime.show(h.view,h.transaction);h.step(6);
  assert.equal(h.calls.at(-1)[0],"combat_poll");
  reject(new Error("missing model"));await assert.rejects(pending,/missing model/);
  assert.equal(h.runtime.active,null);assert.equal(h.calls.at(-1),"snapshot");
  h.prepare(async()=>{});await h.ready();
  await assert.rejects(h.runtime.show({...h.view,token:"b".repeat(32)},h.transaction),/ownership changed/);
  h.runtime.finish(h.transaction);
});

test("70-man fight owns ten waves, 67 ordinary opponents, three bosses and an untargetable ally", async () => {
  const h=harness("s1.mfbt.seventy-man");await h.ready();let defeated=0;const bosses=[];
  assert.equal(h.definition.waves.length,10);
  for(let wave=0;wave<10;wave++){
    const e=h.runtime.encounter, ally=e.enemies.find(e=>e.id==="KISY");
    assert.equal(ally.combatant.team,e.player.team);assert.equal(e.opponents.includes(ally),false);
    if(h.definition.waves[wave].bossTag)bosses.push(h.definition.waves[wave].bossTag);
    h.runtime.active.intro=0;for(const entry of e.enemies)entry.ai=null;
    // Exercise round orchestration with actual shared-core knockout events;
    // this is a lifecycle test, not a rendered play-through of all seventy.
    for(const entry of e.opponents){applyCombatHit(e.player,entry.combatant,{...MARTIAL_ARTS_MOVES.tigerKnuckle,damage:1000});defeated++;}
    for(let n=0;n<100&&h.runtime.active.wave===wave&&!h.runtime.active.outcome;n++)h.step();
    if(wave<9)assert.equal(h.runtime.active.outcome,null);
  }
  assert.equal(defeated,70);assert.deepEqual(bosses,["MRSK","PEDR","STSI"]);
  assert.equal(h.runtime.active.outcome,"success");h.runtime.finish(h.transaction);
});

test("Nozomi fights on Ryo's side and her knockout leaves the two-opponent fight playable",async()=>{
  const h=harness("s1.jd00.nozomi-park-rescue-ally");
  await h.ready();
  const e=h.runtime.encounter,ally=e.enemies.find(entry=>entry.id==="HRSK");
  assert.equal(ally.combatant.team,e.player.team);
  assert.equal(ally.combatant.maxHealth,150);
  assert.equal(ally.combatant.minimumHealth,0);
  assert.deepEqual(e.opponents.map(a=>a.id),["ENKI","NGSM"]);
  assert.ok(e.opponents.some(a=>a.id===e.player.targetId));
  const selected=[];
  const decide=ally.ai.decide.bind(ally.ai);
  ally.ai.decide=(self,target)=>{selected.push(target.id);return decide(self,target);};
  h.runtime.active.intro=0;
  for(let i=0;i<30;i++)h.step();
  assert.ok(selected.some(id=>id==="ENKI"||id==="NGSM"));
  assert.equal(selected.includes("AKIR"),false);
  for(const entry of e.enemies)entry.ai=null;
  const decisive={...MARTIAL_ARTS_MOVES.tigerKnuckle,damage:10000};
  applyCombatHit(e.enemy,ally.combatant,decisive);
  assert.equal(ally.combatant.defeated,true);
  h.step();assert.equal(h.runtime.active.outcome,null);
  for(const entry of e.opponents)applyCombatHit(e.player,entry.combatant,decisive);
  h.step();assert.equal(h.runtime.active.outcome,"success");
  h.runtime.finish(h.transaction);
});
