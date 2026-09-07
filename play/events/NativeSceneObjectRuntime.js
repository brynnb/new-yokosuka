function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native scene object requires a four-character ID");
  }
  for (const character of fourcc) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError("native scene object ID must be byte-oriented");
    }
  }
  return fourcc;
}

function requireVector3Words(value) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError(
      "native three-component vector must contain exactly three integer words",
    );
  }
  return value.map(word => word >>> 0);
}

function float32FromWord(word) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, word >>> 0, true);
  return view.getFloat32(0, true);
}

function float32Word(value) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, Math.fround(value), true);
  return view.getUint32(0, true);
}

function addFloat32Words(left, right) {
  return float32Word(
    Math.fround(float32FromWord(left) + float32FromWord(right)),
  );
}

function addUint32Words(left, right) {
  return (left + right) >>> 0;
}

function objectTagArgument(action, readArgument, index) {
  const operand = action.arguments?.[index];
  if (
    operand?.kind === "constant"
    && typeof operand.ascii === "string"
  ) {
    return operand.ascii;
  }
  const value = readArgument(index);
  if (typeof value === "string") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native scene-object tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function actionSource(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

export class NativeSceneObjectVectorState {
  constructor() {
    // Operation 0x0018 owns float32 position vectors through the native
    // +0x08/+0x0c/+0x10 accessors. Operation 0x001d uses a different direct
    // vector (+0x14/+0x18/+0x1c) and an associated-object virtual dispatch.
    // The direct CATA path contains fixed-turn orientation, while the exact
    // Hato associated path contains a world position. Preserve the native
    // vector families here; presentation assigns meaning only with that path.
    this.objectPositionVectors = {
      direct: new Map(),
      associated: new Map(),
    };
    this.objectSecondaryVectors = {
      direct: new Map(),
      associated: new Map(),
    };
    // Operation 0x0027 writes the direct object vector stored at native
    // offsets +0x34/+0x38/+0x3c. Authored values and executable consumers
    // establish this as the presentation scale vector.
    this.objectScaleVectors = new Map();
    this.motmRecords = new Map();
    this.directPointTransforms = new Map();
    this.nativeVectors = new Map();
  }

  writeObjectVector(objectTag, vector, { associated = false } = {}) {
    const key = requireFourcc(objectTag);
    const words = requireVector3Words(vector);
    this.objectPositionVectors[associated ? "associated" : "direct"].set(
      key, words,
    );
    return [...words];
  }

  readObjectVector(objectTag, { associated = false } = {}) {
    const key = requireFourcc(objectTag);
    const vector = this.objectPositionVectors[
      associated ? "associated" : "direct"
    ].get(key);
    return vector ? [...vector] : undefined;
  }

  writeObjectSecondaryVector(objectTag, vector, { associated = false } = {}) {
    const key = requireFourcc(objectTag);
    const words = requireVector3Words(vector);
    this.objectSecondaryVectors[associated ? "associated" : "direct"].set(
      key, words,
    );
    return [...words];
  }

  readObjectSecondaryVector(objectTag, { associated = false } = {}) {
    const key = requireFourcc(objectTag);
    const vector = this.objectSecondaryVectors[
      associated ? "associated" : "direct"
    ].get(key);
    return vector ? [...vector] : undefined;
  }

  writeObjectScaleVector(objectTag, vector) {
    const key = requireFourcc(objectTag);
    const words = requireVector3Words(vector);
    this.objectScaleVectors.set(key, words);
    return [...words];
  }

  readObjectScaleVector(objectTag) {
    const vector = this.objectScaleVectors.get(requireFourcc(objectTag));
    return vector ? [...vector] : undefined;
  }

  writeObjectVectorComponent({
    objectTag,
    componentIndex,
    value,
    associated = false,
  }) {
    if (!Number.isInteger(componentIndex) || componentIndex < 0 || componentIndex > 2) {
      throw new RangeError("native object-vector component index must be 0, 1, or 2");
    }
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError("native object-vector component must be a uint32 word");
    }
    const previousVector = this.readObjectVector(objectTag, { associated });
    if (!previousVector) return undefined;
    const nextVector = [...previousVector];
    const previous = nextVector[componentIndex];
    nextVector[componentIndex] = value >>> 0;
    this.writeObjectVector(objectTag, nextVector, { associated });
    return { previous, value: value >>> 0, vector: nextVector };
  }

  initializeObjectVector({ objectTag, flags, vector }) {
    if (!Number.isInteger(flags)) {
      throw new TypeError("native object vector flags must be an integer");
    }
    const associated = Boolean((flags >>> 0) & 0x40000000);
    const replace = Boolean((flags >>> 0) & 0x80000000);
    const selectedMasks = [0x20000000, 0x10000000, 0x08000000];
    const previous = this.readObjectVector(objectTag, { associated });
    if (!previous) {
      throw new Error(
        `native ${associated ? "associated" : "direct"} object vector `
        + `for ${requireFourcc(objectTag)} is unavailable`,
      );
    }
    const supplied = requireVector3Words(vector);
    const next = previous.map((word, index) => {
      if (!((flags >>> 0) & selectedMasks[index])) return word;
      return replace ? supplied[index] : addFloat32Words(word, supplied[index]);
    });
    this.writeObjectVector(objectTag, next, { associated });
    return [...next];
  }

  applyObjectVectorOperation({ objectTag, flags, vector }) {
    if (!Number.isInteger(flags)) {
      throw new TypeError("native object vector flags must be an integer");
    }
    const unsignedFlags = flags >>> 0;
    if ((unsignedFlags & 0x04200000) === 0x04200000) {
      throw new Error(
        "native object angular-vector operation requires its exact adapter",
      );
    }
    const associated = Boolean(unsignedFlags & 0x40000000);
    const add = Boolean(unsignedFlags & 0x80000000);
    const selectedMasks = [0x20000000, 0x10000000, 0x08000000];
    const supplied = requireVector3Words(vector);
    let previous = this.readObjectSecondaryVector(objectTag, { associated });
    // A full replacement is independent of the prior native secondary vector.
    // Partial replacement and addition still require its exact initial state.
    const replacesEveryComponent = !add && selectedMasks.every(
      mask => Boolean(unsignedFlags & mask),
    );
    if (!previous && replacesEveryComponent) previous = [0, 0, 0];
    if (!previous) {
      throw new Error(
        `native ${associated ? "associated" : "direct"} object secondary vector `
        + `for ${requireFourcc(objectTag)} is unavailable`,
      );
    }
    const next = previous.map((word, index) => {
      if (!(unsignedFlags & selectedMasks[index])) return word;
      return add ? addUint32Words(word, supplied[index]) : supplied[index];
    });
    this.writeObjectSecondaryVector(objectTag, next, { associated });
    return [...next];
  }

  readObjectBaseVector({ objectTag, associated = false }) {
    return this.readObjectVector(objectTag, { associated });
  }

  configureObjectMotmRecord({
    objectTag,
    available,
    componentVectors = [],
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native MOTM record availability must be boolean");
    }
    if (!Array.isArray(componentVectors)) {
      throw new TypeError("native MOTM component vectors must be an array");
    }
    const components = new Map();
    for (const component of componentVectors) {
      if (
        !component
        || !Number.isInteger(component.selector)
        || component.selector < -128
        || component.selector > 127
      ) {
        throw new RangeError(
          "native MOTM component selector must be a signed byte",
        );
      }
      if (components.has(component.selector)) {
        throw new Error(
          `native MOTM component selector ${component.selector} is duplicated`,
        );
      }
      components.set(
        component.selector,
        requireVector3Words(component.vector),
      );
    }
    this.motmRecords.set(requireFourcc(objectTag), {
      available,
      components,
    });
  }

  readObjectMotmComponentVector({ objectTag, selector }) {
    if (!Number.isInteger(selector)) {
      throw new TypeError("native MOTM component selector must be an integer");
    }
    const record = this.motmRecords.get(requireFourcc(objectTag));
    if (!record) return undefined;
    if (!record.available) return { matched: false };
    const vector = record.components.get(selector);
    return vector
      ? { matched: true, vector: [...vector] }
      : { matched: false };
  }

  configureObjectDirectPointTransform({
    objectTag,
    available,
    transformPoint,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError(
        "native direct object transform availability must be boolean",
      );
    }
    if (available && typeof transformPoint !== "function") {
      throw new TypeError(
        "native direct object transform callback is required",
      );
    }
    this.directPointTransforms.set(requireFourcc(objectTag), {
      available,
      transformPoint,
    });
  }

  transformObjectPointToDirectSpace({ objectTag, vector }) {
    const transform = this.directPointTransforms.get(
      requireFourcc(objectTag),
    );
    if (!transform) return undefined;
    const input = requireVector3Words(vector);
    if (!transform.available) return null;
    return transform.transformPoint([...input]);
  }

  writeNativeVector(pointer, vector) {
    if (pointer === undefined || pointer === null) {
      throw new TypeError("native vector destination is required");
    }
    this.nativeVectors.set(pointer, requireVector3Words(vector));
  }

  readNativeVector(pointer) {
    const vector = this.nativeVectors.get(pointer);
    return vector ? [...vector] : undefined;
  }
}

export function createNativeSceneObjectSemanticHandlers({
  hasSceneObject,
  readObjectRuntimeFlag,
  writeObjectRuntimeFlag,
  writeObjectPresentationFlag,
  initializeSceneObjectVector,
  applySceneObjectVectorOperation,
  readSceneObjectBaseVector,
  readSceneObjectMotmComponentVector,
  transformSceneObjectPointToDirectSpace,
  readNativeVector,
  writeNativeVector,
  writeSceneObjectScaleVector,
} = {}) {
  const writeVectorDestination = async ({
    action,
    argumentIndex,
    context,
    readArgument,
    writeVector,
    vector,
  }) => {
    const operand = action.arguments?.[argumentIndex];
    if (operand?.kind === "frame-address") {
      if (
        !Number.isInteger(operand.offset)
        || typeof context.writeFrameField !== "function"
      ) {
        throw new Error("native frame-vector destination is unavailable");
      }
      vector.forEach((value, component) => context.writeFrameField({
        offset: operand.offset + component * 4,
        value: value >>> 0,
      }));
      return { frameVectorOffset: operand.offset };
    }
    if (typeof writeVector !== "function") {
      throw new Error("native-vector-writer-missing");
    }
    const destination = readArgument(argumentIndex);
    await writeVector(destination, vector);
    return { destination };
  };
  const vectorWordsFromAddress = (operand, context) => {
    if (
      operand?.kind !== "frame-address"
      && operand?.kind !== "scene-address"
    ) {
      return undefined;
    }
    const read = operand.kind === "frame-address"
      ? context.readFrameField
      : context.readSceneField;
    if (typeof read !== "function" || !Number.isInteger(operand.offset)) {
      return undefined;
    }
    const vector = [0, 4, 8].map(
      component => read(operand.offset + component),
    );
    return vector.every(Number.isInteger)
      ? vector.map(word => word >>> 0)
      : undefined;
  };
  const requireObject = async (objectTag) => {
    if (typeof hasSceneObject !== "function") return null;
    const exists = await hasSceneObject(objectTag);
    if (typeof exists !== "boolean") {
      return {
        status: "stopped",
        reason: "scene-object-query-result-invalid",
      };
    }
    if (!exists) {
      return {
        status: "stopped",
        reason: `scene-object-unavailable:${objectTag}`,
      };
    }
    return null;
  };
  const flagHandler = ({
    readOption,
    writeOption,
    contextRead,
    contextWrite,
    unavailableReason,
  }) => async ({ action, context, readArgument }) => {
    const read = readOption || context[contextRead];
    const write = writeOption || context[contextWrite];
    if (typeof read !== "function" || typeof write !== "function") {
      return { status: "stopped", reason: unavailableReason };
    }
    const objectTag = objectTagArgument(action, readArgument, 0);
    const missing = await requireObject(objectTag);
    if (missing) return missing;
    const mode = readArgument(1);
    if (mode === 0) {
      const enabled = await read(objectTag);
      if (typeof enabled !== "boolean") {
        return {
          status: "stopped",
          reason: "scene-object-flag-result-invalid",
        };
      }
      return { result: enabled ? 1 : 0 };
    }
    if (mode !== 1 && mode !== 2) {
      return {
        status: "stopped",
        reason: `scene-object-flag-mode-unhandled:${mode}`,
      };
    }
    const enabled = mode === 1;
    await write(objectTag, enabled);
    return {
      status: "continued",
      result: enabled ? 1 : 0,
      mutation: {
        objectTag,
        enabled,
        source: actionSource(action, context),
      },
    };
  };
  const presentationFlagHandler = async ({
    action,
    context,
    readArgument,
  }) => {
    const write = (
      writeObjectPresentationFlag
      || context.writeObjectPresentationFlag
    );
    if (typeof write !== "function") {
      return {
        status: "stopped",
        reason: "object-presentation-flag-adapter-missing",
      };
    }
    const objectTag = objectTagArgument(action, readArgument, 0);
    const missing = await requireObject(objectTag);
    if (missing) return missing;
    const mode = readArgument(1);
    if (mode !== 0 && mode !== 1) {
      return {
        status: "stopped",
        reason: `object-presentation-flag-mode-unhandled:${mode}`,
      };
    }
    const enabled = mode === 1;
    await write(objectTag, enabled);
    return {
      status: "continued",
      mutation: {
        objectTag,
        enabled,
        source: actionSource(action, context),
      },
    };
  };
  return {
    "scene-object-exists-query": async ({ action, readArgument }) => {
      if (typeof hasSceneObject !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-query-adapter-missing",
        };
      }
      const objectTag = objectTagArgument(action, readArgument, 1);
      const exists = await hasSceneObject(objectTag);
      if (typeof exists !== "boolean") {
        return {
          status: "stopped",
          reason: "scene-object-query-result-invalid",
        };
      }
      return { result: exists ? 1 : 0 };
    },
    "resolved-object-runtime-flag": flagHandler({
      readOption: readObjectRuntimeFlag,
      writeOption: writeObjectRuntimeFlag,
      contextRead: "readObjectRuntimeFlag",
      contextWrite: "writeObjectRuntimeFlag",
      unavailableReason: "object-runtime-flag-adapter-missing",
    }),
    "resolved-object-presentation-flag": presentationFlagHandler,
    "resolved-object-scale-vector-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const writeScale = (
        writeSceneObjectScaleVector
        || context.writeSceneObjectScaleVector
      );
      if (typeof writeScale !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-scale-vector-writer-missing",
        };
      }
      const objectTag = objectTagArgument(action, readArgument, 0);
      const missing = await requireObject(objectTag);
      if (missing) return missing;
      const operand = action.arguments?.[1];
      let vector = vectorWordsFromAddress(operand, context);
      if (!vector) {
        const readVector = readNativeVector || context.readNativeVector;
        if (typeof readVector !== "function") {
          return {
            status: "stopped",
            reason: "native-vector-reader-missing",
          };
        }
        vector = await readVector(readArgument(1));
      }
      if (!Array.isArray(vector) || vector.length !== 3) {
        return {
          status: "stopped",
          reason: "native-scale-vector-source-unavailable",
        };
      }
      const words = await writeScale(objectTag, vector);
      return {
        status: "continued",
        mutation: {
          kind: "object-scale-vector",
          objectTag,
          words: requireVector3Words(words ?? vector),
          source: actionSource(action, context),
        },
      };
    },
    "resolved-object-vector-initialize": async ({
      action,
      context,
      readArgument,
    }) => {
      const initialize = (
        initializeSceneObjectVector
        || context.initializeSceneObjectVector
      );
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof initialize !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-vector-initializer-missing",
        };
      }
      if (typeof readVector !== "function") {
        return {
          status: "stopped",
          reason: "native-vector-reader-missing",
        };
      }
      const objectTag = objectTagArgument(action, readArgument, 0);
      const flags = readArgument(1) >>> 0;
      const operand = action.arguments?.[2];
      let vector = vectorWordsFromAddress(operand, context);
      let vectorPointer;
      if (!vector) {
        vectorPointer = readArgument(2);
        vector = await readVector(vectorPointer);
      }
      if (!Array.isArray(vector) || vector.length !== 3) {
        return {
          status: "stopped",
          reason: "native-vector-source-unavailable",
        };
      }
      await initialize({
        objectTag,
        flags,
        vector,
        ...(Number.isInteger(vectorPointer) ? { vectorPointer } : {}),
        ...(operand?.kind === "frame-address"
          ? { frameVectorOffset: operand.offset }
          : {}),
        associated: Boolean(flags & 0x40000000),
        composition: flags & 0x80000000 ? "replace" : "add",
        componentMask: {
          x: Boolean(flags & 0x20000000),
          y: Boolean(flags & 0x10000000),
          z: Boolean(flags & 0x08000000),
        },
        source: actionSource(action, context),
      });
      return { status: "continued" };
    },
    "resolved-object-vector-operation": async ({
      action,
      context,
      readArgument,
    }) => {
      const apply = (
        applySceneObjectVectorOperation
        || context.applySceneObjectVectorOperation
      );
      if (typeof apply !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-vector-operation-adapter-missing",
        };
      }
      const flags = readArgument(1) >>> 0;
      if ((flags & 0x04200000) === 0x04200000) {
        return {
          status: "stopped",
          reason: "scene-object-angular-vector-operation-unhandled",
        };
      }
      const operand = action.arguments?.[2];
      let vector = vectorWordsFromAddress(operand, context);
      if (!vector) {
        const readVector = readNativeVector || context.readNativeVector;
        if (typeof readVector !== "function") {
          return {
            status: "stopped",
            reason: "native-vector-reader-missing",
          };
        }
        vector = await readVector(readArgument(2));
      }
      if (
        !Array.isArray(vector)
        || vector.length !== 3
        || vector.some(word => !Number.isInteger(word))
      ) {
        return {
          status: "stopped",
          reason: "native-vector-source-unavailable",
        };
      }
      try {
        const objectTag = objectTagArgument(action, readArgument, 0);
        const result = await apply({
          objectTag,
          flags,
          vector,
          source: actionSource(action, context),
        });
        return {
          status: "continued",
          mutation: {
            objectTag,
            flags,
            vector: vector.map(word => word >>> 0),
            next: result,
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "resolved-object-base-vector-query": async ({
      action,
      context,
      readArgument,
    }) => {
      const readObjectVector = (
        readSceneObjectBaseVector
        || context.readSceneObjectBaseVector
      );
      const writeVector = writeNativeVector || context.writeNativeVector;
      if (typeof readObjectVector !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-base-vector-reader-missing",
        };
      }
      const objectTag = objectTagArgument(action, readArgument, 0);
      const selector = readArgument(1) >>> 0;
      if (selector !== 0xffffffff) {
        return {
          status: "stopped",
          reason: "scene-object-vector-selector-not-base",
        };
      }
      const flags = readArgument(3) >>> 0;
      const vector = await readObjectVector({
        objectTag,
        associated: Boolean(flags & 0x40000000),
        source: actionSource(action, context),
      });
      if (!Array.isArray(vector) || vector.length !== 3) {
        return {
          status: "stopped",
          reason: "scene-object-base-vector-unavailable",
        };
      }
      try {
        await writeVectorDestination({
          action,
          argumentIndex: 2,
          context,
          readArgument,
          writeVector,
          vector,
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      return { status: "continued" };
    },
    "resolved-object-indexed-vector-query": async ({
      action,
      context,
      readArgument,
    }) => {
      const readComponent = (
        readSceneObjectMotmComponentVector
        || context.readSceneObjectMotmComponentVector
      );
      const readBase = (
        readSceneObjectBaseVector
        || context.readSceneObjectBaseVector
      );
      const transformDirect = (
        transformSceneObjectPointToDirectSpace
        || context.transformSceneObjectPointToDirectSpace
      );
      const writeVector = writeNativeVector || context.writeNativeVector;
      if (typeof readBase !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-base-vector-reader-missing",
        };
      }
      const objectTag = objectTagArgument(action, readArgument, 0);
      const selector = readArgument(1) >> 0;
      const flags = readArgument(3) >>> 0;
      const associated = Boolean(flags & 0x40000000);
      const zeroFallback = Boolean(flags & 0x01000000);
      if (selector !== -1 && typeof readComponent !== "function") {
        return {
          status: "stopped",
          reason: "scene-object-motm-component-adapter-missing",
        };
      }
      const selected = selector === -1
        ? { matched: false, baseSelector: true }
        : await readComponent({
            objectTag,
            selector,
            source: actionSource(action, context),
          });
      if (selected === undefined) {
        return {
          status: "stopped",
          reason: "scene-object-motm-state-unavailable",
        };
      }
      if (!selected || typeof selected.matched !== "boolean") {
        return {
          status: "stopped",
          reason: "scene-object-motm-result-invalid",
        };
      }
      let vector;
      let vectorSource;
      if (!selected.matched) {
        if (zeroFallback && !selected.baseSelector) {
          vector = [0, 0, 0];
          vectorSource = "zero-fallback";
        } else {
          vector = await readBase({
            objectTag,
            associated,
            source: actionSource(action, context),
          });
          vectorSource = selected.baseSelector ? "base" : "base-fallback";
        }
      } else {
        vector = selected.vector;
        vectorSource = "motm-component";
        if (!associated) {
          if (typeof transformDirect !== "function") {
            return {
              status: "stopped",
              reason: "scene-object-direct-transform-adapter-missing",
            };
          }
          const transformed = await transformDirect({
            objectTag,
            vector,
            source: actionSource(action, context),
          });
          if (transformed === undefined) {
            return {
              status: "stopped",
              reason: "scene-object-direct-transform-unavailable",
            };
          }
          if (transformed !== null) vector = transformed;
        }
      }
      if (
        !Array.isArray(vector)
        || vector.length !== 3
        || vector.some(word => !Number.isInteger(word))
      ) {
        return {
          status: "stopped",
          reason: "scene-object-indexed-vector-unavailable",
        };
      }
      const output = vector.map(word => word >>> 0);
      let destinationDetail;
      try {
        destinationDetail = await writeVectorDestination({
          action,
          argumentIndex: 2,
          context,
          readArgument,
          writeVector,
          vector: output,
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      return {
        status: "continued",
        mutation: {
          objectTag,
          selector,
          associated,
          ...(zeroFallback ? { zeroFallback: true } : {}),
          vectorSource,
          ...destinationDetail,
          vector: output,
        },
      };
    },
  };
}

export function createNativeSceneObjectVectorState() {
  return new NativeSceneObjectVectorState();
}
