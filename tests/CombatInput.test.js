import assert from "node:assert/strict";
import test from "node:test";
import { CombatInput } from "../play/combat/CombatInput.js";
import {
  MARTIAL_ARTS_MOVES,
  MartialArtsCombat,
  createCombatant,
  queueCombatCommand,
  setCombatCommandOverride,
  startCombatMove,
} from "../src/MartialArtsCombat.js";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.listenerOptions = [];
  }

  addEventListener(type, listener, options) {
    this.listeners.set(type, listener);
    this.listenerOptions.push(["add", type, options]);
  }

  removeEventListener(type, _listener, options) {
    this.listeners.delete(type);
    this.listenerOptions.push(["remove", type, options]);
  }

  dispatch(type, code, repeat = false, target = null) {
    this.listeners.get(type)?.({ code, repeat, target });
  }
}

function timedInput(target, options = {}) {
  let time = 0;
  const input = new CombatInput({
    target,
    now: () => time,
    ...options,
  });
  return {
    input,
    advance(milliseconds) {
      time += milliseconds;
    },
  };
}

test("combat input reads live rebound controls", () => {
  const target = new FakeTarget();
  let now = 0;
  const bindings = {
    toggle: "KeyF",
    controls: "KeyX",
    hand: "KeyJ",
    leg: "KeyK",
    throw: "KeyL",
    guard: "KeyI",
    run: "ShiftLeft",
    up: "KeyW",
    down: "KeyS",
  };
  const input = new CombatInput({
    target,
    getBindings: () => bindings,
    now: () => now,
  });

  bindings.hand = "KeyH";
  target.dispatch("keydown", "KeyH");
  assert.deepEqual(input.consumeCommands(), []);
  now = 100;
  assert.deepEqual(input.consumeCommands(), ["hand"]);
  input.dispose();
});

const KEY_FOR_COMMAND = Object.freeze({
  up: "KeyW",
  down: "KeyS",
  run: "ShiftLeft",
  guard: "KeyI",
  hand: "KeyJ",
  leg: "KeyK",
  throw: "KeyL",
});

function keyboardSchedule(command) {
  const events = [];
  const heldModifiers = new Set();
  let at = 0;
  const pushTap = (code, downAt = at) => {
    events.push([downAt, "keydown", code]);
    events.push([downAt + 10, "keyup", code]);
  };
  for (let index = 0; index < command.length; index += 1) {
    const token = command[index];
    if (token === "up" || token === "down") {
      pushTap(KEY_FOR_COMMAND[token]);
      at += 20;
      continue;
    }
    if (token === "run" || token === "guard") {
      events.push([at, "keydown", KEY_FOR_COMMAND[token]]);
      heldModifiers.add(token);
      continue;
    }
    if (!["hand", "leg", "throw"].includes(token)) continue;
    pushTap(KEY_FOR_COMMAND[token]);
    if (command[index + 1] === "plus") {
      const chordAttack = command[index + 2];
      pushTap(KEY_FOR_COMMAND[chordAttack], at + 20);
      index += 2;
      at += 30;
    } else {
      at += 10;
    }
    for (const modifier of heldModifiers) {
      events.push([at, "keyup", KEY_FOR_COMMAND[modifier]]);
    }
    heldModifiers.clear();
    if (command.slice(index + 1).some(
      (next) => ["hand", "leg", "throw"].includes(next),
    )) {
      at += 80;
    }
  }
  return {
    events: events.sort((left, right) => left[0] - right[0]),
    duration: at + 300,
  };
}

function keyboardResolvedMove(move) {
  const target = new FakeTarget();
  let time = 0;
  const input = new CombatInput({
    target,
    now: () => time,
  });
  const combat = new MartialArtsCombat();
  const fighterOptions = {
    id: "ryo",
    team: "player",
    x: 0,
    z: 0,
    yaw: 0,
  };
  const enemyOptions = {
    id: "enemy",
    team: "enemy",
    x: 0,
    z: 1,
    yaw: Math.PI,
  };
  if (move.positionCondition === "side") {
    fighterOptions.x = 1;
    fighterOptions.z = 0;
    fighterOptions.yaw = -Math.PI / 2;
    enemyOptions.x = 0;
    enemyOptions.z = 0;
    enemyOptions.yaw = 0;
  } else if (move.positionCondition === "back") {
    fighterOptions.z = -1;
    enemyOptions.z = 0;
    enemyOptions.yaw = 0;
  }
  const fighter = combat.add(createCombatant(fighterOptions));
  const enemy = combat.add(createCombatant(enemyOptions));
  if (move.counterCondition) {
    startCombatMove(enemy, MARTIAL_ARTS_MOVES.tigerKnuckle);
  }
  setCombatCommandOverride(fighter, move.id);
  const schedule = keyboardSchedule(move.input);
  let eventIndex = 0;
  let started = null;
  const endTime = schedule.duration + (move.kind === "throw" ? 1000 : 0);
  for (time = 0; time <= endTime; time += 10) {
    while (
      eventIndex < schedule.events.length
      && schedule.events[eventIndex][0] <= time
    ) {
      const [, type, code] = schedule.events[eventIndex];
      target.dispatch(type, code);
      eventIndex += 1;
    }
    for (const command of input.consumeCommands()) {
      queueCombatCommand(fighter, command);
    }
    started ||= combat.update(0.01).find(
      (event) => event.type === "move-started",
    )?.moveId || null;
  }
  input.dispose();
  return started;
}

