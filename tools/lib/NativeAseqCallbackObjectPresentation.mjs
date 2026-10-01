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

function operationFrame(bytes, callbackFunction, operation, nativeFunction = null, durationFrames = null) {
  try {
    return nativeAseqGoverningActivityFrame(
      bytes, callbackFunction, Number.parseInt(operation.callFileOffset, 16),
    );
  } catch (error) {
    // FIXO can be installed before playback starts (not just at a frame
    // guard). Prove that placement on the callback's unique entry path;
    // an unrecognized late or conditional command is still an error.
    const blocks = new Map((nativeFunction?.blocks || []).map(block => [block.id, block]));
    const visited = new Set();
    let block = blocks.get(nativeFunction?.entryBlock);
    let encountered = false;
    while (block && !visited.has(block.id)) {
      visited.add(block.id);
      for (const action of block.actions) {
        if (action.callFileOffset === operation.callFileOffset) encountered = true;
        if (action.semanticId === "native-operation-0050-aseq-activity-control") {
          const value = action.arguments[0];
          // Callbacks can begin after their owner starts ASEQ. Setup before
          // the first completion poll (-1) is still entry setup, not a late
          // detach merely because this function never starts ASEQ itself.
          if (encountered && (value.kind === "frame-field"
            || (value.kind === "constant" && (value.value < 0x80000000
              || value.value === 0xffffffff)))) return 0;
          block = null;
          break;
        }
      }
      block = block?.successors.length === 1 ? blocks.get(block.successors[0]) : null;
    }
    // Likewise, a reset on the unique "activity finished" exit path belongs
    // to the terminal boundary, not an invented early detach frame.
    if (Number.isSafeInteger(durationFrames)) {
      for (const action of [...blocks.values()].flatMap(value => value.actions)) {
        if (action.semanticId !== "native-operation-0050-aseq-activity-control"
          || action.arguments[0]?.value !== 0xffffffff
          || action.resultComparison?.comparison !== "equal"
          || action.resultComparison.constant !== 0) continue;
        block = blocks.get(action.resultComparison.resolvedBranch?.comparisonTrueSuccessor);
        const exitVisited = new Set();
        while (block && !exitVisited.has(block.id)) {
          exitVisited.add(block.id);
          if (block.actions.some(value => value.callFileOffset === operation.callFileOffset)) return durationFrames;
          block = block.successors.length === 1 ? blocks.get(block.successors[0]) : null;
        }
      }
    }
    throw error;
  }
}

function blockActions(nativeFunction) {
  return nativeFunction.blocks.flatMap(block => (
    (block.actions || []).map(action => ({ block, action }))
  ));
}

export function frameWords(nativeFunction, block, pointer, operation) {
  const label = operation.callFileOffset;
  if (pointer?.kind !== "frame-address" || !Number.isInteger(pointer.offset)) {
    throw new Error(`${label} is not an exact native frame vector`);
  }
  const writes = new Map();
  const seen = new Set();
  let current = block;
  // Compiled callbacks reuse a vector for successive props, overwriting only
  // changed components. Follow the unique predecessor chain, not file order:
  // a nearby write on another branch is not evidence for this attachment.
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    for (const action of [...(current.actions || [])].reverse()) {
      if (action.kind === "frameFieldExpressionWrite" && action.width === 4
        && [0, 4, 8].some(delta => pointer.offset + delta === action.offset)
        && Number.parseInt(action.callFileOffset, 16) < Number.parseInt(label, 16)
        && !writes.has(action.offset)) {
        throw new Error(`${label} has dynamic native frame-vector writes`);
      }
      if (action.kind === "frameFieldWrite" && action.width === 4
        && Number.parseInt(action.callFileOffset, 16) < Number.parseInt(label, 16)
        && !writes.has(action.offset)) writes.set(action.offset, action.value >>> 0);
    }
    if ([0, 4, 8].every(delta => writes.has(pointer.offset + delta))) break;
    const predecessors = nativeFunction.blocks.filter(candidate => candidate.successors?.includes(current.id));
    current = predecessors.length === 1 ? predecessors[0] : null;
  }
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
  // Some callbacks keep their initial hinge poses in MAPINFO constants,
  // rather than constructing the same three words on the coroutine stack.
  const rotationRaw = rotationPointer?.kind === "static-pointer"
    ? [0, 4, 8].map(delta => bytes.readInt32LE(rotationPointer.value + delta))
    : frameWordsBefore(nativeFunction, rotationPointer, operation).map(signed32);
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

