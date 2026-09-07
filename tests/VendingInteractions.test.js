import assert from "node:assert/strict";
import test from "node:test";
import { VendingInteractions } from "../play/interactions/VendingInteractions.js";

class FakeElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.hidden = true;
    this.disabled = false;
    this.textContent = "";
    this.attributes = new Map();
    this.listeners = new Map();
    this.nameChild = null;
  }

  set innerHTML(_value) {
    this.nameChild = new FakeElement();
  }

  replaceChildren() {
    this.children.length = 0;
  }

  append(child) {
    this.children.push(child);
  }

  querySelector(selector) {
    if (selector === ".vending-option-name") return this.nameChild;
    if (selector === "button") return this.children[0] || null;
    return null;
  }

  querySelectorAll(selector) {
    return selector === "button" ? this.children : [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  focus() {
    this.focused = true;
  }
}

function fakeDom() {
  return {
    vendingPrice: new FakeElement(),
    vendingOptions: new FakeElement(),
    vendingClose: new FakeElement(),
    vendingOverlay: new FakeElement(),
    vendingStatus: new FakeElement(),
  };
}

test("a purchased drink holds movement until its native animation ends", async () => {
  const dom = fakeDom();
  const locks = [];
  const hints = [];
  const prepared = [];
  const emotes = [];
  const documentRef = {
    createElement: () => new FakeElement(),
    addEventListener() {},
  };
  const interaction = new VendingInteractions({
    dom,
    documentRef,
    setMetadata() {},
    setMovementLocked: (locked) => locks.push(locked),
    showHint: (hint) => hints.push(hint),
    approach: async () => {},
    purchase: async () => ({
      requestId: "purchase-0001",
      drinkKey: "jet_cola",
      winningCan: false,
      outcome: "purchased",
      message: "Jet Cola",
      yen: 400,
      inventory: [],
    }),
    playEmote: (emote, _option, context) => {
      emotes.push({ emote, context });
      return true;
    },
    runtimeEmotes: [
      { id: "vendingDrink" },
      { id: "vendingCoffee" },
      { id: "dobuitaNoMoney" },
    ],
    drinkProp: {
      prepare: async (resourceCode) => prepared.push(resourceCode),
      update() {},
      hide() {},
      clear() {},
    },
  });
  assert.equal(dom.vendingOptions.children.length, 5);
  const entry = {
    root: {},
    machine: { id: "dobuita-vm-0-0" },
  };
  interaction.open(entry);
  await interaction.buy({
    key: "jet_cola",
    name: "Jet Cola",
    resourceCode: "COKE",
    temperature: "cold",
  });

  assert.deepEqual(prepared, ["COKE"]);
  assert.equal(emotes[0].emote.id, "vendingDrink");
  assert.equal(emotes[0].context.vendingMachine, entry);
  assert.deepEqual(hints, ["Jet Cola"]);
  assert.deepEqual(locks, [true]);
  assert.equal(interaction.animating, true);
  assert.equal(dom.vendingOverlay.hidden, true);

  interaction.finishAnimation();
  assert.deepEqual(locks, [true, false]);
  assert.equal(interaction.animating, false);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {resolve = a; reject = b;});
  return {promise, resolve, reject};
}

function harness(overrides = {}) {
  const calls = [], locks = [];
  const interaction = new VendingInteractions({
    dom: fakeDom(), documentRef: {createElement: () => new FakeElement(), addEventListener() {}},
    setMetadata() {}, setMovementLocked: value => locks.push(value),
    showHint: value => calls.push(["hint", value]),
    approach: async () => {calls.push(["approach"]);},
    purchase: async () => {calls.push(["purchase"]); return {drinkKey: "jet_cola"};},
    playEmote: emote => {calls.push(["emote", emote.id]); return true;},
    runtimeEmotes: [{id: "vendingDrink"}, {id: "vendingCoffee"}],
    drinkProp: {prepare: async () => {}, hide() {}, clear() {}},
    ...overrides,
  });
  interaction.open({root: {}, machine: {id: "dobuita-vm-0-0"}});
  return {interaction, calls, locks};
}
const cola = {key: "jet_cola", name: "Jet Cola", temperature: "cold"};

test("purchase waits for approach, ignores duplicate clicks, and unlocks when playback cannot start", async () => {
  const arrival = deferred(); let purchases = 0;
  const {interaction, locks} = harness({
    approach: () => arrival.promise,
    purchase: async () => {purchases++; return {drinkKey: "jet_cola"};},
    playEmote: () => false,
  });
  const buy = interaction.buy(cola);
  await interaction.buy(cola);
  assert.equal(purchases, 0);
  assert.equal(interaction.dom.vendingOverlay.hidden, true);
  assert.equal(interaction.close(), false);
  arrival.resolve(); await buy;
  assert.equal(purchases, 1);
  assert.deepEqual(locks, [true, false]);
});

test("a blocked approach does not charge and can be retried", async () => {
  let attempts = 0;
  const {interaction, locks, calls} = harness({approach: async () => {
    if (++attempts === 1) throw new Error("Blocked");
  }});
  await interaction.buy(cola);
  assert.equal(calls.some(([kind]) => kind === "purchase"), false);
  assert.deepEqual(locks, [true, false]);
  interaction.open({root: {}, machine: {id: "dobuita-vm-0-0"}});
  await interaction.buy(cola);
  assert.equal(interaction.animating, true);
});

test("world replacement cancels approach and ignores late purchase and prop results", async () => {
  for (const phase of ["approach", "purchase", "prepare"]) {
    const pending = deferred(); let signal;
    const options = phase === "prepare"
      ? {drinkProp: {prepare: (_code, options) => {signal = options.signal; return pending.promise;}, clear() {}, hide() {}}}
      : {[phase]: (_entry, argument) => {if (phase === "approach") signal = argument; return pending.promise;}};
    const {interaction, calls, locks} = harness(options);
    const buy = interaction.buy(cola);
    await Promise.resolve(); await Promise.resolve();
    interaction.clear();
    if (signal) assert.equal(signal.aborted, true);
    pending.resolve({drinkKey: "jet_cola"}); await buy;
    assert.equal(interaction.active, null);
    assert.equal(interaction.animating, false);
    assert.equal(calls.some(([kind]) => kind === "emote"), false);
    assert.deepEqual(locks, [true, false], phase);
  }
});

test("network, asset and playback failures release movement without repeating the transaction", async () => {
  for (const phase of ["purchase", "prepare", "playEmote"]) {
    const fail = () => {throw new Error(`${phase} failed`);};
    const {interaction, locks} = harness(phase === "prepare"
      ? {drinkProp: {prepare: fail, hide() {}, clear() {}}}
      : {[phase]: fail});
    await interaction.buy(cola);
    assert.equal(interaction.pending, false, phase);
    assert.equal(interaction.animating, false, phase);
    assert.equal(locks.at(-1), false, phase);
  }
});
