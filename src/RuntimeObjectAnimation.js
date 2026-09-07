export const DRAWER_OPEN_DISTANCE = 0.42600011825561523;
export const DRAWER_ANIMATION_HZ = 30;
export const SLIDING_DOOR_DISTANCE = 0.75;
export const SHENMUE2_PAIRED_SLIDING_DOOR_DISTANCE = 0.89990234375;
export const HINGED_DOOR_TURN = 20024 * Math.PI * 2 / 65536;
export const CLOCK_ALARM_ANIMATION_HZ = 30;
export const CLOCK_ALARM_TICKS = 168;
export const CLOCK_ALARM_BODY_TRAVEL = 0.01;
export const CLOCK_ALARM_STRIKER_TURN = (
  -364 * Math.PI * 2 / 65536
);
export const D000_DOOR_ANIMATION_HZ = 30;
export const D000_DOOR_NODE_12_ENDPOINT = -16679 * Math.PI * 2 / 65536;
export const D000_TKO_SPIN_HZ = 30;
export const D000_TKO_SOURCE_FIXED_TURNS_PER_TICK = -910;
export const D000_TKO_SLOWDOWN_TICKS = 40;
export const D000_TKO_SLOWDOWN_STEP = 22;

export function evaluatePairedGateSwing(progress, openSide = 1) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const side = openSide < 0 ? -1 : 1;
  const turn = HINGED_DOOR_TURN * clampedProgress * side;
  return [turn, -turn];
}

// Normalized TASK Z samples captured from Shenmue at 30 Hz. The source
// transition ran from runtime Z=2.440000057 to Z=2.866000175.
export const DRAWER_OPEN_SAMPLES = Object.freeze([
  0,
  0.023857522,
  0.059111001,
  0.105120177,
  0.161030998,
  0.225777854,
  0.298080227,
  0.376444363,
  0.459164393,
  0.544320099,
  0.622364664,
  0.693298089,
  0.757119815,
  0.813830960,
  0.863430966,
  0.901990962,
  0.931431171,
  0.95345802,
  0.969564702,
  0.981031177,
  0.988924733,
  0.994097743,
  0.997191027,
  0.998631052,
  1,
]);

// JOMO's interior sliding-door samples, captured from `dor8` node 7.
export const SLIDING_DOOR_OPEN_SAMPLES = Object.freeze([
  0,
  0.031481984,
  0.075010518,
  0.128172914,
  0.188558122,
  0.253758311,
  0.321355919,
  0.388943156,
  0.454107285,
  0.514471491,
  0.569939097,
  0.623657425,
  0.678003947,
  0.73233064,
  0.785618464,
  0.836852312,
  0.885018428,
  0.929099878,
  0.968084733,
  1,
]);

// Shenmue II's paired MT7 leaves 0x99/0x9a, captured from Pigeon Cafe's
// native R702 controller. The source nodes translate by equal and opposite
// local-X amounts at 30 Hz; their shared parent remains stationary.
export const SHENMUE2_PAIRED_SLIDING_DOOR_OPEN_SAMPLES = Object.freeze([
  0,
  0.000888602991,
  0.003331863809,
  0.007443705914,
  0.013107026587,
  0.020330303852,
  0.028876153011,
  0.038863266413,
  0.050223819859,
  0.062669560499,
  0.076437873033,
  0.091291372762,
  0.107230059685,
  0.124186109604,
  0.142159522518,
  0.161014650027,
  0.180683667933,
  0.201166576234,
  0.222463374932,
  0.244302767227,
  0.26668475312,
  0.289744981009,
  0.313347802496,
  0.337221920781,
  0.361638632664,
  0.386326641346,
  0.411285946826,
  0.436516549105,
  0.461747151384,
  0.487249050461,
  0.51247965274,
  0.537981551818,
  0.563212154097,
  0.588171459577,
  0.613130765057,
  0.638090070537,
  0.66250678242,
  0.686380900705,
  0.709712425393,
  0.733043950081,
  0.755290287575,
  0.777536625068,
  0.798697775366,
  0.81877373847,
  0.838849701574,
  0.857840477482,
  0.875746066196,
  0.892566467716,
  0.90830168204,
  0.923494302767,
  0.937059142702,
  0.949538795442,
  0.960933260988,
  0.970699945741,
  0.979381443299,
  0.986977753663,
  0.992403689636,
  0.996744438416,
  0.998914812805,
  1,
]);

