import assert from "node:assert/strict";
import test from "node:test";
import { DrawerInteractions } from "../play/interactions/DrawerInteractions.js";

function drawerHarness(state) {
  const cues = [];
  const interactions = new DrawerInteractions({
    signedRenderKey: () => 0,
    onAudioCue: (cue) => cues.push(cue),
  });
  interactions.setPose = () => {};
  const drawer = {
    root: {
      getAbsolutePosition: () => ({ x: 1, y: 2, z: 3 }),
    },
    objectTag: "ATS1",
    state,
    elapsed: 0,
    openedByPlayer: state === "open",
  };
  interactions.entries.push(drawer);
  return { cues, drawer, interactions };
}

test("JOMO drawer emits the native opening-start phase at toggle", () => {
  const { cues, drawer, interactions } = drawerHarness("closed");
  interactions.toggle(drawer);
  assert.equal(drawer.state, "opening");
  assert.equal(drawer.openedByPlayer, true);
  assert.deepEqual(cues, [{
    type: "nativeJomoDrawerPhase",
    objectTag: "ATS1",
    phase: "openingStart",
    position: { x: 1, y: 2, z: 3 },
  }]);
});

test("JOMO drawer emits closing-start then impact at animation completion", () => {
  const { cues, drawer, interactions } = drawerHarness("open");
  interactions.toggle(drawer);
  assert.equal(drawer.state, "closing");
  assert.equal(cues[0].phase, "closingStart");

  interactions.update(1);
  assert.equal(drawer.state, "closed");
  assert.equal(drawer.openedByPlayer, false);
  assert.equal(cues[1].phase, "closingImpact");
  assert.equal(cues.length, 2);
});

test("drawer phase audio does not retrigger during an active transition", () => {
  const { cues, drawer, interactions } = drawerHarness("closed");
  interactions.toggle(drawer);
  interactions.toggle(drawer);
  assert.equal(cues.length, 1);
});
