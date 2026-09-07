const NATIVE_WORD = new DataView(new ArrayBuffer(4));
const f32 = Math.fround;

function fadd(left, right) {
  return f32(f32(left) + f32(right));
}

function fsub(left, right) {
  return f32(f32(left) - f32(right));
}

function fmul(left, right) {
  return f32(f32(left) * f32(right));
}

function fdiv(left, right) {
  return f32(f32(left) / f32(right));
}

export function nativeFloat32FromWord(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError("native float operand must be a 32-bit word");
  }
  NATIVE_WORD.setUint32(0, value >>> 0, true);
  return NATIVE_WORD.getFloat32(0, true);
}

export function nativeFloat32Word(value) {
  NATIVE_WORD.setFloat32(0, f32(value), true);
  return NATIVE_WORD.getUint32(0, true);
}

export function nativeBinaryAngleSineWord(value) {
  const angle = value & 0xffff;
  const radians = fdiv(
    fmul(f32(angle), f32(6.283185005187988)),
    f32(65536),
  );
  const halfAngle = fdiv(radians, f32(2));
  const quadrant = Math.trunc(fadd(
    fdiv(halfAngle, f32(1.570796251296997)),
    f32(0.5),
  ));
  const reduced = fsub(
    halfAngle,
    fmul(f32(quadrant), f32(1.570796251296997)),
  );
  const squared = fmul(reduced, reduced);
  let fraction = f32(0);
  for (const denominator of [11, 9, 7, 5, 3]) {
    fraction = fdiv(
      squared,
      fsub(f32(denominator), fraction),
    );
  }
  const tangent = fdiv(reduced, fsub(f32(1), fraction));
  const numerator = fmul(f32(2), tangent);
  const denominator = fadd(
    f32(1),
    fmul(tangent, tangent),
  );
  let result = fdiv(numerator, denominator);
  if ((quadrant & 1) !== 0) result = f32(-result);
  return nativeFloat32Word(result);
}

export function nativeBinaryAngleCosineWord(value) {
  let angle = value & 0xffff;
  if (angle > 0x8000) angle = 0x10000 - angle;
  return nativeBinaryAngleSineWord(0x4000 - angle);
}

function nativeBinaryAngleRatio(value) {
  const original = f32(value);
  let reduced = original;
  if (Math.abs(original) > 1) reduced = fdiv(f32(1), original);
  const squared = fmul(reduced, reduced);
  const fractions = [
    [169, 27],
    [144, 25],
    [121, 23],
    [100, 21],
    [81, 19],
    [64, 17],
    [49, 15],
    [36, 13],
    [25, 11],
    [16, 9],
    [9, 7],
    [4, 5],
    [1, 3],
  ];
  let fraction = fdiv(
    fmul(squared, f32(fractions[0][0])),
    f32(fractions[0][1]),
  );
  for (const [numerator, denominator] of fractions.slice(1)) {
    fraction = fdiv(
      fmul(squared, f32(numerator)),
      fadd(f32(denominator), fraction),
    );
  }
  const fullTurn = f32(6.2831854820251465);
  let angle = fdiv(reduced, fadd(f32(1), fraction));
  angle = fadd(angle, fullTurn);
  angle = fmul(angle, f32(65536));
  angle = fdiv(angle, fullTurn);
  const raw = Math.trunc(fadd(angle, f32(0.5))) & 0xffff;
  if (original > 1) return (0x4000 - raw) & 0xffff;
  if (original < -1) return (0xc000 - raw) & 0xffff;
  return raw;
}

export function nativeBinaryAngleFromFloatPairWords(firstWord, secondWord) {
  const first = f32(-nativeFloat32FromWord(firstWord));
  const second = f32(-nativeFloat32FromWord(secondWord));
  const selector = (first > second ? 2 : 0)
    | (f32(-first) > second ? 1 : 0);
  if (selector === 0) {
    return second === 0 ? 0 : nativeBinaryAngleRatio(fdiv(first, second));
  }
  if (selector === 1) {
    return first === 0
      ? 0xc000
      : (0xc000 - nativeBinaryAngleRatio(fdiv(second, first))) & 0xffff;
  }
  if (selector === 2) {
    return first === 0
      ? 0x4000
      : (0x4000 - nativeBinaryAngleRatio(fdiv(second, first))) & 0xffff;
  }
  return second === 0
    ? 0x8000
    : (0x8000 + nativeBinaryAngleRatio(fdiv(first, second))) & 0xffff;
}