// Wardrobe leaf rotations normalized from the exact fixed-turn recording.
export const HINGED_DOOR_OPEN_SAMPLES = Object.freeze([
  0,
  0x028e / 0x4e38,
  0x0513 / 0x4e38,
  0x0794 / 0x4e38,
  0x0a15 / 0x4e38,
  0x0c9b / 0x4e38,
  0x0f2b / 0x4e38,
  0x11cb / 0x4e38,
  0x1483 / 0x4e38,
  0x175e / 0x4e38,
  0x1a61 / 0x4e38,
  0x1d94 / 0x4e38,
  0x2100 / 0x4e38,
  0x24b4 / 0x4e38,
  0x28c5 / 0x4e38,
  0x2d3a / 0x4e38,
  0x3214 / 0x4e38,
  0x374a / 0x4e38,
  0x3cbf / 0x4e38,
  0x4234 / 0x4e38,
  0x4735 / 0x4e38,
  0x4b1a / 0x4e38,
  0x4d54 / 0x4e38,
  0x4e12 / 0x4e38,
  1,
]);

// D000 selector 53, DR01_011 node 12. These are the 52 distinct game updates
// from the exact fixed-turn RAM recording. Repeated interpreter host frames
// were removed; the game-space endpoint is -16679 (-91.620483 degrees).
const D000_DOOR_NODE_12_FIXED_TURNS = Object.freeze([
  0, -910, -1588, -2029, -2370, -2602, -2714, -2789, -2918, -3132,
  -3223, -3251, -3299, -3437, -3670, -3989, -4384, -4834, -5283,
  -5704, -6117, -6545, -7005, -7483, -7960, -8424, -8882, -9334,
  -9780, -10221, -10659, -11096, -11527, -11947, -12357, -12759,
  -13154, -13543, -13911, -14248, -14555, -14835, -15091, -15326,
  -15541, -15739, -15922, -16092, -16244, -16381, -16502, -16602,
  -16679,
]);
export const D000_DOOR_NODE_12_OPEN_SAMPLES = Object.freeze(
  D000_DOOR_NODE_12_FIXED_TURNS.map(
    (fixedTurn) => (
      fixedTurn === 0
        ? 0
        : fixedTurn / D000_DOOR_NODE_12_FIXED_TURNS.at(-1)
    ),
  ),
);

const HANDLE_FIRST_TICK = 1;
const HANDLE_SECOND_TICK = 2;
const DRAWER_FIRST_TICK = 6;
const HANDLE_RELEASE_TICK = 31;

function interpolateSamples(samples, sampleTime) {
  if (sampleTime <= 0) return samples[0];
  const finalIndex = samples.length - 1;
  if (sampleTime >= finalIndex) return samples[finalIndex];
  const leftIndex = Math.floor(sampleTime);
  const blend = sampleTime - leftIndex;
  return (
    samples[leftIndex]
    + (samples[leftIndex + 1] - samples[leftIndex]) * blend
  );
}

export function evaluateObjectTransition(
  elapsedSeconds,
  samples,
  closing = false,
) {
  const tick = Math.max(0, elapsedSeconds * DRAWER_ANIMATION_HZ);
  const finalIndex = samples.length - 1;
  return {
    progress: interpolateSamples(
      samples,
      closing ? finalIndex - tick : tick,
    ),
    done: tick >= finalIndex,
  };
}

export function evaluateSlidingDoor(elapsedSeconds, closing = false) {
  return evaluateObjectTransition(
    elapsedSeconds,
    SLIDING_DOOR_OPEN_SAMPLES,
    closing,
  );
}

export function evaluateShenmue2PairedSlidingDoor(
  elapsedSeconds,
  closing = false,
) {
  return evaluateObjectTransition(
    elapsedSeconds,
    SHENMUE2_PAIRED_SLIDING_DOOR_OPEN_SAMPLES,
    closing,
  );
}

export function evaluateHingedDoor(elapsedSeconds, closing = false) {
  return evaluateObjectTransition(
    elapsedSeconds,
    HINGED_DOOR_OPEN_SAMPLES,
    closing,
  );
}

export function evaluateD000DoorNode12(elapsedSeconds, closing = false) {
  const tick = Math.max(0, elapsedSeconds * D000_DOOR_ANIMATION_HZ);
  const finalIndex = D000_DOOR_NODE_12_OPEN_SAMPLES.length - 1;
  return {
    progress: interpolateSamples(
      D000_DOOR_NODE_12_OPEN_SAMPLES,
      closing ? finalIndex - tick : tick,
    ),
    done: tick >= finalIndex,
  };
}

// The native paired-door caller reduces the actor/door relative heading to a
// quadrant. Quadrants 2/3 route to the left node (12); 0/1 route to the
// right node (7). In browser coordinates this is the sign of door-local Z.
// Single-leaf models expose only node 12 and retain it on either side.
export function selectD000DoorRoute(playerLocalZ, availableRenderKeys) {
  const keys = new Set(availableRenderKeys);
  const positiveSide = playerLocalZ >= 0;
  const preferredRenderKey = positiveSide ? 12 : 7;
  const renderNodeKey = keys.has(preferredRenderKey)
    ? preferredRenderKey
    : keys.has(12)
      ? 12
      : keys.has(7)
        ? 7
        : null;
  return {
    renderNodeKey,
    browserTurnDirection: positiveSide ? 1 : -1,
  };
}

