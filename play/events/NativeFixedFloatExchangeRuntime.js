import {
  nativeFloat32FromWord,
} from "./NativeEventNumericRuntime.js";

const EXCHANGE_MODES = new Set([0, 1, 2]);
const MODE_FIVE_ROUTES = new Set(["0,1,0", "6,1,0"]);
const MODE_SIX_VALUES = new Set([4, 7]);

function stopped(reason) {
  return { status: "stopped", reason };
}

function word(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer word`);
  }
  return value >>> 0;
}

/** Exact three-channel fixed float ownership exposed by operation 0x006e. */
export class NativeFixedFloatExchangeState {
  constructor() {
    this.channelWords = [0, 0, 0];
    this.channelOneMirrorWord = 0;
  }

  exchange(channel, suppliedWord) {
    if (!EXCHANGE_MODES.has(channel)) {
      throw new RangeError(`native fixed float channel ${channel} is unsupported`);
    }
    const nextWord = word(suppliedWord, "native fixed float exchange value");
    const previousWord = this.channelWords[channel];
    const query = nativeFloat32FromWord(nextWord) < 0;
    if (!query) {
      this.channelWords[channel] = nextWord;
      if (channel === 1) this.channelOneMirrorWord = nextWord;
    }
    return {
      mode: channel,
      suppliedWord: nextWord,
      previousWord,
      currentWord: this.channelWords[channel],
      query,
      ...(channel === 1
        ? { mirrorWord: this.channelOneMirrorWord }
        : {}),
    };
  }

  clear() {
    this.channelWords.fill(0);
    this.channelOneMirrorWord = 0;
  }
}

export function createNativeFixedFloatExchangeState() {
  return new NativeFixedFloatExchangeState();
}

export function createNativeFixedFloatExchangeSemanticHandlers({
  state = createNativeFixedFloatExchangeState(),
  applyNativeFixedFloatExchange,
} = {}) {
  return {
    "native-fixed-float-exchange-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      if (EXCHANGE_MODES.has(mode)) {
        if (action.arguments?.length !== 2) {
          return stopped("native-fixed-float-exchange-shape-unproved");
        }
        const detail = {
          mode,
          suppliedWord: readArgument(1),
        };
        const apply = applyNativeFixedFloatExchange
          || context.applyNativeFixedFloatExchange
          || (route => state.exchange(route.mode, route.suppliedWord));
        const mutation = await apply(detail);
        return {
          status: "continued",
          result: word(
            mutation.previousWord,
            "native fixed float exchange previous value",
          ),
          mutation,
        };
      }
      if (mode === 5) {
        if (
          action.arguments?.length !== 4
          || !MODE_FIVE_ROUTES.has([
            readArgument(1), readArgument(2), readArgument(3),
          ].join(","))
        ) {
          return stopped("native-fixed-float-mode-five-route-unproved");
        }
        return {
          status: "continued",
          result: 0,
          mutation: {
            mode,
            arguments: [readArgument(1), readArgument(2), readArgument(3)],
            applied: false,
            nativeReason: "unmatched-selector-default",
          },
        };
      }
      if (
        mode === 6
        && action.arguments?.length === 2
        && MODE_SIX_VALUES.has(readArgument(1))
      ) {
        return {
          status: "continued",
          result: 0,
          mutation: {
            mode,
            arguments: [readArgument(1)],
            applied: false,
            nativeReason: "exact-empty-helper",
          },
        };
      }
      return stopped("native-fixed-float-exchange-route-unproved");
    },
  };
}
