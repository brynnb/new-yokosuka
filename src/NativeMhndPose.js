const TARGET_ROW_HEX = new Map([
  [-1, "c90000c900001400fbbf00fbba00fbd800000af100ecf100ecf900f60000c40000d30000d30000140000ce0000ce0000ce0000190000c90000c90000c900001400fbbf00fbba00fbd800000a00000000"],
  [0, "00000000000000000000000000000000c731000000000000c7310000c731000000000000c73100000000000000000000000000000000000039ce00000000000039ce000039ce00000000000039ce0000"],
  [1, "000000000000000000000000380e0000000000008e030000000000000000000072fc000000000000000000000000000000000000380e0000000000008e030000000000000000000072fc000000000000"],
  [2, "0000000000000000000000007509000091100000580200009110000091100000a8fd000091100000000000000000000000000000750900006fef0000580200006fef00006fef0000a8fd00006fef0000"],
  [3, "000000000000000000000000c304000035210000350100003521000035210000cbfe000035210000000000000000000000000000c3040000cbde000035010000cbde0000cbde0000cbfe0000cbde0000"],
  [4, "000000000000000000000000380e0000000000008e03000000000000c731000000000000c7310000000000000000000000000000380e0000000000008e0300000000000039ce00000000000039ce0000"],
  [5, "0000000000c0000000000000380e0000000000008e030000000000000000000072fc000000000000000000000040000000000000380e0000000000008e030000000000000000000072fc000000000000"],
  [6, "00000000000000000000000075090000aa0a0000580200009110000091100000a8fd0000e31800000000000000000000000000007509000056f50000580200006fef00006fef0000a8fd00001de70000"],
  [7, "00000000000000000000000000000000002000008e030000002000000000000000000000380e00000000000000000000000000000000000000e000008e03000000e000000000000000000000c8f10000"],
  [8, "000000000000000000000000c3040000aa0a0000580200009110000091100000a8fd00001c270000000000000000000000000000c304000056f50000580200006fef00006fef0000a8fd0000e4d80000"],
  [9, "00000000000000000000000066060000380e00006c010000380e0000380e000094fe0000711c000000000000000000000000000066060000c8f100006c010000c8f10000c8f1000094fe00008fe30000"],
  [10, "0000000000000000000000001c070000c71100006c010000c7110000c711000094fe0000aa2a00000000000000000000000000001c07000039ee00006c01000039ee000039ee000094fe000056d50000"],
  [11, "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"],
  [12, "000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000"],
  [13, "000000000000000000000000380e0000e31800001c07000011110000e31800000000000055150000000000000000000000000000380e00001de700001c070000efee00001de7000000000000abea0000"],
  [14, "00000000c8f100000000000000000000c73100008e030000c7310000c731000072fc0000c731000000000000380e0000000000000000000039ce00008e03000039ce000039ce000072fc000039ce0000"],
]);

export const NATIVE_MHND_WORD_COUNT = 10;
export const NATIVE_MHND_NATIVE_TICKS_PER_AUTH_FRAME = 2;

// FUN_0c0d8f30/FUN_0c0d9044 write these exact HRCM rotation fields. The
// right hand is MHND subcontroller 0 and the left hand is subcontroller 1.
export const NATIVE_MHND_BODY_CHANNELS = Object.freeze({
  right: Object.freeze({
    subcontrollerIndex: 0,
    rootRenderKey: -65,
    controls: Object.freeze([
      Object.freeze({ renderKey: -65, rx: 0, ry: 1, rz: 2 }),
      Object.freeze({ renderKey: 25, rz: 3 }),
      Object.freeze({ renderKey: 26, rz: 3 }),
      Object.freeze({ renderKey: 28, ry: 4, rz: 5 }),
      Object.freeze({ renderKey: 29, ry: 6 }),
      Object.freeze({ renderKey: 31, ry: 7, rz: 8 }),
      Object.freeze({ renderKey: 32, ry: 9 }),
    ]),
  }),
  left: Object.freeze({
    subcontrollerIndex: 1,
    rootRenderKey: -66,
    controls: Object.freeze([
      Object.freeze({ renderKey: -66, rx: 0, ry: 1, rz: 2 }),
      Object.freeze({ renderKey: 40, rz: 3 }),
      Object.freeze({ renderKey: 41, rz: 3 }),
      Object.freeze({ renderKey: 43, ry: 4, rz: 5 }),
      Object.freeze({ renderKey: 44, ry: 6 }),
      Object.freeze({ renderKey: 46, ry: 7, rz: 8 }),
      Object.freeze({ renderKey: 47, ry: 9 }),
    ]),
  }),
});

