import {
  nativeAseqGoverningActivityFrame,
} from "./NativeAseqScriptOwnership.mjs";

const hex = value => `0x${value.toString(16)}`;

function constant(argument, label) {
  if (argument?.kind !== "constant" || !Number.isInteger(argument.value)) {
    throw new Error(`${label} is not an exact native constant`);
  }
  return argument.value;
}

function tag(argument, label) {
  if (argument?.kind !== "constant" || !/^[\x20-\x7e]{4}$/.test(argument.ascii || "")) {
    throw new Error(`${label} is not an exact native object tag`);
  }
  return argument.ascii;
}

function signed32(value) {
  return value | 0;
}

function float32(word) {
  const bytes = new ArrayBuffer(4);
  new DataView(bytes).setUint32(0, word >>> 0, true);
  return new DataView(bytes).getFloat32(0, true);
}

function operationFrame(bytes, callbackFunction, operation) {
  return nativeAseqGoverningActivityFrame(
    bytes,
    callbackFunction,
    Number.parseInt(operation.callFileOffset, 16),
  );
}

function blockActions(nativeFunction) {
  return nativeFunction.blocks.flatMap(block => (
    (block.actions || []).map(action => ({ block, action }))
  ));
}

function frameWords(block, pointer, label) {
  if (pointer?.kind !== "frame-address" || !Number.isInteger(pointer.offset)) {
    throw new Error(`${label} is not an exact native frame vector`);
  }
  const writes = new Map((block.actions || [])
    .filter(action => action.kind === "frameFieldWrite" && action.width === 4)
    .map(action => [action.offset, action.value >>> 0]));
  const words = [0, 4, 8].map(delta => writes.get(pointer.offset + delta));
  if (words.some(value => !Number.isInteger(value))) {
    throw new Error(`${label} has no exact native frame-vector writes`);
  }
  return words;
}

function frameWordsBefore(nativeFunction, pointer, operation) {
  if (pointer?.kind !== "frame-address" || !Number.isInteger(pointer.offset)) {
    throw new Error(`${operation.callFileOffset} is not an exact native frame vector`);
  }
  const call = Number.parseInt(operation.callFileOffset, 16);
  const writes = new Map();
  for (const { action } of blockActions(nativeFunction)) {
    if (
      action.kind === "frameFieldWrite"
      && action.width === 4
      && Number.parseInt(action.callFileOffset, 16) < call
    ) writes.set(action.offset, action.value >>> 0);
  }
  const words = [0, 4, 8].map(delta => writes.get(pointer.offset + delta));
  if (words.some(value => !Number.isInteger(value))) {
    throw new Error(`${operation.callFileOffset} has no exact native frame-vector writes`);
  }
  return words;
}

function expressionRange(nativeFunction, operationBlock) {
  const byId = new Map(nativeFunction.blocks.map(block => [block.id, block]));
  const targetOffset = Number.parseInt(operationBlock.id, 16);
  const reaches = (startId, targetId, seen = new Set()) => {
    if (startId === targetId) return true;
    if (seen.has(startId)) return false;
    if (Number.parseInt(startId, 16) > targetOffset) return false;
    seen.add(startId);
    const block = byId.get(startId);
    return Boolean(block?.successors?.some(
      value => reaches(value, targetId, new Set(seen)),
    ));
  };
  for (const block of nativeFunction.blocks) {
    const comparison = block.frameFieldComparisons?.find(value => (
      value.comparison === "frame-expression"
      && value.expression?.kind === "equal"
      && value.expression.right?.kind === "constant"
      && value.expression.right.value === 0
    ));
    if (!comparison?.resolvedBranch) continue;
    const expression = comparison.expression.left;
    const operands = expression?.kind === "bitwise-and"
      ? [expression.left?.operand, expression.right?.operand]
      : [];
    const lower = operands.find(value => (
      value?.kind === "signed-greater-or-equal"
      && value.left?.kind === "frame-field"
      && value.right?.kind === "constant"
    ));
    const upper = operands.find(value => (
      value?.kind === "signed-greater-or-equal"
      && value.left?.kind === "constant"
      && value.right?.kind === "frame-field"
    ));
    if (!lower || !upper || lower.left.offset !== upper.right.offset) continue;
    const branch = comparison.resolvedBranch;
    const trueReaches = reaches(branch.comparisonTrueSuccessor, operationBlock.id);
    const falseReaches = reaches(branch.comparisonFalseSuccessor, operationBlock.id);
    if (trueReaches === falseReaches || !falseReaches) continue;
    return Object.freeze({
      firstFrame: lower.right.value,
      lastFrame: upper.left.value,
    });
  }
  return null;
}