test("combat input emits directional commands and tracks guard", () => {
  const target = new FakeTarget();
  const { input, advance } = timedInput(target);
  target.dispatch("keydown", "KeyW");
  target.dispatch("keydown", "KeyJ");
  target.dispatch("keydown", "KeyI");
  advance(75);
  assert.deepEqual(input.consumeCommands(), ["up", "hand"]);
  assert.equal(input.guarding, true);
  target.dispatch("keyup", "KeyI");
  assert.equal(input.guarding, false);
  input.dispose();
  assert.equal(target.listeners.size, 0);
  assert.deepEqual(target.listenerOptions, [
    ["add", "keydown", true],
    ["add", "keyup", true],
    ["remove", "keydown", true],
    ["remove", "keyup", true],
  ]);
});

test("combat toggle and attack keys ignore keyboard repeat", () => {
  const target = new FakeTarget();
  const { input, advance } = timedInput(target);
  target.dispatch("keydown", "KeyF");
  target.dispatch("keydown", "KeyF", true);
  assert.equal(input.consumeToggle(), true);
  assert.equal(input.consumeToggle(), false);
  target.dispatch("keydown", "KeyK");
  target.dispatch("keydown", "KeyK", true);
  advance(75);
  assert.deepEqual(input.consumeCommands(), ["leg"]);
});

test("attack buttons form native simultaneous and repeated commands", () => {
  {
    const target = new FakeTarget();
    const { input, advance } = timedInput(target);
    target.dispatch("keydown", "KeyJ");
    advance(20);
    target.dispatch("keydown", "KeyK");
    assert.deepEqual(input.consumeCommands(), ["hand", "plus", "leg"]);
  }
  {
    const target = new FakeTarget();
    const { input, advance } = timedInput(target);
    target.dispatch("keydown", "KeyK");
    advance(20);
    target.dispatch("keyup", "KeyK");
    target.dispatch("keydown", "KeyK");
    assert.deepEqual(input.consumeCommands(), ["leg", "leg"]);
  }
});

test("rapid non-chord attacks remain sequential command components", () => {
  const target = new FakeTarget();
  const { input, advance } = timedInput(target);
  target.dispatch("keydown", "KeyS");
  target.dispatch("keydown", "KeyJ");
  advance(80);
  assert.deepEqual(input.consumeCommands(), ["down", "hand"]);
  target.dispatch("keyup", "KeyJ");
  target.dispatch("keydown", "KeyK");
  assert.deepEqual(input.consumeCommands(), ["leg"]);
});

test("discarding commands clears delayed chord input as well as emitted keys", () => {
  const target = new FakeTarget();
  const { input, advance } = timedInput(target);
  target.dispatch("keydown", "KeyW");
  target.dispatch("keydown", "KeyJ");
  input.discardCommands();
  advance(80);
  assert.deepEqual(input.consumeCommands(), []);

  target.dispatch("keyup", "KeyJ");
  target.dispatch("keydown", "KeyK");
  advance(80);
  assert.deepEqual(input.consumeCommands(), ["leg"]);
});

test("run and guard modifiers emit the native L-trigger and Y chords", () => {
  const target = new FakeTarget();
  const { input, advance } = timedInput(target);
  target.dispatch("keydown", "ShiftLeft");
  target.dispatch("keydown", "KeyJ");
  advance(20);
  target.dispatch("keydown", "KeyK");
  assert.deepEqual(
    input.consumeCommands(),
    ["run", "hand", "plus", "leg"],
  );

  target.dispatch("keyup", "ShiftLeft");
  target.dispatch("keydown", "KeyI");
  target.dispatch("keydown", "KeyL");
  assert.deepEqual(input.consumeCommands(), ["guard", "plus", "throw"]);
});

test("the map-scoped input mode ignores the former global toggle", () => {
  const target = new FakeTarget();
  const input = new CombatInput({ target, enableToggle: false });
  target.dispatch("keydown", "KeyF");
  assert.equal(input.consumeToggle(), false);
  assert.deepEqual(input.consumeCommands(), []);
});

test("X toggles combat controls independently of attack commands", () => {
  const target = new FakeTarget();
  const input = new CombatInput({ target, enableToggle: false });
  target.dispatch("keydown", "KeyX");
  assert.equal(input.consumeControlsToggle(), true);
  assert.equal(input.consumeControlsToggle(), false);
  assert.deepEqual(input.consumeCommands(), []);
});

test("combat keys do not fire while typing in an editable control", () => {
  const target = new FakeTarget();
  const input = new CombatInput({ target });
  const inputElement = {
    closest: () => ({ tagName: "INPUT" }),
  };
  target.dispatch("keydown", "KeyJ", false, inputElement);
  target.dispatch("keydown", "KeyI", false, inputElement);
  assert.deepEqual(input.consumeCommands(), []);
  assert.equal(input.guarding, false);
});

test("every native move resolves end-to-end from physical keyboard timing", () => {
  for (const move of Object.values(MARTIAL_ARTS_MOVES)) {
    assert.equal(
      keyboardResolvedMove(move),
      move.id,
      `${move.label}: ${move.input.join(" ")}`,
    );
  }
});