// TKOK/TKOL add -910 fixed-turn units to source node 0x98 once per 30 Hz
// game update. Mt5Loader reflects source Y rotation into Babylon -Y, so the
// browser-space delta has the opposite sign. Continuous interpolation avoids
// displaying the original five-degree update steps at modern render rates.
export function evaluateD000TkoSpin(elapsedSeconds) {
  const browserFixedTurns = (
    -D000_TKO_SOURCE_FIXED_TURNS_PER_TICK
    * D000_TKO_SPIN_HZ
    * Math.max(0, elapsedSeconds)
  ) % 65536;
  return browserFixedTurns * Math.PI * 2 / 65536;
}

// TKOM/TKON are the state-transition variants of the two TKO fixtures.
// Their MAPINFO routines initialize an unsigned byte counter to 40 and, once
// per game update, add this source-space Y rotation before decrementing it:
//
//   -910 + (41 - counter) * 22, counter = 40 .. 1
//
// Keep this evaluator separate from the ambient runtime registration. The
// transform curve is exact, but its story/time-state trigger has not yet been
// recovered, so applying it automatically at page load would invent state.
export function evaluateD000TkoSlowdown(elapsedSeconds) {
  const completedTicks = Math.min(
    D000_TKO_SLOWDOWN_TICKS,
    Math.max(0, Math.floor(elapsedSeconds * D000_TKO_SPIN_HZ)),
  );
  let sourceFixedTurns = 0;
  for (let tick = 1; tick <= completedTicks; tick += 1) {
    sourceFixedTurns += (
      D000_TKO_SOURCE_FIXED_TURNS_PER_TICK
      + tick * D000_TKO_SLOWDOWN_STEP
    );
  }
  return {
    // Mt5Loader reflects source Y into Babylon -Y.
    rotationY: sourceFixedTurns === 0
      ? 0
      : -sourceFixedTurns * Math.PI * 2 / 65536,
    done: completedTicks >= D000_TKO_SLOWDOWN_TICKS,
    completedTicks,
  };
}

export function evaluateDrawerOpening(elapsedSeconds) {
  const tick = Math.max(0, elapsedSeconds * DRAWER_ANIMATION_HZ);
  let handleRotation = 0;
  if (tick > 0 && tick < HANDLE_FIRST_TICK) {
    handleRotation = -Math.PI * 0.25 * tick;
  } else if (tick < HANDLE_SECOND_TICK) {
    handleRotation = (
      -Math.PI * 0.25
      - Math.PI * 0.25 * (tick - HANDLE_FIRST_TICK)
    );
  } else if (tick < HANDLE_RELEASE_TICK) {
    handleRotation = -Math.PI * 0.5;
  }

  return {
    progress: interpolateSamples(
      DRAWER_OPEN_SAMPLES,
      tick - DRAWER_FIRST_TICK,
    ),
    handleRotation,
    done: tick >= HANDLE_RELEASE_TICK,
  };
}

export function evaluateDrawerClosing(elapsedSeconds) {
  const tick = Math.max(0, elapsedSeconds * DRAWER_ANIMATION_HZ);
  const finalIndex = DRAWER_OPEN_SAMPLES.length - 1;
  return {
    progress: interpolateSamples(
      DRAWER_OPEN_SAMPLES,
      finalIndex - tick,
    ),
    handleRotation: 0,
    done: tick >= finalIndex,
  };
}

// JOMO's native SH-4 room script alternates TOKE node 0x98 between two
// positions 0.01 units apart and node 0x99 between -364 and 0 fixed-turn
// units. Its coroutine counter accepts values 0..167, giving 168 ticks.
export function evaluateClockAlarm(elapsedSeconds) {
  const tick = Math.max(
    0,
    Math.floor(elapsedSeconds * CLOCK_ALARM_ANIMATION_HZ),
  );
  if (tick >= CLOCK_ALARM_TICKS) {
    return {
      bodyOffset: 0,
      strikerRotationY: 0,
      done: true,
    };
  }
  const initialPose = tick % 2 === 0;
  return {
    bodyOffset: initialPose
      ? CLOCK_ALARM_BODY_TRAVEL / 2
      : -CLOCK_ALARM_BODY_TRAVEL / 2,
    strikerRotationY: initialPose ? CLOCK_ALARM_STRIKER_TURN : 0,
    done: false,
  };
}