export function createNativeNumericSemanticHandlers({
  randomFloat,
  readVector3,
} = {}) {
  const distanceHandler = dimensions => async ({ action, context }) => {
    if (typeof readVector3 !== "function") {
      return {
        status: "stopped",
        reason: "native-vector-reader-missing",
      };
    }
    const left = await readVector3({
      operand: action.arguments?.[1],
      action,
      context,
    });
    const right = await readVector3({
      operand: action.arguments?.[2],
      action,
      context,
    });
    if (
      !Array.isArray(left)
      || !Array.isArray(right)
      || left.length !== 3
      || right.length !== 3
    ) {
      return {
        status: "stopped",
        reason: "native-vector-result-invalid",
      };
    }
    const indices = dimensions === 2 ? [0, 2] : [0, 1, 2];
    let squaredLength = f32(0);
    for (const index of indices) {
      const difference = fsub(
        nativeFloat32FromWord(left[index]),
        nativeFloat32FromWord(right[index]),
      );
      squaredLength = fadd(
        squaredLength,
        fmul(difference, difference),
      );
    }
    return {
      result: nativeFloat32Word(Math.sqrt(squaredLength)),
    };
  };
  return {
    "float-to-integer-truncation": ({ readArgument }) => ({
      result: Math.trunc(nativeFloat32FromWord(readArgument(1))),
    }),
    "binary-angle-from-float-pair": ({ readArgument }) => ({
      result: nativeBinaryAngleFromFloatPairWords(
        readArgument(1),
        readArgument(2),
      ),
    }),
    "signed-integer-to-float": ({ readArgument }) => ({
      result: nativeFloat32Word((readArgument(1) | 0)),
    }),
    "binary-angle-sine": ({ readArgument }) => ({
      result: nativeBinaryAngleSineWord(readArgument(1)),
    }),
    "binary-angle-cosine": ({ readArgument }) => ({
      result: nativeBinaryAngleCosineWord(readArgument(1)),
    }),
    "float-square-root": ({ readArgument }) => ({
      result: nativeFloat32Word(
        Math.sqrt(nativeFloat32FromWord(readArgument(1))),
      ),
    }),
    "float-absolute-value": ({ readArgument }) => ({
      result: (readArgument(1) >>> 0) & 0x7fffffff,
    }),
    "two-dimensional-xz-distance": distanceHandler(2),
    "three-dimensional-distance": distanceHandler(3),
    "scaled-uniform-random-float": ({ readArgument }) => {
      if (typeof randomFloat !== "function") {
        return {
          status: "stopped",
          reason: "shared-random-source-missing",
        };
      }
      const unit = f32(randomFloat());
      const bound = nativeFloat32FromWord(readArgument(1));
      if (!Number.isFinite(unit) || unit < 0 || unit >= 1) {
        return {
          status: "stopped",
          reason: "scaled-random-source-invalid",
        };
      }
      return {
        result: nativeFloat32Word(fmul(unit, bound)),
      };
    },
    "bounded-random-integer": ({ readArgument }) => {
      if (typeof randomFloat !== "function") {
        return {
          status: "stopped",
          reason: "shared-random-source-missing",
        };
      }
      const bound = Number(readArgument(1));
      const unit = Number(randomFloat());
      if (
        !Number.isInteger(bound)
        || bound <= 0
        || !Number.isFinite(unit)
        || unit < 0
        || unit >= 1
      ) {
        return {
          status: "stopped",
          reason: "bounded-random-operands-invalid",
        };
      }
      return {
        result: Math.trunc(fmul(unit, f32(bound))),
      };
    },
  };
}
