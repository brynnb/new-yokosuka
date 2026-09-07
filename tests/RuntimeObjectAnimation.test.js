import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOCK_ALARM_ANIMATION_HZ,
  CLOCK_ALARM_BODY_TRAVEL,
  CLOCK_ALARM_STRIKER_TURN,
  CLOCK_ALARM_TICKS,
  DRAWER_ANIMATION_HZ,
  D000_DOOR_ANIMATION_HZ,
  D000_DOOR_NODE_12_ENDPOINT,
  D000_DOOR_NODE_12_OPEN_SAMPLES,
  HINGED_DOOR_TURN,
  HINGED_DOOR_OPEN_SAMPLES,
  SHENMUE2_PAIRED_SLIDING_DOOR_OPEN_SAMPLES,
  SLIDING_DOOR_OPEN_SAMPLES,
  evaluateClockAlarm,
  evaluateDrawerClosing,
  evaluateDrawerOpening,
  evaluateD000DoorNode12,
  evaluateD000TkoSpin,
  evaluateD000TkoSlowdown,
  evaluateHingedDoor,
  evaluatePairedGateSwing,
  evaluateShenmue2PairedSlidingDoor,
  evaluateSlidingDoor,
  selectD000DoorRoute,
} from "../src/RuntimeObjectAnimation.js";

test("swings paired gate leaves apart instead of crossing them", () => {
  assert.deepEqual(evaluatePairedGateSwing(0), [0, -0]);
  assert.deepEqual(
    evaluatePairedGateSwing(1),
    [HINGED_DOOR_TURN, -HINGED_DOOR_TURN],
  );
  assert.deepEqual(
    evaluatePairedGateSwing(1, -1),
    [-HINGED_DOOR_TURN, HINGED_DOOR_TURN],
  );
});

test("replays the captured drawer delay, handle turn, and open endpoint", () => {
  assert.deepEqual(evaluateDrawerOpening(0), {
    progress: 0,
    handleRotation: 0,
    done: false,
  });
  assert.equal(
    evaluateDrawerOpening(2 / DRAWER_ANIMATION_HZ).handleRotation,
    -Math.PI / 2,
  );
  assert.equal(evaluateDrawerOpening(6 / DRAWER_ANIMATION_HZ).progress, 0);
  assert.equal(evaluateDrawerOpening(30 / DRAWER_ANIMATION_HZ).progress, 1);
  assert.deepEqual(evaluateDrawerOpening(31 / DRAWER_ANIMATION_HZ), {
    progress: 1,
    handleRotation: 0,
    done: true,
  });
});

test("uses the captured curve in reverse for browser drawer closing", () => {
  assert.equal(evaluateDrawerClosing(0).progress, 1);
  assert.deepEqual(evaluateDrawerClosing(24 / DRAWER_ANIMATION_HZ), {
    progress: 0,
    handleRotation: 0,
    done: true,
  });
});

test("replays captured sliding-door endpoints in both directions", () => {
  const duration = (
    (SLIDING_DOOR_OPEN_SAMPLES.length - 1) / DRAWER_ANIMATION_HZ
  );
  assert.deepEqual(evaluateSlidingDoor(0), {
    progress: 0,
    done: false,
  });
  assert.deepEqual(evaluateSlidingDoor(duration), {
    progress: 1,
    done: true,
  });
  assert.deepEqual(evaluateSlidingDoor(0, true), {
    progress: 1,
    done: false,
  });
  assert.deepEqual(evaluateSlidingDoor(duration, true), {
    progress: 0,
    done: true,
  });
});

test("replays the native S2 paired-slider curve in both directions", () => {
  const duration = (
    (SHENMUE2_PAIRED_SLIDING_DOOR_OPEN_SAMPLES.length - 1)
    / DRAWER_ANIMATION_HZ
  );
  assert.deepEqual(evaluateShenmue2PairedSlidingDoor(0), {
    progress: 0,
    done: false,
  });
  assert.deepEqual(evaluateShenmue2PairedSlidingDoor(duration), {
    progress: 1,
    done: true,
  });
  assert.deepEqual(evaluateShenmue2PairedSlidingDoor(0, true), {
    progress: 1,
    done: false,
  });
  assert.deepEqual(evaluateShenmue2PairedSlidingDoor(duration, true), {
    progress: 0,
    done: true,
  });
});

