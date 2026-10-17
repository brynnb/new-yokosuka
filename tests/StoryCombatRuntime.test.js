import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StoryCombatRuntime } from "../play/scripts/StoryCombatRuntime.js";
import { createCombatActorAdapter } from "../play/combat/CombatActorAdapter.js";
import { applyCombatHit, MARTIAL_ARTS_MOVES } from "../src/MartialArtsCombat.js";
import catalog from "../play/data/story-combat.json" with { type: "json" };

function harness(id = "s1.d000.parking-lot") {
  const definition = catalog.encounters.find(e => e.id === id), calls = [], records = new Map();
  let now = 1000, prepare = async () => {}, accept = true;
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
    capturePlayerState: () => "snapshot", restorePlayerState: s => calls.push(s),
    onIntent: (...args) => { calls.push(args); return accept; }, target: new EventTarget(), now: () => now,
    createIndicator: () => ({ dispose: () => calls.push("indicator-disposed"), projectTargets: entries => entries.map(e => ({ id:e.id, visible:true, defeated:e.combatant.defeated, screenX:e.actor.position().x })) }),
  });
  const view = { id, token: "a".repeat(32), ready: false, kind: definition.training?"training":undefined, remainingMs: definition.timeoutMs }, transaction = { area: definition.area };
  const step = (seconds = .1) => { now += seconds * 1000; return runtime.update(transaction, seconds); };
  const ready = async () => { await runtime.show(view, transaction); await runtime.show({...view,ready:true},transaction); };
  return { runtime, definition, records, calls, view, transaction, controller, step, ready,
    accept: value => { accept = value; }, prepare: fn => { prepare = fn; } };
}

test("every Story fight uses the Practice engine, authored cast and full moves", async () => {
  for (const def of catalog.encounters) {
    const h = harness(def.id); await h.ready(); const e = h.runtime.encounter;
    assert.equal(e.moves, MARTIAL_ARTS_MOVES); assert.equal(e.autoRematch, false);
    assert.ok(e.enemies.length); assert.equal(e.player.id, "AKIR");
    assert.equal(h.records.get("AKIR").root.position.x, def.actors[0].x);
    assert.equal(h.calls.filter(c => Array.isArray(c) && c[0] === (def.training?"challenge_ready":"combat_ready")).length, 1);
    h.runtime.finish(h.transaction); assert.equal(h.calls.at(-1), "snapshot");
  }
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