function decodeRow(hex) {
  const words = [];
  for (let index = 0; index < hex.length; index += 8) {
    const bytes = [
      hex.slice(index, index + 2),
      hex.slice(index + 2, index + 4),
      hex.slice(index + 4, index + 6),
      hex.slice(index + 6, index + 8),
    ].map(byte => Number.parseInt(byte, 16));
    words.push((
      bytes[0]
      | (bytes[1] << 8)
      | (bytes[2] << 16)
      | (bytes[3] << 24)
    ) >>> 0);
  }
  return Object.freeze(words);
}

const TARGET_ROWS = new Map(
  [...TARGET_ROW_HEX].map(([index, hex]) => [index, decodeRow(hex)]),
);

export function nativeMhndTargetWords(index, subcontrollerIndex) {
  const row = TARGET_ROWS.get(index | 0);
  if (!row || (subcontrollerIndex !== 0 && subcontrollerIndex !== 1)) {
    return null;
  }
  const start = subcontrollerIndex * NATIVE_MHND_WORD_COUNT;
  return row.slice(start, start + NATIVE_MHND_WORD_COUNT);
}

export function signedNativeMhndWord(value) {
  return (value << 16) >> 16;
}

export function createNativeMhndPoseState() {
  return {
    current: new Int32Array(NATIVE_MHND_WORD_COUNT),
    target: new Int32Array(NATIVE_MHND_WORD_COUNT),
    delta: new Int32Array(NATIVE_MHND_WORD_COUNT),
    remainingNativeTicks: 0,
    engaged: false,
    active: false,
  };
}

export function initializeNativeMhndPoseState(state, source) {
  if (
    !state?.current
    || state.current.length !== NATIVE_MHND_WORD_COUNT
    || !source
    || source.length !== NATIVE_MHND_WORD_COUNT
    || state.engaged
  ) return false;
  for (let index = 0; index < NATIVE_MHND_WORD_COUNT; index += 1) {
    state.current[index] = signedNativeMhndWord(source[index]);
  }
  state.target.set(state.current);
  state.delta.fill(0);
  state.remainingNativeTicks = 0;
  state.active = false;
  return true;
}

export function startNativeMhndPoseTransition(state, target, duration) {
  if (
    !state?.current
    || state.current.length !== NATIVE_MHND_WORD_COUNT
    || !target
    || target.length !== NATIVE_MHND_WORD_COUNT
    || !Number.isInteger(duration)
    || duration <= 1
  ) return false;
  state.remainingNativeTicks = duration;
  state.engaged = true;
  state.active = true;
  for (let index = 0; index < NATIVE_MHND_WORD_COUNT; index += 1) {
    state.target[index] = signedNativeMhndWord(target[index]);
    state.delta[index] = Math.trunc(
      (state.target[index] - signedNativeMhndWord(state.current[index]))
      / duration,
    );
  }
  return true;
}

export function stepNativeMhndPoseTransition(
  state,
  nativeTicks = NATIVE_MHND_NATIVE_TICKS_PER_AUTH_FRAME,
) {
  if (!state?.active || !Number.isInteger(nativeTicks) || nativeTicks < 1) {
    return false;
  }
  for (let tick = 0; tick < nativeTicks && state.active; tick += 1) {
    if (state.remainingNativeTicks < 1) {
      state.current.set(state.target);
      state.active = false;
      break;
    }
    for (let index = 0; index < NATIVE_MHND_WORD_COUNT; index += 1) {
      state.current[index] = signedNativeMhndWord(
        state.current[index] + state.delta[index],
      );
    }
    state.remainingNativeTicks -= 1;
    if (state.remainingNativeTicks === 0) {
      state.current.set(state.target);
      state.active = false;
    }
  }
  return true;
}

export function resetNativeMhndPoseState(state) {
  state.current.fill(0);
  state.target.fill(0);
  state.delta.fill(0);
  state.remainingNativeTicks = 0;
  state.engaged = false;
  state.active = false;
}