// Compile the bounded, constant-step HMDL loops used by multipart props.
// This recovers data; it does not add another native interpreter to playback.
// Only the proven pattern (one selector, one inclusive counter, one tick per
// iteration, integer vector writes) is accepted. Other callbacks stay explicit
// extraction failures instead of receiving guessed motion.
export function extractNativeAseqCountedNodeTransformLoop({
  nativeFunction, selector, firstFrame, activitySlot = 0,
} = {}) {
  const entries = blockActions(nativeFunction);
  const actions = entries.map(entry => entry.action);
  const loopBounds = nativeFunction.blocks.flatMap(block => (
    block.frameFieldComparisons || []
  )).filter(comparison => {
    const range = comparison.expression?.left?.operand;
    return comparison.comparison === "frame-expression"
      && comparison.expression.kind === "equal"
      && comparison.expression.right?.value === 0
      && range?.kind === "signed-greater-or-equal"
      && range.left?.kind === "constant"
      && range.right?.kind === "frame-field";
  });
  if (loopBounds.length !== 1 || !Number.isInteger(selector)
    || !Number.isSafeInteger(firstFrame) || firstFrame < 0) {
    throw new Error("HMDL loop has no unique bounded counter or selector");
  }
  const range = loopBounds[0].expression.left.operand;
  const counter = range.right.offset;
  const counterWrites = actions.filter(action => action.offset === counter);
  const delays = actions.filter(action => action.semanticId === "native-scheduler-countdown");
  if (counterWrites.length !== 2
    || counterWrites[0].kind !== "frameFieldWrite" || counterWrites[0].value !== 0
    || counterWrites[1].expression?.kind !== "add"
    || counterWrites[1].expression.left?.offset !== counter
    || counterWrites[1].expression.right?.value !== 1
    || delays.length !== 1 || delays[0].runtimeDispatch?.arguments?.[0]?.value !== 1) {
    throw new Error("HMDL loop is not an inclusive single-tick counter");
  }
  const selectedBlocks = nativeFunction.blocks.flatMap(block => (
    (block.frameFieldComparisons || [])
      .filter(comparison => comparison.comparison === "cmp/eq"
        && comparison.constant === selector && comparison.fieldOffset === 0)
      .map(comparison => nativeFunction.blocks.find(candidate => (
        candidate.id === comparison.resolvedBranch?.comparisonTrueSuccessor
      )))
  ));
  const selectorWrites = actions.filter(action => action.offset === 0);
  if (selectedBlocks.length !== 2 || selectedBlocks.some(block => !block)
    || !selectorWrites.length || selectorWrites.some(action => (
      action.kind !== "frameFieldExpressionWrite"
      || action.expression?.kind !== "frame-field"
      || action.expression.offset !== nativeFunction.frameArgumentBase
    ))) throw new Error("HMDL loop selector cases are unresolved");

  const initial = new Map();
  const increments = new Map();
  for (const action of nativeFunction.blocks[0].actions) {
    if (action.kind === "frameFieldWrite" && action.width === 4) {
      initial.set(action.offset, signed32(action.value));
    }
  }
  for (const action of selectedBlocks.flatMap(block => block.actions)) {
    if (action.kind === "frameFieldWrite" && action.width === 4) {
      initial.set(action.offset, signed32(action.value));
    } else if (action.kind === "frameFieldExpressionWrite" && action.width === 4
      && ["add", "subtract"].includes(action.expression?.kind)
      && action.expression.left?.kind === "frame-field"
      && action.expression.left.offset === action.offset
      && action.expression.right?.kind === "constant") {
      increments.set(action.offset, action.expression.right.value
        * (action.expression.kind === "subtract" ? -1 : 1));
    } else throw new Error("HMDL loop contains a nonconstant vector update");
  }
  const cues = [];
  for (const operation of actions.filter(action => action.semanticId === "hmdl-transform")) {
    const [object, key, position, rotation, mode] = operation.arguments;
    if (position?.value !== 0 || mode?.value !== 0 || rotation?.kind !== "frame-address") {
      throw new Error(`${operation.callFileOffset} HMDL loop descriptor is unsupported`);
    }
    const rotationRaw = [0, 4, 8].map(delta => initial.get(rotation.offset + delta));
    if (rotationRaw.some(value => !Number.isInteger(value))) {
      throw new Error(`${operation.callFileOffset} HMDL loop initial vector is incomplete`);
    }
    const common = {
      objectTag: tag(object, "HMDL loop object"), activitySlot,
      nodeKey: constant(key, "HMDL loop node"), callFileOffset: operation.callFileOffset,
    };
    cues.push({ ...common, frame: firstFrame, mode: "set", rotationRaw });
    const step = [0, 4, 8].map(delta => increments.get(rotation.offset + delta) || 0);
    if (step.some(value => value !== 0)) cues.push({
      ...common, firstFrame, lastFrame: firstFrame + range.left.value,
      mode: "add", rotationRaw: step,
    });
  }
  if (!cues.length) throw new Error("HMDL loop has no node transforms");
  return Object.freeze(cues);
}