function hmdlTransform(
  bytes,
  callbackFunction,
  nativeFunction,
  block,
  operation,
  activitySlot,
) {
  const objectTag = tag(operation.arguments[0], `${operation.callFileOffset} HMDL object`);
  const nodeKey = constant(operation.arguments[1], `${operation.callFileOffset} HMDL node`);
  const positionPointer = operation.arguments[2];
  const rotationPointer = operation.arguments[3];
  const mode = constant(operation.arguments[4], `${operation.callFileOffset} HMDL mode`);
  if (mode !== 0 || !(positionPointer?.kind === "constant" && positionPointer.value === 0)) {
    throw new Error(`${operation.callFileOffset} HMDL descriptor is unsupported`);
  }
  const expression = (block.actions || []).find(action => (
    action.kind === "frameFieldExpressionWrite"
    && rotationPointer?.kind === "frame-address"
    && action.offset >= rotationPointer.offset
    && action.offset <= rotationPointer.offset + 8
  ));
  if (expression) {
    const range = expressionRange(nativeFunction, block);
    const value = expression.expression?.right;
    if (
      !range
      || !["add", "subtract"].includes(expression.expression?.kind)
      || value?.kind !== "constant"
    ) throw new Error(`${operation.callFileOffset} HMDL range is unresolved`);
    const vector = [0, 0, 0];
    vector[(expression.offset - rotationPointer.offset) / 4] = (
      expression.expression.kind === "subtract" ? -value.value : value.value
    );
    return Object.freeze({
      objectTag,
      activitySlot,
      ...range,
      nodeKey,
      mode: "add",
      rotationRaw: Object.freeze(vector),
      callFileOffset: operation.callFileOffset,
    });
  }
  const rotationRaw = frameWordsBefore(nativeFunction, rotationPointer, operation)
    .map(signed32);
  let frame;
  try {
    frame = operationFrame(bytes, callbackFunction, operation);
  } catch {
    // Initial HMDL descriptors before the callback starts ASEQ playback are
    // the authored frame-zero object state.
    frame = 0;
  }
  return Object.freeze({
    objectTag,
    activitySlot,
    frame,
    nodeKey,
    mode: "set",
    rotationRaw: Object.freeze(rotationRaw),
    callFileOffset: operation.callFileOffset,
  });
}

