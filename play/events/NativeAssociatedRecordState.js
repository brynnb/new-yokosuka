function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native associated record requires a four-character ID");
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
      "native associated vector must contain exactly three integer words",
    );
  }
  return value.map(word => word >>> 0);
}

function cloneRequest(request) {
  if (!request) return undefined;
  return {
    ...request,
    vector: [...request.vector],
    resetDwords: request.resetDwords
      ? [...request.resetDwords]
      : undefined,
  };
}

export class NativeAssociatedRecordState {
  constructor() {
    this.records = new Map();
    this.momtObjects = new Set();
    this.fixoAttachmentTargets = new Map();
  }

  recordFor(objectTag, { create = false } = {}) {
    const key = requireFourcc(objectTag);
    let record = this.records.get(key);
    if (!record && create) {
      record = {};
      this.records.set(key, record);
    }
    return { key, record };
  }

  writeFaceRequest({
    objectTag,
    recordTag,
    mode,
    controlWord,
    vector,
    clearsResetDwords,
  }) {
    const { record } = this.recordFor(objectTag, { create: true });
    if (recordTag !== "FACE") {
      throw new Error("native associated record must use the FACE tag");
    }
    if (![0, 1, 2].includes(mode)) {
      throw new RangeError("native FACE record mode must be 0, 1, or 2");
    }
    if (!Number.isInteger(controlWord)) {
      throw new TypeError("native FACE control word must be an integer");
    }
    if (clearsResetDwords !== (mode === 0)) {
      throw new Error("native FACE reset behavior does not match its mode");
    }
    record.request = {
      recordTag: "FACE",
      mode,
      modeByte: 0x80 | mode,
      controlWord: controlWord & 0xffff,
      secondaryWord: 0,
      vector: requireVector3Words(vector),
      resetDwords: mode === 0
        ? [0, 0, 0, 0]
        : record.request?.resetDwords,
    };
    return cloneRequest(record.request);
  }

  readFaceRequest(objectTag) {
    return cloneRequest(this.recordFor(objectTag).record?.request);
  }