export function extractNativeAseqCallbackObjectPresentation({
  bytes,
  callbackFunction,
  nativeFunction,
  durationFrames,
  activitySlot = 0,
  objectTags = null,
} = {}) {
  if (!Buffer.isBuffer(bytes) || !Number.isInteger(callbackFunction)) {
    throw new TypeError("native callback object presentation inputs are invalid");
  }
  const entries = blockActions(nativeFunction);
  // A room callback can mix several independent presentation owners. Allow
  // extraction of named props without interpreting unrelated actor controls
  // or room cleanup. Their original operations remain in the retained IR.
  const selectedTags = objectTags === null ? null : new Set(objectTags);
  const operations = entries.filter(({ action }) => action.kind === "engineOperation"
    && (!selectedTags || selectedTags.has(action.arguments?.[0]?.ascii)));
  const attachedObjectCues = [];
  const nodeTransformCues = [];
  const nativeActorLookPointCues = [];
  for (const { block, action } of operations) {
    if (action.semanticId === "resolved-object-fixo-attachment-install") {
      const translation = frameWords(nativeFunction, block, action.arguments[3], action)
        .map(float32);
      const rotationRaw = frameWords(nativeFunction, block, action.arguments[4], action)
        .map(value => value & 0xffff);
      attachedObjectCues.push(Object.freeze({
        objectTag: tag(action.arguments[0], `${action.callFileOffset} FIXO object`),
        activitySlot,
        frame: operationFrame(bytes, callbackFunction, action, nativeFunction, durationFrames),
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
        frame: operationFrame(bytes, callbackFunction, action, nativeFunction, durationFrames),
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
          frame: operationFrame(bytes, callbackFunction, action, nativeFunction, durationFrames),
          actorTag,
          selector,
          mode,
          target: null,
          callFileOffset: action.callFileOffset,
        }));
        continue;
      }
      const prior = entries.filter(({ action: candidate }) => (
        ["resolved-object-indexed-vector-query", "resolved-object-base-vector-query"].includes(candidate.semanticId)
        && candidate.arguments?.[2]?.kind === "frame-address"
        && candidate.arguments[2].offset === action.arguments[2]?.offset
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
      const baseQuery = prior.semanticId === "resolved-object-base-vector-query";
      if (baseQuery && (signed32(constant(prior.arguments[1], "LKPT base selector")) !== -1
        || constant(prior.arguments[3], "LKPT base flags") !== 0)) {
        throw new Error(`${prior.callFileOffset} LKPT base query is unsupported`);
      }
      const target = Object.freeze(baseQuery ? {
        kind: "object-base",
        objectTag: tag(prior.arguments[0], `${prior.callFileOffset} LKPT target`),
        offset: Object.freeze([0, 0, 0]),
      } : {
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