export function extractNativeAseqCallbackObjectPresentation({
  bytes,
  callbackFunction,
  nativeFunction,
  durationFrames,
  activitySlot = 0,
} = {}) {
  if (!Buffer.isBuffer(bytes) || !Number.isInteger(callbackFunction)) {
    throw new TypeError("native callback object presentation inputs are invalid");
  }
  const entries = blockActions(nativeFunction);
  const operations = entries.filter(({ action }) => action.kind === "engineOperation");
  const attachedObjectCues = [];
  const nodeTransformCues = [];
  const nativeActorLookPointCues = [];
  for (const { block, action } of operations) {
    if (action.semanticId === "resolved-object-fixo-attachment-install") {
      const translation = frameWords(block, action.arguments[3], action.callFileOffset)
        .map(float32);
      const rotationRaw = frameWords(block, action.arguments[4], action.callFileOffset)
        .map(value => value & 0xffff);
      attachedObjectCues.push(Object.freeze({
        objectTag: tag(action.arguments[0], `${action.callFileOffset} FIXO object`),
        activitySlot,
        frame: operationFrame(bytes, callbackFunction, action),
        action: "attach",
        parentActorTag: tag(action.arguments[1], `${action.callFileOffset} FIXO parent`),
        controlId: constant(action.arguments[2], `${action.callFileOffset} FIXO control`),
        translation: Object.freeze(translation),
        rotationRaw: Object.freeze(rotationRaw),
        callFileOffset: action.callFileOffset,
      }));
      continue;
    }
    if (action.semanticId === "resolved-object-fixo-reset") {
      attachedObjectCues.push(Object.freeze({
        objectTag: tag(action.arguments[0], `${action.callFileOffset} FIXO object`),
        activitySlot,
        frame: operationFrame(bytes, callbackFunction, action),
        action: "detach",
        callFileOffset: action.callFileOffset,
      }));
      continue;
    }
    if (action.semanticId === "hmdl-transform") {
      nodeTransformCues.push(hmdlTransform(
        bytes,
        callbackFunction,
        nativeFunction,
        block,
        action,
        activitySlot,
      ));
      continue;
    }
    if (action.semanticId === "actor-look-point-control") {
      const actorTag = tag(action.arguments[0], `${action.callFileOffset} LKPT actor`);
      const selector = signed32(constant(
        action.arguments[1],
        `${action.callFileOffset} LKPT selector`,
      ));
      const mode = constant(action.arguments[3], `${action.callFileOffset} LKPT mode`);
      if (action.arguments[2]?.kind === "constant" && action.arguments[2].value === 0) {
        nativeActorLookPointCues.push(Object.freeze({
          activitySlot,
          frame: operationFrame(bytes, callbackFunction, action),
          actorTag,
          selector,
          mode,
          target: null,
          callFileOffset: action.callFileOffset,
        }));
        continue;
      }
      const prior = operations.filter(({ action: candidate }) => (
        candidate.semanticId === "resolved-object-indexed-vector-query"
        && Number.parseInt(candidate.callFileOffset, 16)
          < Number.parseInt(action.callFileOffset, 16)
      )).at(-1)?.action;
      const range = expressionRange(nativeFunction, block);
      if (
        !range
        || prior?.arguments?.[2]?.kind !== "frame-address"
        || action.arguments[2]?.kind !== "frame-address"
        || prior.arguments[2].offset !== action.arguments[2].offset
      ) throw new Error(`${action.callFileOffset} LKPT target provenance is unresolved`);
      const target = Object.freeze({
        kind: "actor-component",
        actorTag: tag(prior.arguments[0], `${prior.callFileOffset} LKPT target`),
        selector: constant(prior.arguments[1], `${prior.callFileOffset} LKPT component`),
        associated: constant(prior.arguments[3], `${prior.callFileOffset} LKPT flags`) !== 0,
        offset: Object.freeze([0, 0, 0]),
      });
      for (let frame = range.firstFrame; frame <= range.lastFrame; frame += 1) {
        if (frame >= durationFrames) throw new Error(`${action.callFileOffset} LKPT leaves activity`);
        nativeActorLookPointCues.push(Object.freeze({
          activitySlot,
          frame,
          actorTag,
          selector,
          mode,
          target,
          callFileOffset: action.callFileOffset,
        }));
      }
    }
  }
  attachedObjectCues.sort((left, right) => left.frame - right.frame);
  nodeTransformCues.sort((left, right) => (
    (left.frame ?? left.firstFrame) - (right.frame ?? right.firstFrame)
  ));
  nativeActorLookPointCues.sort((left, right) => left.frame - right.frame);
  return Object.freeze({
    attachedObjectCues: Object.freeze(attachedObjectCues),
    nodeTransformCues: Object.freeze(nodeTransformCues),
    nativeActorLookPointCues: Object.freeze(nativeActorLookPointCues),
  });
}