  configureFaceParameterGuards({
    objectTag,
    hasMomtRecord,
    stateByte,
    activeEntryPointer,
    activeEntryAux = 0,
    expectedEntryPointer,
  }) {
    if (typeof hasMomtRecord !== "boolean") {
      throw new TypeError("native MOMT availability must be boolean");
    }
    if (!Number.isInteger(stateByte) || stateByte < 0 || stateByte > 0xff) {
      throw new RangeError("native FACE state must be a byte");
    }
    for (const [name, value] of Object.entries({
      activeEntryPointer,
      activeEntryAux,
      expectedEntryPointer,
    })) {
      if (!Number.isInteger(value)) {
        throw new TypeError(`native FACE ${name} must be an integer`);
      }
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    if (hasMomtRecord) this.momtObjects.add(key);
    else this.momtObjects.delete(key);
    record.parameterState = {
      stateByte,
      activeEntryPointer,
      activeEntryAux,
      expectedEntryPointer,
      parameterByte: undefined,
      scaledParameterWord: undefined,
      minimumOneWord: undefined,
      controllerByte: undefined,
    };
  }

  applyFaceParameterRequest({
    objectTag,
    parameterByte,
    scaledParameterWord,
    minimumOneWord,
  }) {
    const { key, record } = this.recordFor(objectTag);
    if (!this.momtObjects.has(key)) {
      return { applied: false, reason: "momt-record-missing" };
    }
    const state = record?.parameterState;
    if (!state) return { applied: false, reason: "face-record-missing" };
    if (state.stateByte === 8) {
      return { applied: false, reason: "face-state-8" };
    }
    if (state.activeEntryPointer !== state.expectedEntryPointer) {
      state.activeEntryPointer = 0;
      state.activeEntryAux = 0;
      state.parameterByte = 0;
      return { applied: false, reason: "face-state-table-mismatch" };
    }
    if (state.activeEntryPointer === 0) {
      return { applied: false, reason: "face-active-entry-missing" };
    }
    state.parameterByte = parameterByte & 0xff;
    state.scaledParameterWord = scaledParameterWord & 0xffff;
    state.minimumOneWord = minimumOneWord & 0xffff;
    state.controllerByte = 0;
    return {
      applied: true,
      state: this.readFaceParameterState(key),
    };
  }

  readFaceParameterState(objectTag) {
    const state = this.recordFor(objectTag).record?.parameterState;
    return state ? { ...state } : undefined;
  }

  configureMomtFloatPair({
    objectTag,
    actorAvailable,
    momtAvailable,
    floatWordF0 = 0,
    floatWord128 = 0,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof momtAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native actor/MOMT availability must be boolean",
      );
    }
    if (!Number.isInteger(floatWordF0) || !Number.isInteger(floatWord128)) {
      throw new TypeError("native MOMT float fields must be integer words");
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    if (momtAvailable) this.momtObjects.add(key);
    else this.momtObjects.delete(key);
    record.momt = {
      ...record.momt,
      actorAvailable,
      momtAvailable,
      floatWordF0: floatWordF0 >>> 0,
      floatWord128: floatWord128 >>> 0,
    };
    return this.readMomtFloatPair(key);
  }

  configureMomtFlags({
    objectTag,
    actorAvailable,
    momtAvailable,
    flagsWord = 0,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof momtAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native actor/MOMT availability must be boolean",
      );
    }
    if (!Number.isInteger(flagsWord)) {
      throw new TypeError("native MOMT flags must be an integer word");
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    if (momtAvailable) this.momtObjects.add(key);
    else this.momtObjects.delete(key);
    record.momt = {
      ...record.momt,
      actorAvailable,
      momtAvailable,
      flagsWord: flagsWord >>> 0,
    };
    return this.readMomtFlags(key);
  }

  applyMomtFlagBitZero({ objectTag, enabled }) {
    if (typeof enabled !== "boolean") {
      throw new TypeError("native MOMT flag bit-zero state must be boolean");
    }
    const { key, record } = this.recordFor(objectTag);
    const state = record?.momt;
    if (!state) {
      return {
        applied: false,
        reason: "actor-momt-flag-state-unavailable",
      };
    }
    if (!state.actorAvailable) {
      return { applied: false, reason: "actor-unavailable" };
    }
    if (!state.momtAvailable) {
      return { applied: false, reason: "momt-record-missing" };
    }
    state.flagsWord = enabled
      ? ((state.flagsWord >>> 0) | 1) >>> 0
      : ((state.flagsWord >>> 0) & 0xfffffffe) >>> 0;
    return {
      applied: true,
      objectTag: key,
      flagsWord: state.flagsWord,
    };
  }

  applyMomtMask({ objectTag, mode, mask }) {
    if (![1, 2].includes(mode) || !Number.isInteger(mask)) {
      throw new TypeError("native MOMT mask control requires mode 1/2 and mask");
    }
    const { key, record } = this.recordFor(objectTag);
    const state = record?.momt;
    if (!state || !Number.isInteger(state.flagsWord)) {
      return { applied: false, reason: "actor-momt-mask-state-unavailable" };
    }
    if (!state.actorAvailable) {
      return { applied: false, nativeNoOp: true, reason: "actor-unavailable" };
    }
    if (!state.momtAvailable) {
      return { applied: false, nativeNoOp: true, reason: "momt-record-missing" };
    }
    const previous = state.flagsWord >>> 0;
    const unsignedMask = mask >>> 0;
    state.flagsWord = mode === 1
      ? (previous | unsignedMask) >>> 0
      : (previous & ~unsignedMask) >>> 0;
    return {
      applied: true,
      objectTag: key,
      mode,
      mask: unsignedMask,
      previous,
      value: state.flagsWord,
    };
  }

  readMomtFlags(objectTag) {
    const state = this.recordFor(objectTag).record?.momt;
    if (!state || !Number.isInteger(state.flagsWord)) return undefined;
    return {
      actorAvailable: state.actorAvailable,
      momtAvailable: state.momtAvailable,
      flagsWord: state.flagsWord,
    };
  }

  configureMomtByte6f({
    objectTag,
    actorAvailable,
    momtAvailable,
    value = 0,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof momtAvailable !== "boolean"
    ) {
      throw new TypeError("native actor/MOMT availability must be boolean");
    }
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError("native MOMT byte +0x6f must be a byte");
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    if (momtAvailable) this.momtObjects.add(key);
    else this.momtObjects.delete(key);
    record.momt = {
      ...record.momt,
      actorAvailable,
      momtAvailable,
      byte6f: value,
    };
    return this.readMomtByte6f(key);
  }

  accessMomtByte6f({ objectTag, query, value }) {
    const { key, record } = this.recordFor(objectTag);
    const state = record?.momt;
    if (!state) {
      return { applied: false, reason: "actor-momt-byte-6f-state-unavailable" };
    }
    if (!state.actorAvailable) {
      return { applied: false, nativeNoOp: true, result: 0 };
    }
    if (!state.momtAvailable || !Number.isInteger(state.byte6f)) {
      return { applied: false, reason: "momt-record-missing" };
    }
    if (query) {
      return {
        applied: false,
        objectTag: key,
        result: (state.byte6f << 24) >> 24,
      };
    }
    if (!Number.isInteger(value)) {
      throw new TypeError("native MOMT byte +0x6f write is unavailable");
    }
    const previous = state.byte6f;
    state.byte6f = value & 0xff;
    return {
      applied: true,
      objectTag: key,
      previous,
      value: state.byte6f,
    };
  }

  readMomtByte6f(objectTag) {
    const state = this.recordFor(objectTag).record?.momt;
    if (!state || !Number.isInteger(state.byte6f)) return undefined;
    return {
      actorAvailable: state.actorAvailable,
      momtAvailable: state.momtAvailable,
      value: state.byte6f,
    };
  }

  planMomtFloatPairWrite({ objectTag, floatWord }) {
    if (!Number.isInteger(floatWord)) {
      throw new TypeError("native MOMT float value must be an integer word");
    }
    const { key, record } = this.recordFor(objectTag);
    const state = record?.momt;
    if (!state) {
      return {
        applied: false,
        reason: "actor-momt-float-pair-state-unavailable",
      };
    }
    if (!state.actorAvailable) {
      return { applied: false, reason: "actor-unavailable" };
    }
    if (!state.momtAvailable) {
      return {
        applied: false,
        objectTag: key,
        removeFromSceneRegistry: true,
      };
    }
    return {
      applied: true,
      objectTag: key,
      floatWord: floatWord >>> 0,
    };
  }

  commitMomtFloatPairWrite(plan) {
    if (!plan?.applied) return;
    const state = this.recordFor(plan.objectTag).record?.momt;
    if (!state?.actorAvailable || !state.momtAvailable) {
      throw new Error("native MOMT float-pair plan became invalid");
    }
    state.floatWordF0 = plan.floatWord;
    state.floatWord128 = plan.floatWord;
  }

  readMomtFloatPair(objectTag) {
    const state = this.recordFor(objectTag).record?.momt;
    return state
      ? {
          actorAvailable: state.actorAvailable,
          momtAvailable: state.momtAvailable,
          floatWordF0: state.floatWordF0,
          floatWord128: state.floatWord128,
        }
      : undefined;
  }

  configureMomtNumericQuery({
    objectTag,
    actorAvailable,
    momtAvailable,
    floatWordF0 = 0,
    floatWordDc = 0,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof momtAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native actor/MOMT availability must be boolean",
      );
    }
    if (!Number.isInteger(floatWordF0) || !Number.isInteger(floatWordDc)) {
      throw new TypeError("native MOMT query fields must be integer words");
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    if (momtAvailable) this.momtObjects.add(key);
    else this.momtObjects.delete(key);
    record.momt = {
      ...record.momt,
      actorAvailable,
      momtAvailable,
      floatWordF0: floatWordF0 >>> 0,
      floatWordDc: floatWordDc >>> 0,
    };
    return this.readMomtNumericQuery(key);
  }

  planMomtNumericQuery({ objectTag }) {
    const { key, record } = this.recordFor(objectTag);
    const state = record?.momt;
    if (
      !state
      || !Number.isInteger(state.floatWordF0)
      || !Number.isInteger(state.floatWordDc)
    ) {
      return {
        available: false,
        reason: "actor-momt-numeric-query-state-unavailable",
      };
    }
    if (!state.actorAvailable) {
      return { available: false, resultWord: 0, reason: "actor-unavailable" };
    }
    if (!state.momtAvailable) {
      return {
        available: false,
        resultWord: 0,
        objectTag: key,
        removeFromSceneRegistry: true,
      };
    }
    return {
      available: true,
      objectTag: key,
      floatWordF0: state.floatWordF0,
      floatWordDc: state.floatWordDc,
    };
  }

  readMomtNumericQuery(objectTag) {
    const state = this.recordFor(objectTag).record?.momt;
    if (
      !state
      || !Number.isInteger(state.floatWordF0)
      || !Number.isInteger(state.floatWordDc)
    ) {
      return undefined;
    }
    return {
      actorAvailable: state.actorAvailable,
      momtAvailable: state.momtAvailable,
      floatWordF0: state.floatWordF0,
      floatWordDc: state.floatWordDc,
    };
  }

  configureMomtScaledOffset(detail) {
    const {
      objectTag,
      actorAvailable,
      momtAvailable,
      scaleVectorWords,
      positionWords,
      parentTransform,
    } = detail;
    if (
      typeof actorAvailable !== "boolean"
      || typeof momtAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native actor/MOMT availability must be boolean",
      );
    }
    if (actorAvailable && momtAvailable) {
      for (const [name, value] of Object.entries({
        scaleVectorWords,
        positionWords,
      })) {
        if (
          !Array.isArray(value)
          || value.length !== 3
          || value.some(word => !Number.isInteger(word))
        ) {
          throw new TypeError(`native MOMT ${name} must contain three words`);
        }
      }
      if (
        !Object.hasOwn(detail, "parentTransform")
        || (parentTransform !== null && typeof parentTransform !== "function")
      ) {
        throw new TypeError(
          "native actor parent transform must be explicit",
        );
      }
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    if (momtAvailable) this.momtObjects.add(key);
    else this.momtObjects.delete(key);
    record.momt = {
      ...record.momt,
      scaledOffset: {
        actorAvailable,
        momtAvailable,
        scaleVectorWords: actorAvailable && momtAvailable
          ? scaleVectorWords.map(word => word >>> 0)
          : undefined,
        positionWords: actorAvailable && momtAvailable
          ? positionWords.map(word => word >>> 0)
          : undefined,
        parentTransform: actorAvailable && momtAvailable
          ? parentTransform
          : undefined,
      },
    };
    return this.readMomtScaledOffset(key);
  }

  planMomtScaledOffset({ objectTag }) {
    const { key, record } = this.recordFor(objectTag);
    const state = record?.momt?.scaledOffset;
    if (!state) {
      return {
        available: false,
        reason: "actor-momt-scaled-offset-state-unavailable",
      };
    }
    if (!state.actorAvailable) {
      return { available: false, applied: false, reason: "actor-unavailable" };
    }
    if (!state.momtAvailable) {
      return {
        available: false,
        applied: false,
        objectTag: key,
        removeFromSceneRegistry: true,
      };
    }
    return {
      available: true,
      objectTag: key,
      scaleVectorWords: [...state.scaleVectorWords],
      positionWords: [...state.positionWords],
      parentTransform: state.parentTransform,
    };
  }

  commitMomtScaledOffset({ plan, positionWords }) {
    if (
      !plan?.available
      || !Array.isArray(positionWords)
      || positionWords.length !== 3
      || positionWords.some(word => !Number.isInteger(word))
    ) {
      throw new TypeError("native MOMT scaled-offset plan is invalid");
    }
    const state = this.recordFor(plan.objectTag).record?.momt?.scaledOffset;
    if (!state) {
      throw new Error("native MOMT scaled-offset state changed before commit");
    }
    state.positionWords = positionWords.map(word => word >>> 0);
    return {
      applied: true,
      objectTag: plan.objectTag,
      positionWords: [...state.positionWords],
    };
  }

  readMomtScaledOffset(objectTag) {
    const state = this.recordFor(objectTag).record?.momt?.scaledOffset;
    return state
      ? {
          actorAvailable: state.actorAvailable,
          momtAvailable: state.momtAvailable,
          scaleVectorWords: state.scaleVectorWords
            ? [...state.scaleVectorWords]
            : undefined,
          positionWords: state.positionWords
            ? [...state.positionWords]
            : undefined,
          parentTransform: state.parentTransform,
        }
      : undefined;
  }

  configureCcowRecord({
    objectTag,
    available,
    flagsWord = 0,
    stateByte = 0,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native CCOW availability must be boolean");
    }
    if (!Number.isInteger(flagsWord)) {
      throw new TypeError("native CCOW flags must be an integer");
    }
    if (!Number.isInteger(stateByte) || stateByte < 0 || stateByte > 0xff) {
      throw new RangeError("native CCOW state must be a byte");
    }
    const { record } = this.recordFor(objectTag, { create: available });
    if (!record) return;
    if (available) {
      record.ccow = {
        flagsWord: flagsWord >>> 0,
        stateByte,
      };
    } else {
      delete record.ccow;
    }
  }

  applyCcowMaskControl({ objectTag, action, mask }) {
    const ccow = this.recordFor(objectTag).record?.ccow;
    if (!ccow) {
      return {
        applied: false,
        result: 0,
        reason: "ccow-record-missing",
      };
    }
    const unsignedMask = mask >>> 0;
    if (action === "query") {
      return {
        applied: false,
        result: (ccow.flagsWord & unsignedMask) === 0 ? 0 : 1,
      };
    }
    if (action !== "set" && action !== "clear") {
      throw new Error("native CCOW action must be set, clear, or query");
    }
    ccow.stateByte = 0;
    ccow.flagsWord = action === "set"
      ? (ccow.flagsWord | unsignedMask) >>> 0
      : (ccow.flagsWord & ~unsignedMask) >>> 0;
    return {
      applied: true,
      result: 0,
      state: { ...ccow },
    };
  }

  readCcowRecord(objectTag) {
    const ccow = this.recordFor(objectTag).record?.ccow;
    return ccow ? { ...ccow } : undefined;
  }

  configureRefbRecord({
    objectTag,
    available,
    valueDword = 0,
    secondaryDword = 0,
    stateDword = 0,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native REFB availability must be boolean");
    }
    for (const [name, value] of Object.entries({
      valueDword,
      secondaryDword,
      stateDword,
    })) {
      if (!Number.isInteger(value)) {
        throw new TypeError(`native REFB ${name} must be an integer`);
      }
    }
    const { record } = this.recordFor(objectTag, { create: available });
    if (!record) return;
    if (available) {
      record.refb = {
        valueDword: valueDword >>> 0,
        secondaryDword: secondaryDword >>> 0,
        stateDword: stateDword >>> 0,
      };
    } else {
      delete record.refb;
    }
  }

  applyRefbValueWrite({
    objectTag,
    recordTag,
    valueDword,
    stateDword,
    clearSecondaryDword,
  }) {
    if (recordTag !== "REFB") {
      throw new Error("native associated record must use the REFB tag");
    }
    if (!Number.isInteger(valueDword) || !Number.isInteger(stateDword)) {
      throw new TypeError("native REFB dword values must be integers");
    }
    if (clearSecondaryDword !== ((valueDword >>> 0) === 0)) {
      throw new Error(
        "native REFB secondary clear does not match the value dword",
      );
    }
    const refb = this.recordFor(objectTag).record?.refb;
    if (!refb) {
      return { applied: false, reason: "refb-record-missing" };
    }
    refb.valueDword = valueDword >>> 0;
    refb.stateDword = stateDword >>> 0;
    if (clearSecondaryDword) refb.secondaryDword = 0;
    return { applied: true, state: { ...refb } };
  }

  applyRefbControlInstall({
    objectTag,
    recordTag,
    controlModeDword,
    controlValueDword,
  }) {
    if (recordTag !== "REFB") {
      throw new Error("native associated record must use the REFB tag");
    }
    if (
      !Number.isInteger(controlModeDword)
      || !Number.isInteger(controlValueDword)
    ) {
      throw new TypeError("native REFB control dword values must be integers");
    }
    const refb = this.recordFor(objectTag).record?.refb;
    if (!refb) {
      return { applied: false, reason: "refb-record-missing" };
    }
    const callbackInstalled = refb.stateDword === 0;
    refb.controlModeDword = controlModeDword >>> 0;
    refb.controlValueDword = controlValueDword >>> 0;
    refb.stateDword = 1;
    return {
      applied: true,
      callbackInstalled,
      state: { ...refb },
    };
  }

  planRefbVectorWrite({ objectTag, recordTag }) {
    if (recordTag !== "REFB") {
      throw new Error("native associated record must use the REFB tag");
    }
    const { key, record } = this.recordFor(objectTag);
    if (!record?.refb) {
      return {
        available: false,
        applied: false,
        reason: "refb-record-missing",
      };
    }
    return {
      available: true,
      objectTag: key,
      recordTag,
    };
  }

  commitRefbVectorWrite({ plan, vectorWords }) {
    if (
      !plan?.available
      || plan.recordTag !== "REFB"
      || !Array.isArray(vectorWords)
      || vectorWords.length !== 3
      || vectorWords.some(word => !Number.isInteger(word))
    ) {
      throw new TypeError("native REFB vector write plan is invalid");
    }
    const refb = this.recordFor(plan.objectTag).record?.refb;
    if (!refb) {
      throw new Error("native REFB record changed before vector commit");
    }
    refb.stateDword = 1;
    refb.vectorWords = vectorWords.map(word => word >>> 0);
    return {
      applied: true,
      state: {
        ...refb,
        vectorWords: [...refb.vectorWords],
      },
    };
  }

  readRefbRecord(objectTag) {
    const refb = this.recordFor(objectTag).record?.refb;
    return refb
      ? {
          ...refb,
          ...(refb.vectorWords
            ? { vectorWords: [...refb.vectorWords] }
            : {}),
        }
      : undefined;
  }

  configureFixoRecord({
    objectTag,
    available,
    primaryVectorWords = [0, 0, 0],
    secondaryVectorWords = [0, 0, 0],
    lowerVectorWords = [0, 0, 0],
    upperVectorWords = [0, 0, 0],
    word30 = 0,
    word32 = 0,
    controlIdDword = 0,
    targetObjectTag = null,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native FIXO availability must be boolean");
    }
    if (
      !Number.isInteger(word30)
      || !Number.isInteger(word32)
      || !Number.isInteger(controlIdDword)
    ) {
      throw new TypeError("native FIXO scalar fields must be integers");
    }
    const target = targetObjectTag === null
      ? null
      : requireFourcc(targetObjectTag);
    const { record } = this.recordFor(objectTag, { create: available });
    if (!record) return;
    if (available) {
      record.fixo = {
        primaryVectorWords: requireVector3Words(primaryVectorWords),
        secondaryVectorWords: requireVector3Words(secondaryVectorWords),
        lowerVectorWords: requireVector3Words(lowerVectorWords),
        upperVectorWords: requireVector3Words(upperVectorWords),
        word30: word30 & 0xffff,
        word32: word32 & 0xffff,
        controlIdDword: controlIdDword >>> 0,
        targetObjectTag: target,
      };
    } else {
      delete record.fixo;
    }
  }

  configureFixoAttachmentTarget({
    objectTag,
    hasMomtRecord,
    controlIds = [],
  }) {
    if (typeof hasMomtRecord !== "boolean") {
      throw new TypeError("native FIXO target MOMT availability must be boolean");
    }
    if (
      !Array.isArray(controlIds)
      || controlIds.some(value => !Number.isInteger(value))
    ) {
      throw new TypeError("native FIXO target control IDs must be integers");
    }
    this.fixoAttachmentTargets.set(requireFourcc(objectTag), {
      hasMomtRecord,
      controlIds: new Set(controlIds.map(value => value >>> 0)),
    });
  }

  installFixoAttachment({
    objectTag,
    targetObjectTag,
    recordTag,
    controlId,
    vector00And18Words,
    vector0cAnd24Words,
  }) {
    if (recordTag !== "FIXO") {
      throw new Error("native associated record must use the FIXO tag");
    }
    if (!Number.isInteger(controlId)) {
      throw new TypeError("native FIXO control ID must be an integer");
    }
    const fixo = this.recordFor(objectTag).record?.fixo;
    if (!fixo) {
      return { applied: false, reason: "fixo-record-missing" };
    }
    const targetKey = requireFourcc(targetObjectTag);
    const target = this.fixoAttachmentTargets.get(targetKey);
    if (!target) {
      return { applied: false, reason: "fixo-target-state-missing" };
    }
    const firstVector = requireVector3Words(vector00And18Words);
    const secondVector = requireVector3Words(vector0cAnd24Words);
    const unsignedControlId = controlId >>> 0;
    const controlMatched = (
      target.hasMomtRecord
      && target.controlIds.has(unsignedControlId)
    );
    fixo.primaryVectorWords = [...firstVector];
    fixo.secondaryVectorWords = [...secondVector];
    fixo.lowerVectorWords = [...firstVector];
    fixo.upperVectorWords = [...secondVector];
    fixo.word30 = controlMatched ? 1 : 3;
    if (controlMatched) fixo.controlIdDword = unsignedControlId;
    fixo.targetObjectTag = targetKey;
    return {
      applied: true,
      controlMatched,
      state: this.readFixoRecord(objectTag),
    };
  }

  resetFixoRecord({ objectTag, recordTag }) {
    if (recordTag !== "FIXO") {
      throw new Error("native associated record must use the FIXO tag");
    }
    const fixo = this.recordFor(objectTag).record?.fixo;
    if (!fixo) {
      return { applied: false, reason: "fixo-record-missing" };
    }
    fixo.lowerVectorWords.fill(0);
    fixo.upperVectorWords.fill(0);
    fixo.word30 = 0;
    fixo.word32 = 0;
    return { applied: true, state: this.readFixoRecord(objectTag) };
  }

  readFixoRecord(objectTag) {
    const fixo = this.recordFor(objectTag).record?.fixo;
    return fixo
      ? {
          primaryVectorWords: [...fixo.primaryVectorWords],
          secondaryVectorWords: [...fixo.secondaryVectorWords],
          lowerVectorWords: [...fixo.lowerVectorWords],
          upperVectorWords: [...fixo.upperVectorWords],
          word30: fixo.word30,
          word32: fixo.word32,
          controlIdDword: fixo.controlIdDword,
          targetObjectTag: fixo.targetObjectTag,
        }
      : undefined;
  }

  configureFigpRecord({
    objectTag,
    actorAvailable,
    recordAvailable,
    byte10 = 0,
    byte11 = 0,
    byte12 = 0,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof recordAvailable !== "boolean"
    ) {
      throw new TypeError("native FIGP availability must be boolean");
    }
    for (const [name, value] of Object.entries({ byte10, byte11, byte12 })) {
      if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new RangeError(`native FIGP ${name} must be a byte`);
      }
    }
    const { key, record } = this.recordFor(objectTag, { create: true });
    record.figp = {
      actorAvailable,
      recordAvailable,
      byte10,
      byte11,
      byte12,
    };
    return this.readFigpRecord(key);
  }

