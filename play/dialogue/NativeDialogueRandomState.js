function requireChoiceCount(count) {
  const numeric = Number(count);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 0xff) {
    throw new RangeError(`Invalid native dialogue random choice count ${count}`);
  }
  return numeric;
}

function requireHistoryEntry(value) {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xff) {
    throw new RangeError(`Invalid native dialogue random history value ${value}`);
  }
  return numeric;
}

export class NativeDialogueRandomState {
  constructor(snapshot = {}) {
    const history = snapshot.history ?? [null, null, null];
    if (!Array.isArray(history) || history.length !== 3) {
      throw new RangeError("Native dialogue random history must have 3 slots");
    }
    this.history = history.map(requireHistoryEntry);
    this.groupCursor = 0;
  }

  beginMessageConstruction() {
    this.groupCursor = 0;
  }

  choose(count, randomFloat = Math.random) {
    const choiceCount = requireChoiceCount(count);
    const randomValue = Number(randomFloat());
    if (!Number.isFinite(randomValue)) {
      throw new TypeError("Native dialogue random source returned a non-number");
    }
    let choice = Math.floor(Math.max(0, Math.min(
      randomValue,
      1 - Number.EPSILON,
    )) * choiceCount);

    // FUN_0c15b5a8 keeps three choice slots across message constructions.
    // During the next construction it compares each of its first three E0
    // operations with the corresponding prior slot. A repeat moves to the
    // immediately preceding option, wrapping zero to the final option.
    if (this.groupCursor < this.history.length) {
      if (this.history[this.groupCursor] === choice) {
        choice = choice === 0 ? choiceCount - 1 : choice - 1;
      }
      this.history[this.groupCursor] = choice;
      this.groupCursor += 1;
    }
    return choice;
  }

  toJSON() {
    return {
      schema: "new-yokosuka-native-dialogue-random-v1",
      history: [...this.history],
    };
  }
}

export function createNativeDialogueRandomState(snapshot) {
  return new NativeDialogueRandomState(snapshot);
}
