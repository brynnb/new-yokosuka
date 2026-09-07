function stopped(reason) {
  return { status: "stopped", reason };
}

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

function float32FromWord(word) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, requireWord(word, "native camera-shake word"), true);
  return view.getFloat32(0, true);
}

export class NativeCameraShakeState {
  constructor() {
    this.clear();
  }

  clear() {
    this.horizontalAmplitudeWord = 0;
    this.verticalAmplitudeWord = 0;
    this.retentionWord = 0x3f800000;
  }

  read() {
    return Object.freeze({
      horizontalAmplitudeWord: this.horizontalAmplitudeWord,
      verticalAmplitudeWord: this.verticalAmplitudeWord,
      retentionWord: this.retentionWord,
    });
  }

  write({ horizontalAmplitudeWord, verticalAmplitudeWord, retentionWord }) {
    const source = Object.freeze({
      horizontalAmplitudeWord: requireWord(
        horizontalAmplitudeWord,
        "native camera-shake horizontal amplitude",
      ),
      verticalAmplitudeWord: requireWord(
        verticalAmplitudeWord,
        "native camera-shake vertical amplitude",
      ),
      retentionWord: requireWord(
        retentionWord,
        "native camera-shake retention",
      ),
    });
    const previous = this.read();
    if (float32FromWord(source.retentionWord) > 0) {
      this.horizontalAmplitudeWord = source.horizontalAmplitudeWord;
      this.verticalAmplitudeWord = source.verticalAmplitudeWord;
      this.retentionWord = source.retentionWord;
    } else {
      this.horizontalAmplitudeWord = 0;
      this.verticalAmplitudeWord = 0;
      this.retentionWord = 0x3f800000;
    }
    return Object.freeze({ previous, source, current: this.read() });
  }
}

export function createNativeCameraShakeState() {
  return new NativeCameraShakeState();
}

export function createNativeCameraShakeSemanticHandlers({ state } = {}) {
  return {
    "native-camera-shake-envelope-write": async ({ context, readArgument }) => {
      const target = state || context.nativeCameraShakeState;
      if (!(target instanceof NativeCameraShakeState)) {
        return stopped("native-camera-shake-state-missing");
      }
      try {
        return {
          status: "continued",
          mutation: target.write({
            horizontalAmplitudeWord: readArgument(0),
            verticalAmplitudeWord: readArgument(1),
            retentionWord: readArgument(2),
          }),
        };
      } catch (error) {
        return stopped(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