test("replays the wardrobe leaf rotation curve in both directions", () => {
  const duration = (
    (HINGED_DOOR_OPEN_SAMPLES.length - 1) / DRAWER_ANIMATION_HZ
  );
  assert.equal(evaluateHingedDoor(0).progress, 0);
  assert.deepEqual(evaluateHingedDoor(duration), {
    progress: 1,
    done: true,
  });
  assert.equal(evaluateHingedDoor(0, true).progress, 1);
  assert.deepEqual(evaluateHingedDoor(duration, true), {
    progress: 0,
    done: true,
  });
});

test("replays the exact D000 selector-53 node-12 fixed-turn curve", () => {
  assert.equal(
    D000_DOOR_NODE_12_ENDPOINT * 65536 / (Math.PI * 2),
    -16679,
  );
  assert.equal(D000_DOOR_NODE_12_OPEN_SAMPLES.length, 53);
  assert.equal(evaluateD000DoorNode12(0).progress, 0);
  assert.equal(
    evaluateD000DoorNode12(1 / D000_DOOR_ANIMATION_HZ).progress,
    910 / 16679,
  );
  const duration = (
    (D000_DOOR_NODE_12_OPEN_SAMPLES.length - 1)
    / D000_DOOR_ANIMATION_HZ
  );
  assert.deepEqual(evaluateD000DoorNode12(duration), {
    progress: 1,
    done: true,
  });
  assert.equal(evaluateD000DoorNode12(0, true).progress, 1);
  assert.deepEqual(evaluateD000DoorNode12(duration, true), {
    progress: 0,
    done: true,
  });
});

test("selects the native paired D000 door leaf from the player side", () => {
  assert.deepEqual(selectD000DoorRoute(0.2, [7, 12]), {
    renderNodeKey: 12,
    browserTurnDirection: 1,
  });
  assert.deepEqual(selectD000DoorRoute(-0.2, [7, 12]), {
    renderNodeKey: 7,
    browserTurnDirection: -1,
  });
  assert.deepEqual(selectD000DoorRoute(-0.2, [12]), {
    renderNodeKey: 12,
    browserTurnDirection: -1,
  });
});

test("replays TKOK/TKOL's reflected -910 fixed-turn ambient step", () => {
  const expectedBrowserTurn = 910 * Math.PI * 2 / 65536;
  assert.ok(Math.abs(evaluateD000TkoSpin(1 / 30) - expectedBrowserTurn) < 1e-12);
  assert.ok(Math.abs(evaluateD000TkoSpin(2 / 30) - 2 * expectedBrowserTurn) < 1e-12);
});

test("replays TKOM/TKON's statically decoded 40-tick slowdown curve", () => {
  assert.deepEqual(evaluateD000TkoSlowdown(0), {
    rotationY: 0,
    done: false,
    completedTicks: 0,
  });
  const turn = Math.PI * 2 / 65536;
  assert.deepEqual(evaluateD000TkoSlowdown(1 / 30), {
    rotationY: 888 * turn,
    done: false,
    completedTicks: 1,
  });
  assert.deepEqual(evaluateD000TkoSlowdown(2 / 30), {
    rotationY: (888 + 866) * turn,
    done: false,
    completedTicks: 2,
  });
  const complete = evaluateD000TkoSlowdown(100);
  assert.equal(complete.completedTicks, 40);
  assert.equal(complete.done, true);
  // Arithmetic series: 888 + 866 + ... + 30.
  assert.ok(Math.abs(complete.rotationY - 18360 * turn) < 1e-12);
});

test("replays the statically decoded JOMO alarm-clock alternation", () => {
  assert.deepEqual(evaluateClockAlarm(0), {
    bodyOffset: CLOCK_ALARM_BODY_TRAVEL / 2,
    strikerRotationY: CLOCK_ALARM_STRIKER_TURN,
    done: false,
  });
  assert.deepEqual(evaluateClockAlarm(1 / CLOCK_ALARM_ANIMATION_HZ), {
    bodyOffset: -CLOCK_ALARM_BODY_TRAVEL / 2,
    strikerRotationY: 0,
    done: false,
  });
  assert.deepEqual(
    evaluateClockAlarm(CLOCK_ALARM_TICKS / CLOCK_ALARM_ANIMATION_HZ),
    {
      bodyOffset: 0,
      strikerRotationY: 0,
      done: true,
    },
  );
});
