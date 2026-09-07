function requireLayer(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 32) {
    throw new RangeError("native numbered MAP layer must be from 0 through 31");
  }
  return value;
}

function requireWord(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native numbered MAP layer state must be an integer");
  }
  return value | 0;
}

export class NativeNumberedMapLayerState {
  constructor() {
    this.values = new Map();
  }

  write(layer, value) {
    const selectedLayer = requireLayer(layer);
    const next = requireWord(value);
    const previous = this.values.get(selectedLayer);
    this.values.set(selectedLayer, next);
    return { layer: selectedLayer, previous, value: next };
  }

  read(layer) {
    return this.values.get(requireLayer(layer));
  }
}

export function createNativeNumberedMapLayerSemanticHandlers() {
  return {
    "numbered-map-layer-state": async ({ context, readArgument }) => {
      const state = context.nativeNumberedMapLayerState;
      if (!(state instanceof NativeNumberedMapLayerState)) {
        return {
          status: "stopped",
          reason: "native-numbered-map-layer-state-missing",
        };
      }
      try {
        return {
          status: "continued",
          mutation: state.write(readArgument(0), readArgument(1)),
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-numbered-map-layer-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

export function createNativeNumberedMapLayerState() {
  return new NativeNumberedMapLayerState();
}