  applyFigpByte10({ objectTag, recordTag, byte10 }) {
    if (recordTag !== "FIGP") {
      throw new Error("native associated record must use the FIGP tag");
    }
    if (!Number.isInteger(byte10)) {
      throw new TypeError("native FIGP byte +0x10 must be an integer word");
    }
    const { key, record } = this.recordFor(objectTag);
    const figp = record?.figp;
    if (!figp?.actorAvailable) {
      return { applied: false, nativeNoOp: true, reason: "actor-unavailable" };
    }
    if (!figp.recordAvailable) {
      return { applied: false, nativeNoOp: true, reason: "figp-record-missing" };
    }
    const previous = figp.byte10;
    figp.byte10 = byte10 & 0xff;
    return {
      applied: true,
      objectTag: key,
      recordTag: "FIGP",
      offset: 0x10,
      previous,
      value: figp.byte10,
    };
  }

  applyFigpBytePair({ objectTag, recordTag, byte11, byte12 }) {
    if (recordTag !== "FIGP") {
      throw new Error("native associated record must use the FIGP tag");
    }
    if (!Number.isInteger(byte11) || !Number.isInteger(byte12)) {
      throw new TypeError("native FIGP fields must be integer words");
    }
    const { key, record } = this.recordFor(objectTag);
    const figp = record?.figp;
    if (!figp?.actorAvailable) {
      return { applied: false, nativeNoOp: true, reason: "actor-unavailable" };
    }
    if (!figp.recordAvailable) {
      return { applied: false, nativeNoOp: true, reason: "figp-record-missing" };
    }
    const previous = { byte11: figp.byte11, byte12: figp.byte12 };
    figp.byte11 = byte11 & 0xff;
    figp.byte12 = byte12 & 0xff;
    return {
      applied: true,
      objectTag: key,
      recordTag: "FIGP",
      previous,
      byte11: figp.byte11,
      byte12: figp.byte12,
    };
  }

