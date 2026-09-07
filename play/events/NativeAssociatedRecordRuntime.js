import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";

const f32 = Math.fround;

function momtNumericQueryWord({
  floatWordF0,
  floatWordDc,
  globalDword,
}) {
  const base = nativeFloat32FromWord(floatWordF0);
  const control = nativeFloat32FromWord(floatWordDc);
  const global = globalDword | 0;
  if (global < 0) return nativeFloat32Word(base);
  if (control > f32(0.9899999499320984) && control < f32(1.0099999904632568)) {
    const scaled = f32(f32(base) * f32(100));
    if (!Number.isFinite(scaled) || scaled < -0x80000000 || scaled >= 0x80000000) {
      throw new RangeError("native MOMT numeric query FTRC input is unsupported");
    }
    const remainder = Math.trunc(scaled) % 100;
    const roundedInput = f32(f32(base) + f32(0.009999999776482582));
    if (
      !Number.isFinite(roundedInput)
      || roundedInput < -0x80000000
      || roundedInput >= 0x80000000
    ) {
      throw new RangeError("native MOMT numeric query rounding input is unsupported");
    }
    let result = f32(Math.trunc(roundedInput));
    if (remainder !== 0 && (Math.trunc(remainder / 10) & 1) === 0) {
      result = f32(result + f32(1));
    }
    return nativeFloat32Word(result);
  }
  if (global === 1) return nativeFloat32Word(base);
  let multiplier = global - 1;
  if (multiplier < 0) multiplier = 5;
  const deduction = f32(
    f32(f32(control) * f32(multiplier)) * f32(0.1875),
  );
  return nativeFloat32Word(f32(f32(base) - deduction));
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
    throw new TypeError("native associated-record object tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

async function vectorArgument({
  action,
  context,
  index,
  readArgument,
  readNativeVector,
}) {
  const operand = action.arguments?.[index];
  if (
    ["frame-address", "scene-address"].includes(operand?.kind)
    && Number.isInteger(operand.offset)
  ) {
    const read = operand.kind === "frame-address"
      ? context.readFrameField
      : context.readSceneField;
    const words = [0, 4, 8].map(delta => read?.(operand.offset + delta));
    if (words.every(Number.isInteger)) {
      return {
        words: words.map(word => word >>> 0),
        source: { kind: operand.kind, offset: operand.offset },
      };
    }
  }
  if (typeof readNativeVector !== "function") return null;
  const pointer = readArgument(index);
  const words = await readNativeVector(pointer);
  return Array.isArray(words) && words.length === 3
    ? {
        words: words.map(word => word >>> 0),
        source: { kind: "native-pointer", pointer },
      }
    : null;
}

export function createNativeAssociatedRecordSemanticHandlers({
  applyActorMomtFlagBitZero,
  applyActorMomtMask,
  accessActorMomtByte6f,
  resolveActorMomtByte6fState,
  writeResolvedObjectFaceRecord,
  applyResolvedObjectFaceParameters,
  applyResolvedObjectCcowMask,
  planActorMomtFloatPairWrite,
  commitActorMomtFloatPairWrite,
  planActorMomtNumericQuery,
  readMomtNumericGlobalDword,
  planActorMomtScaledOffset,
  commitActorMomtScaledOffset,
  applyResolvedObjectRefbValueWrite,
  applyResolvedObjectRefbControlInstall,
  planResolvedObjectRefbVectorWrite,
  commitResolvedObjectRefbVectorWrite,
  installResolvedObjectFixoAttachment,
  resetResolvedObjectFixoRecord,
  applyActorFigpByte10,
  applyResolvedObjectFigpBytePair,
  applyResolvedObjectTelmControl,
  readNativeVector,
} = {}) {
  return {
    "actor-momt-mask-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyMask = applyActorMomtMask || context.applyActorMomtMask;
      if (typeof applyMask !== "function") {
        return { status: "stopped", reason: "actor-momt-mask-state-missing" };
      }
      const mode = readArgument(1);
      if (mode !== 1 && mode !== 2) {
        return { status: "stopped", reason: "actor-momt-mask-mode-unproved" };
      }
      const objectTag = objectTagArgument(action, readArgument, 0);
      const mutation = await applyMask({
        objectTag,
        mode,
        mask: readArgument(2),
      });
      return mutation?.applied || mutation?.nativeNoOp
        ? { status: "continued", mutation }
        : {
            status: "stopped",
            reason: {
              kind: mutation?.reason || "actor-momt-mask-write-failed",
              objectTag,
            },
          };
    },
    "actor-momt-byte-6f-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const access = accessActorMomtByte6f || context.accessActorMomtByte6f;
      if (typeof access !== "function") {
        return {
          status: "stopped",
          reason: "actor-momt-byte-6f-state-missing",
        };
      }
      const selector = readArgument(2);
      if (selector !== 0 && selector !== 1) {
        return {
          status: "stopped",
          reason: "actor-momt-byte-6f-selector-unproved",
        };
      }
      const objectTag = objectTagArgument(action, readArgument, 0);
      let mutation = await access({
        objectTag,
        query: selector === 1,
        value: readArgument(1),
      });
      if (
        selector === 0
        && [
          "actor-momt-byte-6f-state-unavailable",
          "momt-record-missing",
        ].includes(mutation?.reason)
      ) {
        const resolve = (
          resolveActorMomtByte6fState
          || context.resolveActorMomtByte6fState
        );
        const configure = context.configureActorMomtByte6fState;
        if (typeof resolve === "function" && typeof configure === "function") {
          const resolved = await resolve({
            objectTag,
            query: selector === 1,
          });
          if (
            resolved
            && typeof resolved.actorAvailable === "boolean"
            && typeof resolved.momtAvailable === "boolean"
            && (
              selector === 0
              || resolved.actorAvailable === false
              || (
                Number.isInteger(resolved.value)
                && resolved.value >= 0
                && resolved.value <= 0xff
              )
            )
          ) {
            configure({
              objectTag,
              actorAvailable: resolved.actorAvailable,
              momtAvailable: resolved.momtAvailable,
              value: (
                selector === 0 || resolved.actorAvailable === false
                  ? 0
                  : resolved.value
              ),
            });
            mutation = await access({
              objectTag,
              query: selector === 1,
              value: readArgument(1),
            });
          }
        }
      }
      if (mutation?.reason) {
        return { status: "stopped", reason: mutation.reason };
      }
      return selector === 1
        ? { status: "continued", result: mutation.result, mutation }
        : { status: "continued", mutation };
    },
    "actor-momt-flag-bit-0": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyFlag = (
        applyActorMomtFlagBitZero
        || context.applyActorMomtFlagBitZero
      );
      if (typeof applyFlag !== "function") {
        return {
          status: "stopped",
          reason: "actor-momt-flag-state-missing",
        };
      }
      try {
        const mutation = await applyFlag({
          objectTag: objectTagArgument(action, readArgument, 0),
          enabled: readArgument(1) !== 0,
        });
        return mutation?.applied
          ? { status: "continued", mutation }
          : {
              status: "stopped",
              reason: mutation?.reason || "actor-momt-flag-write-failed",
            };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "actor-momt-numeric-query": async ({
      action,
      context,
      readArgument,
    }) => {
      const planQuery = (
        planActorMomtNumericQuery
        || context.planActorMomtNumericQuery
      );
      if (typeof planQuery !== "function") {
        return {
          status: "stopped",
          reason: "actor-momt-numeric-query-state-missing",
        };
      }
      let plan;
      try {
        plan = await planQuery({
          objectTag: objectTagArgument(action, readArgument, 0),
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (plan.reason === "actor-momt-numeric-query-state-unavailable") {
        return { status: "stopped", reason: plan.reason };
      }
      if (plan.removeFromSceneRegistry) {
        const removeActor = context.removeActorFromSceneRegistry;
        if (typeof removeActor !== "function") {
          return {
            status: "stopped",
            reason: "actor-scene-registry-remove-adapter-missing",
          };
        }
        await removeActor({
          actorTag: plan.objectTag,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
      }
      if (!plan.available) {
        return { result: plan.resultWord, query: plan };
      }
      const readGlobal = (
        readMomtNumericGlobalDword
        || context.readMomtNumericGlobalDword
      );
      if (typeof readGlobal !== "function") {
        return {
          status: "stopped",
          reason: "momt-numeric-global-dword-missing",
        };
      }
      try {
        const globalDword = await readGlobal();
        if (!Number.isInteger(globalDword)) {
          throw new TypeError(
            "native MOMT numeric global dword must be an integer",
          );
        }
        return {
          result: momtNumericQueryWord({ ...plan, globalDword }),
          query: { ...plan, globalDword: globalDword | 0 },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "actor-momt-float-pair-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const planWrite = (
        planActorMomtFloatPairWrite
        || context.planActorMomtFloatPairWrite
      );
      const commitWrite = (
        commitActorMomtFloatPairWrite
        || context.commitActorMomtFloatPairWrite
      );
      if (
        typeof planWrite !== "function"
        || typeof commitWrite !== "function"
      ) {
        return {
          status: "stopped",
          reason: "actor-momt-float-pair-state-missing",
        };
      }
      let plan;
      try {
        plan = await planWrite({
          objectTag: objectTagArgument(action, readArgument, 0),
          floatWord: readArgument(1),
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (plan.reason === "actor-momt-float-pair-state-unavailable") {
        return { status: "stopped", reason: plan.reason };
      }
      if (plan.removeFromSceneRegistry) {
        const removeActor = context.removeActorFromSceneRegistry;
        if (typeof removeActor !== "function") {
          return {
            status: "stopped",
            reason: "actor-scene-registry-remove-adapter-missing",
          };
        }
        await removeActor({
          actorTag: plan.objectTag,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
      } else if (plan.applied) {
        await commitWrite(plan);
      }
      return { status: "continued", mutation: plan };
    },
    "actor-momt-scaled-position-offset": async ({
      action,
      context,
      readArgument,
    }) => {
      if (readArgument(2) !== 0) {
        return {
          status: "stopped",
          reason: "actor-momt-scaled-offset-mode-unproved",
        };
      }
      const planOffset = (
        planActorMomtScaledOffset
        || context.planActorMomtScaledOffset
      );
      const commitOffset = (
        commitActorMomtScaledOffset
        || context.commitActorMomtScaledOffset
      );
      if (
        typeof planOffset !== "function"
        || typeof commitOffset !== "function"
      ) {
        return {
          status: "stopped",
          reason: "actor-momt-scaled-offset-state-missing",
        };
      }
      let plan;
      try {
        plan = await planOffset({
          objectTag: objectTagArgument(action, readArgument, 0),
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (plan.reason === "actor-momt-scaled-offset-state-unavailable") {
        return { status: "stopped", reason: plan.reason };
      }
      if (plan.removeFromSceneRegistry) {
        const removeActor = context.removeActorFromSceneRegistry;
        if (typeof removeActor !== "function") {
          return {
            status: "stopped",
            reason: "actor-scene-registry-remove-adapter-missing",
          };
        }
        await removeActor({
          actorTag: plan.objectTag,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
      }
      if (!plan.available) {
        return { status: "continued", mutation: plan };
      }
      const sourcePointer = readArgument(1);
      if (!Number.isInteger(sourcePointer)) {
        return {
          status: "stopped",
          reason: "native-vector-source-pointer-invalid",
        };
      }
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof readVector !== "function") {
        return {
          status: "stopped",
          reason: "native-vector-reader-missing",
        };
      }
      const sourceWords = await readVector(sourcePointer);
      if (!Array.isArray(sourceWords) || sourceWords.length !== 3) {
        return {
          status: "stopped",
          reason: "native-vector-source-unavailable",
        };
      }
      try {
        let deltaWords = sourceWords.map((word, index) => (
          nativeFloat32Word(f32(
            f32(nativeFloat32FromWord(plan.scaleVectorWords[index]))
            * f32(nativeFloat32FromWord(word)),
          ))
        ));
        if (plan.parentTransform !== null) {
          deltaWords = await plan.parentTransform([...deltaWords]);
          if (
            !Array.isArray(deltaWords)
            || deltaWords.length !== 3
            || deltaWords.some(word => !Number.isInteger(word))
          ) {
            throw new TypeError(
              "native actor parent transform result is unavailable",
            );
          }
        }
        const positionWords = plan.positionWords.map((word, index) => (
          nativeFloat32Word(f32(
            f32(nativeFloat32FromWord(word))
            + f32(nativeFloat32FromWord(deltaWords[index])),
          ))
        ));
        const mutation = await commitOffset({ plan, positionWords });
        return {
          status: "continued",
          mutation: {
            ...mutation,
            sourcePointer,
            sourceWords: sourceWords.map(word => word >>> 0),
            deltaWords: deltaWords.map(word => word >>> 0),
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "resolved-object-face-record-request": async ({
      action,
      context,
      readArgument,
    }) => {
      const writeRecord = (
        writeResolvedObjectFaceRecord
        || context.writeResolvedObjectFaceRecord
      );
      if (typeof writeRecord !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-face-record-writer-missing",
        };
      }
      const mode = readArgument(1);
      if (mode !== 0 && mode !== 1 && mode !== 2) {
        return {
          status: "stopped",
          reason: "resolved-object-face-record-mode-unproven",
        };
      }
      let controlWord = 16;
      let vector = [0, 0, 0];
      let vectorPointer = null;
      if (mode === 1) {
        controlWord = readArgument(2);
      } else if (mode === 2) {
        controlWord = readArgument(3);
        const readVector = readNativeVector || context.readNativeVector;
        const resolvedVector = await vectorArgument({
          action,
          context,
          index: 2,
          readArgument,
          readNativeVector: readVector,
        });
        if (!resolvedVector) {
          return {
            status: "stopped",
            reason: "native-vector-source-unavailable",
          };
        }
        vector = resolvedVector.words;
        vectorPointer = resolvedVector.source.kind === "native-pointer"
          ? resolvedVector.source.pointer
          : null;
      }
      await writeRecord({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "FACE",
        mode,
        modeByte: 0x80 | mode,
        controlWord: controlWord & 0xffff,
        secondaryWord: 0,
        vector: vector.map(word => word >>> 0),
        vectorPointer,
        clearsResetDwords: mode === 0,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      return { status: "continued" };
    },
    "resolved-object-face-record-parameter-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyParameters = (
        applyResolvedObjectFaceParameters
        || context.applyResolvedObjectFaceParameters
      );
      if (typeof applyParameters !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-face-parameter-adapter-missing",
        };
      }
      const rawMinimumOneWord = readArgument(3) & 0xffff;
      const signedMinimumOneWord = (rawMinimumOneWord << 16) >> 16;
      const result = await applyParameters({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTags: {
          prerequisite: "MOMT",
          target: "FACE",
        },
        parameterByte: readArgument(1) & 0xff,
        scaledParameterWord: (
          Math.imul(readArgument(2) | 0, 6) & 0xffff
        ),
        minimumOneWord: signedMinimumOneWord < 1
          ? 1
          : rawMinimumOneWord,
        guards: {
          inactiveStateByte: 8,
          stateTableAddress: 0x0c2200f8,
          stateTableStride: 28,
        },
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      return { status: "continued", mutation: result };
    },
    "resolved-object-ccow-mask-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyMask = (
        applyResolvedObjectCcowMask
        || context.applyResolvedObjectCcowMask
      );
      if (typeof applyMask !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-ccow-mask-adapter-missing",
        };
      }
      const mode = readArgument(1);
      const modes = {
        1: ["set", 0x00000007],
        2: ["clear", 0x00000007],
        3: ["set", 0x00000002],
        4: ["clear", 0x00000002],
        5: ["set", 0x00000004],
        6: ["clear", 0x00000004],
        7: ["query", 0x00000004],
        8: ["query", 0x00000002],
        9: ["set", 0x00002000],
        10: ["clear", 0x00002000],
      };
      const selected = modes[mode];
      if (!selected) {
        return {
          status: "stopped",
          reason: "resolved-object-ccow-mask-mode-unproven",
        };
      }
      const mutation = await applyMask({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "CCOW",
        mode,
        action: selected[0],
        mask: selected[1],
        mutationStateByte: selected[0] === "query" ? null : 0,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (!mutation || !Number.isInteger(mutation.result)) {
        return {
          status: "stopped",
          reason: "resolved-object-ccow-mask-result-invalid",
        };
      }
      return {
        result: mutation.result,
        mutation,
      };
    },
    "resolved-object-ccow-bit-7-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const mode = readArgument(1);
      if (mode === 0) {
        return { status: "continued" };
      }
      if (mode !== 1 && mode !== 2) {
        return {
          status: "stopped",
          reason: "resolved-object-ccow-bit-7-mode-unproven",
        };
      }
      const applyMask = (
        applyResolvedObjectCcowMask
        || context.applyResolvedObjectCcowMask
      );
      if (typeof applyMask !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-ccow-mask-adapter-missing",
        };
      }
      const mutation = await applyMask({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "CCOW",
        mode,
        action: mode === 1 ? "set" : "clear",
        mask: 0x00000080,
        mutationStateByte: 0,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (!mutation || !Number.isInteger(mutation.result)) {
        return {
          status: "stopped",
          reason: "resolved-object-ccow-mask-result-invalid",
        };
      }
      return { status: "continued", mutation };
    },
    "resolved-object-refb-value-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyValueWrite = (
        applyResolvedObjectRefbValueWrite
        || context.applyResolvedObjectRefbValueWrite
      );
      if (typeof applyValueWrite !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-refb-value-adapter-missing",
        };
      }
      const valueDword = readArgument(1) >>> 0;
      const mutation = await applyValueWrite({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "REFB",
        valueDword,
        stateDword: 1,
        clearSecondaryDword: valueDword === 0,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      return { status: "continued", mutation };
    },
    "resolved-object-refb-control-install": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyControl = (
        applyResolvedObjectRefbControlInstall
        || context.applyResolvedObjectRefbControlInstall
      );
      if (typeof applyControl !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-refb-control-adapter-missing",
        };
      }
      const mutation = await applyControl({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "REFB",
        controlModeDword: readArgument(1),
        controlValueDword: readArgument(2),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      return { status: "continued", mutation };
    },
    "resolved-object-refb-vector-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const planWrite = (
        planResolvedObjectRefbVectorWrite
        || context.planResolvedObjectRefbVectorWrite
      );
      const commitWrite = (
        commitResolvedObjectRefbVectorWrite
        || context.commitResolvedObjectRefbVectorWrite
      );
      if (
        typeof planWrite !== "function"
        || typeof commitWrite !== "function"
      ) {
        return {
          status: "stopped",
          reason: "resolved-object-refb-vector-adapter-missing",
        };
      }
      const plan = await planWrite({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "REFB",
      });
      if (!plan?.available) {
        return { status: "continued", mutation: plan };
      }
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof readVector !== "function") {
        return {
          status: "stopped",
          reason: "native-vector-reader-missing",
        };
      }
      const sourcePointer = readArgument(1);
      if (!Number.isInteger(sourcePointer)) {
        return {
          status: "stopped",
          reason: "native-vector-source-pointer-invalid",
        };
      }
      const vectorWords = await readVector(sourcePointer + 4);
      if (!Array.isArray(vectorWords) || vectorWords.length !== 3) {
        return {
          status: "stopped",
          reason: "native-vector-source-unavailable",
        };
      }
      const mutation = await commitWrite({ plan, vectorWords });
      return {
        status: "continued",
        mutation: {
          ...mutation,
          sourcePointer,
          vectorPointer: sourcePointer + 4,
        },
      };
    },
    "resolved-object-fixo-reset": async ({
      action,
      context,
      readArgument,
    }) => {
      const resetRecord = (
        resetResolvedObjectFixoRecord
        || context.resetResolvedObjectFixoRecord
      );
      if (typeof resetRecord !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-fixo-reset-adapter-missing",
        };
      }
      const mutation = await resetRecord({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "FIXO",
        zeroFields: {
          floatWords: [0x18, 0x1c, 0x20],
          dwords: [0x24, 0x28, 0x2c],
          words: [0x30, 0x32],
        },
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (!mutation?.applied) {
        return {
          status: "stopped",
          reason: mutation?.reason || "resolved-object-fixo-reset-failed",
        };
      }
      return { status: "continued", mutation };
    },
    "resolved-object-fixo-attachment-install": async ({
      action,
      context,
      readArgument,
    }) => {
      const installAttachment = (
        installResolvedObjectFixoAttachment
        || context.installResolvedObjectFixoAttachment
      );
      if (typeof installAttachment !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-fixo-attachment-adapter-missing",
        };
      }
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof readVector !== "function") {
        return {
          status: "stopped",
          reason: "native-vector-reader-missing",
        };
      }
      const vector0cAnd24 = await vectorArgument({
        action,
        context,
        index: 3,
        readArgument,
        readNativeVector: readVector,
      });
      const vector00And18 = await vectorArgument({
        action,
        context,
        index: 4,
        readArgument,
        readNativeVector: readVector,
      });
      if (!vector0cAnd24 || !vector00And18) {
        return {
          status: "stopped",
          reason: "native-vector-source-unavailable",
        };
      }
      const mutation = await installAttachment({
        objectTag: objectTagArgument(action, readArgument, 0),
        targetObjectTag: objectTagArgument(action, readArgument, 1),
        recordTag: "FIXO",
        controlId: readArgument(2) >>> 0,
        vector00And18Words: vector00And18.words,
        vector0cAnd24Words: vector0cAnd24.words,
        sourcePointers: {
          vector00And18: vector00And18.source.pointer,
          vector0cAnd24: vector0cAnd24.source.pointer,
        },
        sourceOperands: {
          vector00And18: vector00And18.source,
          vector0cAnd24: vector0cAnd24.source,
        },
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (!mutation?.applied) {
        return {
          status: "stopped",
          reason: mutation?.reason || "resolved-object-fixo-attachment-failed",
        };
      }
      return { status: "continued", mutation };
    },
    "actor-figp-byte-10-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const apply = applyActorFigpByte10 || context.applyActorFigpByte10;
      if (typeof apply !== "function") {
        return {
          status: "stopped",
          reason: "actor-figp-byte-10-adapter-missing",
        };
      }
      const mutation = await apply({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "FIGP",
        byte10: readArgument(1),
      });
      if (mutation?.applied || mutation?.nativeNoOp) {
        return { status: "continued", mutation };
      }
      return {
        status: "stopped",
        reason: mutation?.reason || "actor-figp-byte-10-write-failed",
      };
    },
    "resolved-object-figp-byte-pair-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const apply = (
        applyResolvedObjectFigpBytePair
        || context.applyResolvedObjectFigpBytePair
      );
      if (typeof apply !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-figp-byte-pair-adapter-missing",
        };
      }
      const mutation = await apply({
        objectTag: objectTagArgument(action, readArgument, 0),
        recordTag: "FIGP",
        byte11: readArgument(1),
        byte12: readArgument(2),
      });
      if (mutation?.applied || mutation?.nativeNoOp) {
        return { status: "continued", mutation };
      }
      return {
        status: "stopped",
        reason: mutation?.reason || "resolved-object-figp-byte-pair-write-failed",
      };
    },
    "resolved-object-telm-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyControl = (
        applyResolvedObjectTelmControl
        || context.applyResolvedObjectTelmControl
      );
      if (typeof applyControl !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-telm-control-adapter-missing",
        };
      }
      const mode = readArgument(0);
      if (mode !== 4 && mode !== 10) {
        return {
          status: "stopped",
          reason: "resolved-object-telm-control-mode-unproven",
        };
      }
      const mutation = await applyControl({
        objectTag: objectTagArgument(action, readArgument, 1),
        recordTag: "TELM",
        mode,
        commonBinding: {
          resolvedObject: true,
          operationContext: true,
        },
        primaryLinkDword: mode === 10 ? 0xffffffff : undefined,
        controllerStateDword: mode === 10 ? 21 : undefined,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (!mutation?.applied) {
        return {
          status: "stopped",
          reason: mutation?.reason || "resolved-object-telm-control-failed",
        };
      }
      return mode === 4
        ? { result: mutation.result, mutation }
        : { status: "continued", mutation };
    },
  };
}
