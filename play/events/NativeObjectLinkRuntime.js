function requireFourcc(value, label) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(`${label} requires a four-character ID`);
  }
  for (const character of fourcc) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError(`${label} ID must be byte-oriented`);
    }
  }
  return fourcc;
}

function fourccFromWord(value, label) {
  if (typeof value === "string") return requireFourcc(value, label);
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} is unavailable`);
  }
  const word = value >>> 0;
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ), label);
}

function objectTagArgument(action, readArgument, index, label) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii, label);
  }
  return fourccFromWord(readArgument(index), label);
}

function captureWords(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError(`${label} must contain exactly three integer words`);
  }
  return value.map(word => word >>> 0);
}

function requireWord(value, label) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

const REQUIRED_ADAPTERS = [
  "resolveNativeObjectLinkObject",
  "captureNativeObjectLinkStateA",
  "captureNativeObjectLinkStateB",
  "writeNativeObjectLinkFieldZero",
  "reconcileNativeObjectLinkStateA",
  "reconcileNativeObjectLinkStateB",
];

function preflightAdapters(options, context, targetWord) {
  const adapters = {};
  for (const name of REQUIRED_ADAPTERS) {
    const candidate = options[name] || context[name];
    if (typeof candidate !== "function") {
      return {
        stopped: {
          status: "stopped",
          reason: `native-object-link-${name}-missing`,
        },
      };
    }
    adapters[name] = candidate;
  }
  if ((targetWord >> 0) >= 0 && (targetWord >> 0) < 32) {
    const resolver = (
      options.resolveNativeObjectLinkSlot
      || context.resolveNativeObjectLinkSlot
    );
    if (typeof resolver !== "function") {
      return {
        stopped: {
          status: "stopped",
          reason: "native-object-link-slot-resolver-missing",
        },
      };
    }
    adapters.resolveNativeObjectLinkSlot = resolver;
  }
  return { adapters };
}

async function resolveTarget(action, readArgument, adapters, targetWord) {
  const signedTarget = targetWord >> 0;
  if (signedTarget === -1) {
    return {
      available: true,
      object: null,
      descriptor: { kind: "null" },
    };
  }
  if (signedTarget >= 0 && signedTarget < 32) {
    const object = await adapters.resolveNativeObjectLinkSlot(signedTarget);
    return {
      available: object !== undefined,
      object,
      descriptor: { kind: "indexed-slot", index: signedTarget },
    };
  }
  const objectTag = objectTagArgument(
    action,
    readArgument,
    1,
    "native object-link target",
  );
  const object = await adapters.resolveNativeObjectLinkObject(objectTag);
  return {
    available: object !== undefined,
    object,
    descriptor: { kind: "resolved-object", objectTag },
  };
}

export function createNativeObjectLinkSemanticHandlers(options = {}) {
  return {
    "resolved-object-link-field-zero-write": async ({
      action,
      context,
      readArgument,
    }) => {
      let sourceObjectTag;
      let targetWord;
      try {
        sourceObjectTag = objectTagArgument(
          action,
          readArgument,
          0,
          "native object-link source",
        );
        targetWord = requireWord(
          readArgument(1),
          "native object-link target",
        );
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      const preflight = preflightAdapters(options, context, targetWord);
      if (preflight.stopped) return preflight.stopped;
      const adapters = preflight.adapters;
      const sourceObject = await adapters.resolveNativeObjectLinkObject(
        sourceObjectTag,
      );
      if (sourceObject === undefined) {
        return {
          status: "stopped",
          reason: "native-object-link-source-state-unavailable",
        };
      }
      if (sourceObject === null) {
        return {
          status: "stopped",
          reason: "native-object-link-source-object-missing",
        };
      }

      let stateA;
      let stateB;
      let target;
      try {
        stateA = captureWords(
          await adapters.captureNativeObjectLinkStateA(sourceObject),
          "native object-link state A",
        );
        stateB = captureWords(
          await adapters.captureNativeObjectLinkStateB(sourceObject),
          "native object-link state B",
        );
        target = await resolveTarget(
          action,
          readArgument,
          adapters,
          targetWord,
        );
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (!target.available) {
        return {
          status: "stopped",
          reason: "native-object-link-target-state-unavailable",
        };
      }

      await adapters.writeNativeObjectLinkFieldZero({
        sourceObject,
        targetObject: target.object,
      });
      await adapters.reconcileNativeObjectLinkStateA(sourceObject, stateA);
      await adapters.reconcileNativeObjectLinkStateB(sourceObject, stateB);
      return {
        status: "continued",
        mutation: {
          sourceObjectTag,
          target: target.descriptor,
        },
      };
    },
  };
}
