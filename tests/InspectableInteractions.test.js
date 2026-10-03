import assert from "node:assert/strict";
import test from "node:test";
import { InspectableInteractions } from "../play/interactions/InspectableInteractions.js";

const emote = { id: "dobuitaGacha" };
const machine = { label: "Capsule machine", interactionEmoteId: emote.id };
function harness(overrides = {}) {
  const locks = [], clips = [], hints = [];
  let resolve, reject, signal;
  const interaction = new InspectableInteractions({
    dom: { inspectHint: {} }, runtimeEmotes: [emote], fallbackEmotes: [],
    setMetadata() {}, showNotice: text => hints.push(text),
    resolvePose: () => ({ position: [1, 0, 2], yaw: 0 }),
    approach: (_pose, inputSignal) => {
      signal = inputSignal;
      return new Promise((yes, no) => { resolve = yes; reject = no; });
    },
    setMovementLocked: value => locks.push(value),
    playEmote: (...args) => { clips.push(args); return true; },
    ...overrides,
  });
  return { interaction, locks, clips, hints, arrive: () => resolve(),
    fail: error => reject(error), signal: () => signal };
}

test("staged inspection walks first, ignores extra clicks, and unlocks only its completed animation", async () => {
  const h = harness();
  const pending = h.interaction.inspect(machine);
  assert.equal(h.interaction.busy, true);
  assert.deepEqual(h.locks, [true]);
  assert.equal(h.clips.length, 0);
  assert.equal(await h.interaction.inspect(machine), false);
  h.interaction.finishAnimation(emote); // clearing an old emote during approach
  assert.equal(h.interaction.busy, true);
  h.arrive();
  assert.equal(await pending, true);
  assert.deepEqual(h.clips, [[emote, null, { inspectable: machine }]]);
  assert.equal(await h.interaction.inspect(machine), false);
  h.interaction.finishAnimation({ id: "bow" });
  assert.equal(h.interaction.busy, true);
  h.interaction.finishAnimation(emote);
  assert.equal(h.interaction.busy, false);
  assert.deepEqual(h.locks, [true, false]);
});

test("blocked approach and unavailable animation both release movement with a notice", async () => {
  const h = harness();
  const pending = h.interaction.inspect(machine);
  h.fail(new Error("Couldn't reach the machine."));
  assert.equal(await pending, false);
  assert.equal(h.clips.length, 0);
  assert.deepEqual(h.locks, [true, false]);
  assert.match(h.hints.at(-1), /reach/);
  const missing = harness({ approach: async () => {}, playEmote: () => false });
  assert.equal(await missing.interaction.inspect(machine), false);
  assert.deepEqual(missing.locks, [true, false]);
  assert.match(missing.hints.at(-1), /animation is unavailable/);
});

for (const outcome of ["arrive", "fail"]) {
  test(`world cleanup aborts approach and ignores its late ${outcome} without unlocking a newer interaction`, async () => {
    const h = harness();
    const old = h.interaction.inspect(machine);
    const oldSignal = h.signal();
    // Settle the old promise before starting the next approach; its continuation
    // will run after the new owner has acquired the movement lock.
    const complete = outcome === "arrive" ? h.arrive : () => h.fail(new Error("cancelled"));
    h.interaction.clear();
    assert.equal(oldSignal.aborted, true);
    complete();
    const next = h.interaction.inspect(machine);
    await old;
    assert.equal(h.interaction.busy, true);
    assert.deepEqual(h.locks, [true, false, true]);
    assert.equal(h.clips.length, 0);
    h.arrive();
    assert.equal(await next, true);
    h.interaction.clear();
    assert.equal(h.interaction.busy, false);
  });
}

test("ordinary examination still plays immediately without acquiring a movement lock", async () => {
  const h = harness({ resolvePose: () => null });
  assert.equal(await h.interaction.inspect(machine), true);
  assert.equal(h.clips.length, 1);
  assert.deepEqual(h.locks, []);
});

test("a staged interaction never substitutes a generic thinking animation for missing content", async () => {
  const h = harness({ runtimeEmotes: [], fallbackEmotes: [{ id: "thinking" }] });
  assert.equal(await h.interaction.inspect(machine), false);
  assert.equal(h.clips.length, 0);
  assert.deepEqual(h.locks, []);
  assert.match(h.hints.at(-1), /animation is unavailable/);
});

test('capsule interaction waits for one server award, then shows the saved toy after the animation', async () => {
  let award;
  let purchases = 0;
  const h = harness({purchase: () => { purchases++; return new Promise(resolve => { award = resolve; }); }});
  const pending = h.interaction.inspect(machine);
  assert.equal(purchases, 0);
  h.arrive();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(purchases, 1);
  assert.equal(h.clips.length, 0);
  assert.equal(await h.interaction.inspect(machine), false);
  award({itemName:'Akira 1'});
  assert.equal(await pending, true);
  h.interaction.finishAnimation(emote);
  assert.match(h.hints.at(-1), /Collected: Akira 1/);
  assert.deepEqual(h.locks, [true, false]);
});

test('rejected and world-cancelled purchases do not play or unlock a later owner', async () => {
  const rejected = harness({purchase: async () => { throw Error('You need ¥100.'); }});
  const denied = rejected.interaction.inspect(machine);
  rejected.arrive();
  assert.equal(await denied, false);
  assert.equal(rejected.clips.length, 0);
  assert.match(rejected.hints.at(-1), /¥100/);
  assert.deepEqual(rejected.locks, [true, false]);
  let award;
  const h = harness({purchase: () => new Promise(resolve => { award = resolve; })});
  const pending = h.interaction.inspect(machine);
  h.arrive();
  await new Promise(resolve => setImmediate(resolve));
  h.interaction.clear();
  award({itemName:'Akira 1'});
  assert.equal(await pending, false);
  assert.equal(h.clips.length, 0);
  assert.deepEqual(h.locks, [true, false]);
});

for (const outcome of ['close', 'failure', 'world-change']) {
  test(`toy reveal retains movement ownership until ${outcome}`, async () => {
    let resolve, reject;
    const inspection = {begin() {}, prepare() {}, close() {},
      show: () => new Promise((r, j) => { resolve = r; reject = j; })};
    const h = harness({inspection, purchase: async () => ({itemName: 'NiGHTS 1'})});
    const pending = h.interaction.inspect(machine);
    h.arrive(); await pending;
    h.interaction.finishAnimation(emote);
    assert.equal(h.interaction.busy, true);
    assert.equal(h.interaction.active.phase, 'inspecting');
    assert.deepEqual(h.locks, [true]);
    if (outcome === 'world-change') {
      h.interaction.clear();
      const next = h.interaction.inspect(machine);
      resolve(); await new Promise(r => setImmediate(r));
      assert.equal(h.interaction.active.phase, 'approaching');
      assert.deepEqual(h.locks, [true, false, true]);
      h.arrive(); await next; h.interaction.clear();
    } else {
      if (outcome === 'failure') reject(Error('Loading timed out')); else resolve();
      await new Promise(r => setImmediate(r));
      assert.equal(h.interaction.busy, false);
      assert.deepEqual(h.locks, [true, false]);
      if (outcome === 'failure') assert.match(h.hints.at(-1), /Collected: NiGHTS 1.*timed out/);
    }
  });
}