  readFigpRecord(objectTag) {
    const figp = this.recordFor(objectTag).record?.figp;
    return figp ? { ...figp } : undefined;
  }

  configureTelmRecord({
    objectTag,
    available,
    primaryLinkDword = 0,
    controllerStateDword = 0,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native TELM availability must be boolean");
    }
    if (
      !Number.isInteger(primaryLinkDword)
      || !Number.isInteger(controllerStateDword)
    ) {
      throw new TypeError("native TELM dword values must be integers");
    }
    const { record } = this.recordFor(objectTag, { create: available });
    if (!record) return;
    if (available) {
      record.telm = {
        primaryLinkDword: primaryLinkDword >>> 0,
        controllerStateDword: controllerStateDword >>> 0,
        resolvedObjectTag: undefined,
        operationContextBound: false,
      };
    } else {
      delete record.telm;
    }
  }

  applyTelmControl({
    objectTag,
    recordTag,
    mode,
    commonBinding,
    primaryLinkDword,
    controllerStateDword,
  }) {
    if (recordTag !== "TELM") {
      throw new Error("native associated record must use the TELM tag");
    }
    if (
      commonBinding?.resolvedObject !== true
      || commonBinding?.operationContext !== true
    ) {
      throw new Error("native TELM common object/context binding is required");
    }
    const { key, record } = this.recordFor(objectTag);
    const telm = record?.telm;
    if (!telm) {
      return { applied: false, reason: "telm-record-missing" };
    }
    telm.resolvedObjectTag = key;
    telm.operationContextBound = true;
    if (mode === 4) {
      return {
        applied: true,
        result: telm.primaryLinkDword,
        state: { ...telm },
      };
    }
    if (mode !== 10) {
      throw new RangeError("native TELM mode must be 4 or 10");
    }
    if (
      (primaryLinkDword >>> 0) !== 0xffffffff
      || controllerStateDword !== 21
    ) {
      throw new Error("native TELM mode-10 fields changed");
    }
    telm.primaryLinkDword = 0xffffffff;
    telm.controllerStateDword = 21;
    return { applied: true, state: { ...telm } };
  }

  readTelmRecord(objectTag) {
    const telm = this.recordFor(objectTag).record?.telm;
    return telm ? { ...telm } : undefined;
  }
}

export function createNativeAssociatedRecordState() {
  return new NativeAssociatedRecordState();
}
