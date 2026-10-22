import assert from "node:assert/strict";
import test from "node:test";
import { storyCombatMoveIds, STORY_STARTING_MOVE_IDS, STORY_LEARNABLE_MOVES } from "../play/combat/StoryMoveProgression.js";
import { MARTIAL_ARTS_MOVES, MartialArtsCombat, createCombatant, queueCombatCommand,
  setCombatCommandOverride, startCombatMove } from "../src/MartialArtsCombat.js";

test("starting repertoire matches the 33 unflagged source moves, without promoting future catalog additions", () => {
  assert.equal(STORY_STARTING_MOVE_IDS.length, 33);
  assert.deepEqual([...STORY_STARTING_MOVE_IDS].sort(), Object.values(MARTIAL_ARTS_MOVES)
    .filter(move => move.nativeFlags.every(flag => flag === 0)).map(move => move.id).sort());
  assert.deepEqual(storyCombatMoveIds(null), [...STORY_STARTING_MOVE_IDS]);
  assert.throws(() => storyCombatMoveIds({}, "unknown"), /Unknown training move/);
});

test("keyboard, preference and direct execution cannot use any unearned technique", () => {
  const allowedMoveIds = storyCombatMoveIds();
  for (const move of Object.values(MARTIAL_ARTS_MOVES).filter(move => !allowedMoveIds.includes(move.id))) {
    const combat = new MartialArtsCombat();
    const player = combat.add(createCombatant({ id: "player", team: "player", proficiency: 100, allowedMoveIds }));
    combat.add(createCombatant({ id: "enemy", team: "enemy", z: 1, yaw: Math.PI }));
    assert.equal(startCombatMove(player, move), false, move.id);
    assert.equal(setCombatCommandOverride(player, move.id), false, move.id);
    for (const command of move.nativeInput) queueCombatCommand(player, command);
    const events = [];
    for (let tick = 0; tick < 90; tick++) events.push(...combat.step());
    for (const event of events.filter(event => event.type === "move-started" || event.type === "throw-acquisition-started")) {
      assert.ok(allowedMoveIds.includes(event.moveId), `${move.id} bypassed ownership via ${event.moveId}`);
    }
  }
});

test("an unlearned counter does not delay ordinary input, while a learned Tornado Kick recognizes normally", () => {
  const combat = new MartialArtsCombat();
  const player = combat.add(createCombatant({ id: "player", allowedMoveIds: storyCombatMoveIds() }));
  for (const command of ["down", "hand", "leg"]) queueCombatCommand(player, command);
  assert.equal(combat.startQueuedMove(player)?.moveId, "crescentKick");

  const learned = createCombatant({ id: "learned", proficiency: 100,
    allowedMoveIds: storyCombatMoveIds({ "story.s1.tornado-kick.learned": true }) });
  combat.add(learned);
  assert.equal(setCombatCommandOverride(learned, "tornadoKick"), true);
  for (const command of ["up", "up", "leg", "leg"]) queueCombatCommand(learned, command);
  assert.equal(combat.startQueuedMove(learned)?.moveId, "tornadoKick");
});

test("missing or malformed learning flags do not grant moves; practice remains unrestricted", () => {
  assert.deepEqual(storyCombatMoveIds({ "story.s1.tornado-kick.learned": "true", "story.s1.swallow-flip.completed": true }), [...STORY_STARTING_MOVE_IDS]);
  const practice = createCombatant();
  assert.equal(practice.allowedMoveIds, null);
  for (const move of Object.values(MARTIAL_ARTS_MOVES)) {
    practice.action = null;
    assert.equal(startCombatMove(practice, move), true, move.id);
  }
});

test('every taught/scroll move has one saved grant and upgraded Story commands replace their base',()=>{
  assert.equal(STORY_LEARNABLE_MOVES.length,17);
  assert.equal(STORY_LEARNABLE_MOVES.filter(m=>m.itemKey).length,9);
  for(const move of STORY_LEARNABLE_MOVES){
    assert.ok(MARTIAL_ARTS_MOVES[move.id]);
    const ids=storyCombatMoveIds({[move.flag]:true});
    assert.ok(ids.includes(move.id));
    assert.equal(ids.length,STORY_STARTING_MOVE_IDS.length+(move.replaces?0:1));
    if(move.replaces)assert.ok(!ids.includes(move.replaces));
    assert.ok(!storyCombatMoveIds({[move.flag]:1}).includes(move.id));
  }
  assert.ok(!storyCombatMoveIds(Object.fromEntries(STORY_LEARNABLE_MOVES.map(m=>[m.flag,true]))).includes('nothingSkill'));
});
