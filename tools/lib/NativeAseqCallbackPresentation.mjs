import { NATIVE_HAND_POSE_SLOT_ORDER } from "../../src/NativeHandRig.js";
import { frameWords } from "./NativeAseqCallbackObjectPresentation.mjs";
import {
  nativeAseqGoverningActivityFrame,
  nativeAseqGoverningActivityRange,
} from "./NativeAseqScriptOwnership.mjs";

function offsetHex(value) {
  return `0x${value.toString(16)}`;
}

function exactConstant(argument, label) {
  if (argument?.kind !== "constant" || !Number.isInteger(argument.value)) {
    throw new Error(`${label} is not an exact native constant`);
  }
  return argument.value;
}

function actorTag(argument, label) {
  if (argument?.kind !== "constant" || !/^[\x20-\x7e]{4}$/.test(argument.ascii || "")) {
    throw new Error(`${label} is not an exact four-byte actor tag`);
  }
  return argument.ascii;
}

function operationFrame(bytes, callbackFunction, operation) {
  return nativeAseqGoverningActivityFrame(
    bytes,
    callbackFunction,
    Number.parseInt(operation.callFileOffset, 16),
  );
}

function readHandPoseTable(bytes, argument, label) {
  if (argument?.kind !== "static-pointer" || !Number.isInteger(argument.value)) {
    throw new Error(`${label} has no exact static HAND pose table`);
  }
  const byteLength = NATIVE_HAND_POSE_SLOT_ORDER.length * 3 * 4;
  if (argument.value < 0 || argument.value + byteLength > bytes.length) {
    throw new Error(`${label} HAND pose table leaves the native program`);
  }
  return Object.freeze(Array.from(
    { length: NATIVE_HAND_POSE_SLOT_ORDER.length },
    (_, vectorIndex) => Object.freeze(Array.from(
      { length: 3 },
      (_, axis) => bytes.readInt32LE(argument.value + vectorIndex * 12 + axis * 4),
    )),
  ));
}

function callbackOperations(nativeFunction) {
  if (!nativeFunction || !Array.isArray(nativeFunction.blocks)) {
    throw new TypeError("native ASEQ callback presentation requires a compiled function");
  }
  return nativeFunction.blocks.flatMap(block => block.actions || []).filter(
    action => action.kind === "engineOperation",
  );
}

// Keep the original operation and its binary-proven activity frame. The
// preview compiler decides where it can safely execute it; a route/catalog
// mapping by itself must never be mistaken for a playback trigger.
export function extractNativeAseqCallbackSoundCommands({
  bytes, callbackFunction, nativeFunction, durationFrames, source,
}) {
  return callbackOperations(nativeFunction)
    .filter(operation => operation.semanticId === "sound-command-dispatch")
    .map(action => {
      if (action.arguments?.length !== 3) {
        throw new Error(`${action.callFileOffset} sound command requires three arguments`);
      }
      for (const argument of action.arguments) {
        exactConstant(argument, `${action.callFileOffset} sound argument`);
      }
      const frame = operationFrame(bytes, callbackFunction, action);
      if (frame > durationFrames) {
        throw new Error(`${action.callFileOffset} sound command exceeds activity duration`);
      }
      return {
        frame,
        action,
        source: { ...source, callbackFunction: offsetHex(callbackFunction) },
      };
    });
}

/** Project constant, frame-governed effect cues without running a second VM.
 * Object toggles/scales, static lighting helpers and countdown-delayed sounds
 * remain source-backed. Dynamic helpers are not assigned fabricated timings.
 */
export function extractNativeAseqCallbackStageEffects({
  bytes, nativeFunction, supportingFunctions, durationFrames, source,
}) {
  const callbackFunction = Number.parseInt(nativeFunction.id, 16);
  const functions = new Map(supportingFunctions.map(fn => [fn.id, fn]));
  const frames = new Map();
  const sounds = [];
  const float = word => { const value = Buffer.alloc(4); value.writeUInt32LE(word); return value.readFloatLE(); };
  const add = (frame, cue) => {
    if (!Number.isInteger(frame) || frame < 0 || frame >= durationFrames) {
      throw new Error(`native stage effect exceeds its activity at ${cue.source.callFileOffset}`);
    }
    if (!frames.has(frame)) frames.set(frame, []);
    frames.get(frame).push(cue);
  };
  for (const block of nativeFunction.blocks) {
    for (const action of block.actions) {
      const provenance = { ...source, callbackFunction: nativeFunction.id,
        callFileOffset: action.callFileOffset };
      if (["0x001f", "0x0027"].includes(action.operationHex)) {
        const frame = operationFrame(bytes, callbackFunction, action);
        const tag = actorTag(action.arguments[0], action.callFileOffset);
        const cue = { kind: "scene-object-state", actorTag: tag, source: provenance };
        if (action.operationHex === "0x001f") {
          const mode = exactConstant(action.arguments[1], action.callFileOffset);
          if (![1, 2].includes(mode)) throw new Error("stage object toggle mode is unsupported");
          cue.presented = mode === 1;
        } else cue.scale = frameWords(nativeFunction, block, action.arguments[1], action).map(float);
        add(frame, cue);
      }
      if (action.kind === "directCall") {
        const helper = functions.get(action.targetFileOffset);
        const ops = helper ? callbackOperations(helper) : [];
        const ambient = ops.find(op => op.operationHex === "0x0064");
        const intensity = ops.find(op => op.operationHex === "0x0066"
          && op.arguments[1]?.value === 4);
        if (!ambient || !intensity) continue;
        const pointer = ambient.arguments[0];
        if (pointer?.kind !== "static-pointer") throw new Error("stage ambient color is dynamic");
        // The initial helper precedes the first ASEQ poll: it is entry setup,
        // not an untimed fallback for a later branch.
        const firstPoll = callbackOperations(nativeFunction).find(op => op.operationHex === "0x0050");
        const frame = Number.parseInt(action.callFileOffset, 16) < Number.parseInt(firstPoll.callFileOffset, 16)
          ? 0 : operationFrame(bytes, callbackFunction, action);
        add(frame, { kind: "scene-lighting", ambientColor: [0, 4, 8].map(delta => bytes.readFloatLE(pointer.value + delta)),
          directionalIntensity: float(exactConstant(intensity.arguments[2], intensity.callFileOffset)),
          source: { ...provenance, helperFunction: helper.id, ambientCall: ambient.callFileOffset,
            intensityCall: intensity.callFileOffset } });
      }
      if (action.operationHex === "0x006c" && action.arguments[0]?.value > 0xff) {
        const frame = operationFrame(bytes, callbackFunction, action);
        sounds.push({ frame, commandWord: exactConstant(action.arguments[0], action.callFileOffset), source: provenance });
      }
      if (action.kind === "childCoroutineLaunch") {
        const helper = functions.get(action.targetFileOffset);
        if (!helper) continue;
        const wait = helper.blocks.flatMap(b => b.actions).find(a => a.semanticId === "native-scheduler-countdown");
        const soundOps = callbackOperations(helper).filter(op => op.operationHex === "0x006c"
          && op.arguments[0]?.value > 0xff);
        if (!wait || !soundOps.length) continue;
        const field = wait.runtimeDispatch?.arguments?.[0]?.offset;
        const delayIndex = (field - helper.frameArgumentBase) / 4;
        const delay = exactConstant(action.arguments[delayIndex], action.callFileOffset);
        const variant = exactConstant(action.arguments[0], action.callFileOffset);
        const branch = helper.blocks.flatMap(b => b.frameFieldComparisons || []).find(c =>
          c.comparison === "cmp/eq" && c.constant === variant && c.resolvedBranch);
        const selectedBlock = helper.blocks.find(b => b.id === branch?.resolvedBranch.comparisonTrueSuccessor);
        const sound = selectedBlock?.actions.find(a => soundOps.includes(a));
        if (!sound || wait.runtimeDispatch?.arguments?.length !== 1 || delay < 0) {
          throw new Error(`delayed stage sound cannot be statically resolved at ${action.callFileOffset}`);
        }
        sounds.push({ frame: operationFrame(bytes, callbackFunction, action) + delay,
          commandWord: exactConstant(sound.arguments[0], sound.callFileOffset),
          source: { ...provenance, helperFunction: helper.id, soundCallFileOffset: sound.callFileOffset,
            delayNativeTicks: delay } });
      }
    }
  }
  return {
    programPresentationCues: { frames: [...frames].sort(([a], [b]) => a - b).map(([frame, cues]) => ({ frame, cues })) },
    nativeScriptSoundCues: sounds.sort((a, b) => a.frame - b.frame).map(cue => ({ ...cue,
      sourcePath: `native-script:${source.area}:${cue.commandWord.toString(16).padStart(8, "0")}` })),
  };
}

function precedingOperation(operations, operation, semanticId) {
  const call = Number.parseInt(operation.callFileOffset, 16);
  return operations.filter(candidate => (
    candidate.semanticId === semanticId
    && Number.parseInt(candidate.callFileOffset, 16) < call
  )).at(-1) || null;
}

/** Retain exact native secondary-surface writes on the existing activity
 * timeline. These feed the same control state as interpreted operation 0x0164,
 * not a separate scene/actor-specific sleeve animation.
 */
export function extractNativeAseqCallbackSecondaryMotionControls({
  bytes, nativeFunction, supportingFunctions = [], durationFrames, source,
}) {
  const before = [];
  const frames = new Map();
  for (const action of callbackOperations(nativeFunction).filter(
    action => action.semanticId === "native-secondary-motion-global-float-write",
  )) {
    const frame = callbackOperationFrame(bytes, Number.parseInt(nativeFunction.id, 16),
      nativeFunction, action, supportingFunctions);
    if (frame < 0 || frame >= durationFrames) {
      throw new Error(`native sleeve control exceeds its activity at ${action.callFileOffset}`);
    }
    const cue = { kind: "secondary-motion-global-float",
      mode: exactConstant(action.arguments[0], action.callFileOffset),
      word: exactConstant(action.arguments[1], action.callFileOffset) >>> 0,
      source: { ...source, callbackFunction: nativeFunction.id, callFileOffset: action.callFileOffset } };
    // Entry setup must precede the first visible presentation, not wait for
    // the after-start hook (which would leave a one-frame sleeve pop).
    if (frame === 0) before.push(cue);
    else {
      if (!frames.has(frame)) frames.set(frame, []);
      frames.get(frame).push(cue);
    }
  }
  return { before, frames: [...frames].sort(([a], [b]) => a - b)
    .map(([frame, cues]) => ({ frame, cues })) };
}

// A selected activity may be guarded by a room flag or the delayed-stop latch.
// Do not emulate the predicate: prove one branch is an empty return and the
// other reaches this callback's ASEQ start synchronously. This conditions setup
// on the activity actually playing, not on an invented room-state value.
function normalPlaybackEntry(nativeFunction, branch, functions) {
  if (branch.successors.length !== 2 || !["bf", "bt", "bf/s", "bt/s"].includes(branch.terminator?.mnemonic)) return null;
  const classify = (id, seen = new Set(), empty = true) => {
    const block = nativeFunction.blocks.find(block => block.id === id);
    if (!block || seen.has(id)) return null;
    for (const action of block.actions) {
      empty = false;
      const arg = action.arguments?.[0];
      if (action.operationId === 0x50 && ((arg?.kind === "frame-field" && arg.offset === nativeFunction.frameArgumentBase)
        || (arg?.kind === "constant" && arg.value >= 0 && arg.value < 70))) return "start";
      if (["runtimeInterfaceCall", "coroutineContinuationTransfer", "childCoroutineLaunch"].includes(action.kind)
        || (action.kind === "directCall" && !isSynchronousHelper(
          functions.find(fn => fn.id === action.targetFileOffset), functions,
        ))) return null;
    }
    if (!block.successors.length) return empty ? "return" : null;
    const paths = block.successors.map(next => classify(next, new Set([...seen, id]), empty));
    return paths.every(kind => kind === paths[0]) ? paths[0] : null;
  };
  const kinds = branch.successors.map(id => classify(id));
  return kinds.includes("start") && kinds.includes("return")
    ? branch.successors[kinds.indexOf("start")] : null;
}

function isSynchronousHelper(fn, functions, ancestors = new Set()) {
  if (!fn || ancestors.has(fn.id) || fn.unresolvedControlTransfers?.length) return false;
  const walk = (id, seen = new Set()) => {
    const block = fn.blocks.find(block => block.id === id);
    if (!block || seen.has(id) || (block.terminator
      && !["bra", "braf", "bf", "bt", "bf/s", "bt/s"].includes(block.terminator.mnemonic))) return false;
    if (block.actions.some(action => ["runtimeInterfaceCall", "coroutineContinuationTransfer", "childCoroutineLaunch"].includes(action.kind)
      || (action.kind === "directCall" && !isSynchronousHelper(
        functions.find(child => child.id === action.targetFileOffset), functions, new Set([...ancestors, fn.id]),
      )))) return false;
    return block.successors.every(next => walk(next, new Set([...seen, id])));
  };
  return walk(fn.entryBlock);
}

// Stop at other control flow or scheduler boundaries: missing gates fail.
function callbackOperationFrame(bytes, callbackFunction, nativeFunction, operation, functions = []) {
  const seen = new Set();
  let id = nativeFunction.entryBlock;
  let activityStarted = false;
  while (id && !seen.has(id)) {
    seen.add(id);
    const block = nativeFunction.blocks.find(block => block.id === id);
    if (!block) break;
    for (const action of block.actions) {
      if (action === operation) return 0;
      if (action.operationId === 0x50 && (action.arguments?.[0]?.kind === "frame-field"
        || (action.arguments?.[0]?.kind === "constant" && (action.arguments[0].value | 0) >= 0))) activityStarted = true;
      if (action.kind === "directCall" && isSynchronousHelper(
        functions.find(fn => fn.id === action.targetFileOffset), functions,
      )) continue;
      if (["directCall", "runtimeInterfaceCall", "coroutineContinuationTransfer"].includes(action.kind)) {
        return operationFrame(bytes, callbackFunction, operation);
      }
    }
    const entryAfterGuard = !activityStarted && normalPlaybackEntry(nativeFunction, block, functions);
    if (entryAfterGuard) { id = entryAfterGuard; continue; }
    if ((block.terminator && !["bra", "braf"].includes(block.terminator.mnemonic))
      || block.successors.length !== 1) break;
    id = block.successors[0];
  }
  return operationFrame(bytes, callbackFunction, operation);
}

const handSemantics = new Set([
  "resolved-object-hndl-hndr-vector-install",
  "resolved-object-hndl-hndr-controller-request",
  "actor-mhnd-controller-request",
]);

export function extractNativeHandComponentOperation({ bytes, operation, nativeFunction,
  activitySlot = 0, frame, sourceOrder }) {
  const [actor, side, mask, pointer] = operation.arguments;
  const block = nativeFunction.blocks.find(block => block.actions.includes(operation));
  const rotationRaw = pointer.kind === "static-pointer"
    ? [0, 4, 8].map(delta => bytes.readInt32LE(pointer.value + delta))
    : frameWords(nativeFunction, block, pointer, operation).map(word => word | 0);
  const componentMask = exactConstant(mask, "HAND component mask");
  if (![0x15, 0x2a].includes(componentMask)) throw new Error("HAND component mask is unsupported");
  const sideIndex = exactConstant(side, "HAND component side");
  if (sideIndex !== 0 && sideIndex !== 1) throw new Error("HAND component side is unsupported");
  return { activitySlot, frame,
    actorTag: actorTag(actor, operation.callFileOffset),
    side: sideIndex === 0 ? "left" : "right",
    componentMask, rotationRaw, callFileOffset: operation.callFileOffset, sourceOrder };
}

export function extractNativeAseqCallbackHandPresentation({ bytes, callbackFunction, nativeFunction, activitySlot = 0, functions = [] }) {
  const nativeHandPoseTables = {};
  const nativeHandPoseCues = [];
  const nativeBodyHandPoseCues = [];
  const nativeHandComponentCues = [];
  const nativeHandComponentLimitations = [];
  const mixedHandOrder = functions.length > 0 || callbackOperations(nativeFunction)
    .some(operation => ["actor-mhnd-controller-request", "resolved-object-hndl-hndr-component-write"].includes(operation.semanticId));
  const containsHandCommands = (fn, seen = new Set()) => {
    if (!fn || seen.has(fn.id)) throw new Error("HAND callback has a missing or recursive helper");
    return fn.blocks.flatMap(block => block.actions).some(action => handSemantics.has(action.semanticId)
      || (action.kind === "directCall" && containsHandCommands(
        functions.find(fn => fn.id === action.targetFileOffset), new Set([...seen, fn.id]),
      )));
  };
  let sourceOrder = 0;
  const extract = (operation, frame, provenance = {}) => {
    if (operation.semanticId === "resolved-object-hndl-hndr-component-write") {
      nativeHandComponentCues.push({ ...extractNativeHandComponentOperation({
        bytes, operation, nativeFunction, activitySlot, frame, sourceOrder: sourceOrder++,
      }), ...provenance });
      return;
    }
    if (operation.semanticId === "actor-mhnd-controller-request") {
      const [actor, channel, target, duration] = operation.arguments;
      nativeBodyHandPoseCues.push({
        activitySlot, frame, actorTag: actorTag(actor, operation.callFileOffset),
        channel: exactConstant(channel, "MHND channel"),
        targetIndex: exactConstant(target, "MHND target"),
        durationNativeTicks: exactConstant(duration, "MHND duration"),
        callFileOffset: operation.callFileOffset, sourceOrder: sourceOrder++, ...provenance,
      });
      return;
    }
    if (operation.semanticId !== "resolved-object-hndl-hndr-vector-install") return;
    const { tableKey, table, cue } = extractNativeHandPoseOperation({
      bytes, operation, activitySlot, frame,
    });
    nativeHandPoseTables[tableKey] = table;
    nativeHandPoseCues.push({ ...cue, ...(mixedHandOrder ? { sourceOrder: sourceOrder++ } : {}), ...provenance });
  };
  for (const action of nativeFunction.blocks.flatMap(block => block.actions || [])) {
    if (action.kind === "directCall" && functions.length) {
      const helper = functions.find(fn => fn.id === action.targetFileOffset);
      if (!helper) throw new Error(`${action.callFileOffset} HAND helper is unavailable`);
      if (!containsHandCommands(helper)) continue;
      if (!isSynchronousHelper(helper, functions)) throw new Error(`${helper.id} HAND helper has unsupported control flow or scheduler boundary`);
      const frame = callbackOperationFrame(bytes, callbackFunction, nativeFunction, action, functions);
      const setup = extractNativeAseqHandInitialization({ bytes, nativeFunction: helper, functions,
        activitySlot, entryArguments: action.arguments, ownerCallFileOffset: action.callFileOffset,
        includeSourceOrder: true });
      Object.assign(nativeHandPoseTables, setup.nativeHandPoseTables);
      const cues = [...setup.nativeHandPoseCues, ...setup.nativeBodyHandPoseCues]
        .sort((left, right) => left.sourceOrder - right.sourceOrder);
      for (const cue of cues) {
        (cue.poseTableOffset ? nativeHandPoseCues : nativeBodyHandPoseCues)
          .push({ ...cue, frame, sourceOrder: sourceOrder++ });
      }
    } else if (["resolved-object-hndl-hndr-vector-install", "actor-mhnd-controller-request",
      "resolved-object-hndl-hndr-component-write"].includes(action.semanticId)) {
      let frame;
      try {
        frame = callbackOperationFrame(bytes, callbackFunction, nativeFunction, action, functions);
        extract(action, frame);
      }
      catch (error) {
        if (action.semanticId !== "resolved-object-hndl-hndr-component-write"
          || !/has no governing ASEQ frame|has (?:no exact|dynamic) native frame-vector writes/.test(error.message)) throw error;
        // Dynamic feedback (00ea reads) and conditional per-frame arithmetic
        // require more than a fixed cue. Keep the exact omission observable;
        // never freeze the lane at a partial set of translated constants.
        nativeHandComponentLimitations.push({
          actorTag: actorTag(action.arguments[0], action.callFileOffset),
          side: exactConstant(action.arguments[1], "HAND component side") === 0 ? "left" : "right",
          callFileOffset: action.callFileOffset, reason: error.message,
        });
      }
    }
  }
  nativeHandPoseCues.sort((left, right) => left.frame - right.frame);
  nativeBodyHandPoseCues.sort((left, right) => left.frame - right.frame);
  return { nativeHandPoseTables, nativeHandPoseCues, nativeBodyHandPoseCues,
    nativeHandComponentCues: nativeHandComponentCues.filter(cue => !nativeHandComponentLimitations.some(
      limit => limit.actorTag === cue.actorTag && limit.side === cue.side)),
    nativeHandComponentLimitations };
}

export function extractNativeHandPoseOperation({
  bytes, operation, frame, activitySlot = 0, actorArgument = operation.arguments[0],
}) {
  const actor = actorTag(actorArgument, `${operation.callFileOffset} HAND actor`);
  const side = exactConstant(operation.arguments[1], `${operation.callFileOffset} HAND side`);
  const ticks = exactConstant(operation.arguments[3], `${operation.callFileOffset} HAND duration`);
  if ((side !== 0 && side !== 1) || ticks < 0) {
    throw new Error(`${operation.callFileOffset} has invalid HAND control arguments`);
  }
  const vectors = readHandPoseTable(bytes, operation.arguments[2], operation.callFileOffset);
  const tableKey = offsetHex(operation.arguments[2].value);
  return {
    tableKey,
    table: Object.freeze({ sourceMapinfoOffset: tableKey, vectors }),
    cue: Object.freeze({
      activitySlot, frame, actorTag: actor, side: side === 0 ? "left" : "right",
      poseTableOffset: tableKey,
      // Native installer 0x0c0dee94 clamps the signed duration to at least one.
      // Zero means apply the vectors immediately, not merely enable the mesh.
      durationNativeTicks: Math.max(1, ticks),
      callFileOffset: operation.callFileOffset,
    }),
  };
}

export function extractNativeAseqHandInitialization({
  bytes, nativeFunction, functions, activitySlot, entryArguments = [], ownerCallFileOffset = null,
  includeSourceOrder = false,
}) {
  const nativeHandPoseTables = {};
  const nativeHandPoseCues = [];
  const nativeBodyHandPoseCues = [];
  const containsPose = (fn, ancestors = new Set()) => {
    if (!fn || ancestors.has(fn.id)) throw new Error("HAND initializer has a missing or recursive helper");
    return fn.blocks.flatMap(block => block.actions).some(action => (
      ["resolved-object-hndl-hndr-vector-install", "actor-mhnd-controller-request"].includes(action.semanticId)
      || (action.kind === "directCall" && containsPose(
        functions.find(candidate => candidate.id === action.targetFileOffset),
        new Set([...ancestors, fn.id]),
      ))
    ));
  };
  const visit = (fn, args = [], ownerCall = null, ancestors = new Set()) => {
    if (!fn || ancestors.has(fn.id)) throw new Error("HAND initializer has a missing or recursive helper");
    if (fn.unresolvedControlTransfers?.length) throw new Error(`${fn.id} HAND initializer has unresolved control flow`);
    const bind = argument => argument?.kind === "frame-field"
      ? args[(argument.offset - fn.frameArgumentBase) / 4] : argument;
    const walk = (id, seen = new Set()) => {
      const block = fn.blocks.find(candidate => candidate.id === id);
      if (!block || seen.has(id)) {
        throw new Error(`${fn.id} HAND initializer has missing or cyclic control flow`);
      }
      const cues = [];
      for (const operation of block.actions) {
        if (operation.kind === "directCall") {
          const child = functions.find(candidate => candidate.id === operation.targetFileOffset);
          // Ignore a proven pose-free helper, not arbitrary unsupported calls.
          // Actor visibility/face setup does not change these detailed vectors.
          if (containsPose(child)) cues.push(...visit(child, operation.arguments.map(bind), operation.callFileOffset, new Set([...ancestors, fn.id])));
        } else if (operation.semanticId === "resolved-object-hndl-hndr-controller-request") {
          const [actor, mode, side, value] = operation.arguments.map(bind);
          if (mode?.value === 0 && value?.value === 0) cues.push({ resetSide: exactConstant(side, "HAND reset side"),
            actorTag: actorTag(actor, operation.callFileOffset), sourceFunction: fn.id, ownerCallFileOffset: ownerCall });
        } else if (operation.semanticId === "resolved-object-hndl-hndr-vector-install") {
          const actorArgument = bind(operation.arguments[0]);
          const { tableKey, table, cue } = extractNativeHandPoseOperation({
            bytes, operation, actorArgument, activitySlot, frame: 0,
          });
          nativeHandPoseTables[tableKey] = table;
          cues.push({ ...cue, sourceFunction: fn.id, ownerCallFileOffset: ownerCall });
        } else if (operation.semanticId === "actor-mhnd-controller-request") {
          const [actor, channel, target, duration] = operation.arguments.map(bind);
          cues.push({ activitySlot, frame: 0, actorTag: actorTag(actor, operation.callFileOffset),
            channel: exactConstant(channel, "MHND channel"), targetIndex: exactConstant(target, "MHND target"),
            durationNativeTicks: exactConstant(duration, "MHND duration"), callFileOffset: operation.callFileOffset,
            sourceFunction: fn.id, ownerCallFileOffset: ownerCall });
        } else if (operation.kind === "frameFieldWrite"
          && operation.width === 4 && (operation.offset < fn.frameArgumentBase
            || operation.offset >= fn.frameArgumentBase + args.length * 4)) {
          // Unrelated local vectors do not mutate bound actor arguments. A
          // later HAND command using such a local still fails exact binding.
          continue;
        } else if (["frameFieldWrite", "frameFieldExpressionWrite", "runtimeInterfaceCall", "coroutineContinuationTransfer"].includes(operation.kind)) {
          throw new Error(`${fn.id} HAND initializer mutates its frame or crosses a scheduler boundary`);
        }
      }
      // Visibility branches may reconverge before an unconditional hand pose.
      // Accept only identical hand effects on EVERY path, never pick a branch.
      const tails = block.successors.map(next => walk(next, new Set([...seen, id])));
      if (tails.some(tail => JSON.stringify(tail) !== JSON.stringify(tails[0]))) {
        throw new Error(`${fn.id} HAND initializer has conditional hand effects`);
      }
      return [...cues, ...(tails[0] || [])];
    };
    return walk(fn.entryBlock);
  };
  const resets = new Map();
  let sourceOrder = 0;
  for (const cue of visit(nativeFunction, entryArguments, ownerCallFileOffset)) {
    const key = `${cue.sourceFunction}:${cue.ownerCallFileOffset}:${cue.actorTag}`;
    if (cue.resetSide !== undefined) {
      if (!resets.has(key)) resets.set(key, new Set());
      resets.get(key).add(cue.resetSide);
      continue;
    }
    const sides = resets.get(key);
    // A paired native reset followed by MHND hands control back to the body.
    // This is not a general interpretation of standalone 00df as visibility.
    const releaseDetailed = !cue.poseTableOffset && (cue.channel === 2
      ? sides?.has(0) && sides?.has(1) : sides?.has(cue.channel === 0 ? 1 : 0));
    (cue.poseTableOffset ? nativeHandPoseCues : nativeBodyHandPoseCues).push({ ...cue,
      ...(includeSourceOrder ? { sourceOrder: sourceOrder++ } : {}),
      ...(releaseDetailed ? { releaseDetailed: true } : {}),
    });
  }
  return { nativeHandPoseTables, nativeHandPoseCues, nativeBodyHandPoseCues };
}

// The stage-order compiler must validate the owner's control flow first.
// These are commands between completed AUTH stages, not callback frame gates.
// Defer commands for a resident reference actor until an AUTH actually owns it;
// the shared presenter only accepts commands for that activity's actor list.
export function extractNativeAseqOwnerHandPresentation({ bytes, nativeFunction, functions, stages }) {
  const actions = nativeFunction.blocks.flatMap(block => block.actions);
  const containsPose = (fn, ancestors = new Set()) => {
    if (!fn || ancestors.has(fn.id)) throw new Error("HAND owner has a missing or recursive helper");
    return fn.blocks.flatMap(block => block.actions).some(action =>
      handSemantics.has(action.semanticId) || (action.kind === "directCall" && containsPose(
        functions.find(candidate => candidate.id === action.targetFileOffset), new Set([...ancestors, fn.id]))));
  };
  const pending = [];
  const nativeHandPoseTables = {};
  const bySlot = new Map();
  let previousIndex = -1;
  for (const stage of stages) {
    const index = actions.findIndex(action => action.callFileOffset === stage.ownerCallFileOffset);
    if (index <= previousIndex || actions[index]?.operationId !== 0x50
      || actions[index].arguments[0]?.value !== stage.slot) throw new Error("HAND owner stage order changed");
    const setupActions = actions.slice(previousIndex + 1, index).filter(action =>
      handSemantics.has(action.semanticId) || (action.kind === "directCall" && containsPose(
        functions.find(candidate => candidate.id === action.targetFileOffset))));
    const setup = extractNativeAseqHandInitialization({ bytes, functions, activitySlot: stage.slot,
      includeSourceOrder: true, nativeFunction: { ...nativeFunction, entryBlock: nativeFunction.id,
        blocks: [{ id: nativeFunction.id, actions: setupActions, successors: [] }] } });
    Object.assign(nativeHandPoseTables, setup.nativeHandPoseTables);
    pending.push(...[...setup.nativeHandPoseCues, ...setup.nativeBodyHandPoseCues]
      .sort((a, b) => a.sourceOrder - b.sourceOrder));
    const selected = pending.filter(cue => stage.actors.includes(cue.actorTag));
    bySlot.set(stage.slot, {
      nativeHandPoseCues: [], nativeBodyHandPoseCues: [],
    });
    for (const [sourceOrder, cue] of selected.entries()) {
      bySlot.get(stage.slot)[cue.poseTableOffset ? "nativeHandPoseCues" : "nativeBodyHandPoseCues"]
        .push({ ...cue, activitySlot: stage.slot, sourceOrder });
    }
    for (let i = pending.length - 1; i >= 0; i--) if (stage.actors.includes(pending[i].actorTag)) pending.splice(i, 1);
    previousIndex = index;
  }
  return { nativeHandPoseTables, bySlot, unpresentedCues: pending };
}

export function extractNativeAseqCallbackPresentation({
  bytes,
  callbackFunction,
  nativeFunction,
  durationFrames,
  activitySlot = 0,
} = {}) {
  if (
    !Buffer.isBuffer(bytes)
    || !Number.isSafeInteger(callbackFunction)
    || callbackFunction < 0
    || !Number.isSafeInteger(durationFrames)
    || durationFrames < 1
  ) throw new TypeError("native ASEQ callback presentation inputs are invalid");

  const { nativeHandPoseTables, nativeHandPoseCues, nativeBodyHandPoseCues, nativeHandComponentCues, nativeHandComponentLimitations } = extractNativeAseqCallbackHandPresentation({
    bytes, callbackFunction, nativeFunction, activitySlot,
  });
  const nativeDetailedHandDefaults = [];
  const nativeFaceClipCues = [];
  const nativeFaceControllerCues = [];
  const unresolved = [];
  const operations = callbackOperations(nativeFunction);
  const nativeFaceGazeCues = [];
  for (const operation of operations) {
    const call = Number.parseInt(operation.callFileOffset, 16);
    if (operation.semanticId === "resolved-object-hndl-hndr-vector-install") {
      continue;
    }
    if (operation.semanticId === "actor-face-clip-control-write") {
      const frame = operationFrame(bytes, callbackFunction, operation);
      const cue = Object.freeze({
        activitySlot,
        frame,
        actorTag: actorTag(
          operation.arguments[0],
          `${operation.callFileOffset} FACE actor`,
        ),
        clipGroup: exactConstant(
          operation.arguments[1],
          `${operation.callFileOffset} FACE clip group`,
        ),
        selector: exactConstant(
          operation.arguments[2],
          `${operation.callFileOffset} FACE selector`,
        ),
        durationNativeTicks: exactConstant(
          operation.arguments[3],
          `${operation.callFileOffset} FACE duration`,
        ),
        callFileOffset: operation.callFileOffset,
      });
      if (
        cue.frame < 0
        || cue.frame >= durationFrames
        || cue.clipGroup < 0
        || cue.selector < 0
        || cue.durationNativeTicks < 1
      ) throw new Error(`${operation.callFileOffset} has invalid FACE clip arguments`);
      nativeFaceClipCues.push(cue);
      continue;
    }
    if (operation.semanticId === "resolved-face-controller-setup") {
      const cue = Object.freeze({
        activitySlot,
        frame: operationFrame(bytes, callbackFunction, operation),
        actorTag: actorTag(
          operation.arguments[0],
          `${operation.callFileOffset} FACE controller actor`,
        ),
        mode: exactConstant(
          operation.arguments[1],
          `${operation.callFileOffset} FACE controller mode`,
        ),
        intervalNativeTicks: exactConstant(
          operation.arguments[2],
          `${operation.callFileOffset} FACE controller interval`,
        ),
        parameter: exactConstant(
          operation.arguments[3],
          `${operation.callFileOffset} FACE controller parameter`,
        ),
        callFileOffset: operation.callFileOffset,
      });
      if (
        cue.frame < 0
        || cue.frame >= durationFrames
        || cue.mode < 0
        || cue.mode > 0xff
        || cue.intervalNativeTicks < 0
        || cue.intervalNativeTicks > 0xffff
        || cue.parameter < 0
        || cue.parameter > 0xff
      ) throw new Error(`${operation.callFileOffset} has invalid FACE controller arguments`);
      nativeFaceControllerCues.push(cue);
      continue;
    }
    if (operation.semanticId === "resolved-object-face-record-request") {
      const actor = actorTag(operation.arguments[0], `${operation.callFileOffset} gaze actor`);
      const mode = exactConstant(operation.arguments[1], `${operation.callFileOffset} gaze mode`);
      try {
        const frame = operationFrame(bytes, callbackFunction, operation);
        if (mode !== 0) throw new Error("exact-frame FACE gaze is not a reset");
        nativeFaceGazeCues.push(Object.freeze({
          activitySlot,
          frame,
          actorTag: actor,
          mode: 0,
          durationNativeTicks: 16,
          callFileOffset: operation.callFileOffset,
        }));
      } catch {
        const range = nativeAseqGoverningActivityRange(bytes, callbackFunction, call);
        const source = precedingOperation(
          operations,
          operation,
          "resolved-object-indexed-vector-query",
        );
        if (
          mode !== 2
          || source?.arguments?.[2]?.kind !== "frame-address"
          || operation.arguments[2]?.kind !== "frame-address"
          || source.arguments[2].offset !== operation.arguments[2].offset
          || exactConstant(source.arguments[1], `${source.callFileOffset} gaze selector`) !== 5
          || exactConstant(source.arguments[3], `${source.callFileOffset} gaze flags`) !== 0x40000000
        ) throw new Error(`${operation.callFileOffset} FACE gaze provenance is unsupported`);
        const targetActor = actorTag(
          source.arguments[0],
          `${source.callFileOffset} gaze target actor`,
        );
        const durationNativeTicks = exactConstant(
          operation.arguments[3],
          `${operation.callFileOffset} gaze duration`,
        );
        for (let frame = range.firstFrame; frame <= range.lastFrame; frame += 1) {
          nativeFaceGazeCues.push(Object.freeze({
            activitySlot,
            frame,
            actorTag: actor,
            mode: 2,
            durationNativeTicks,
            target: Object.freeze({
              kind: "actor-component",
              actorTag: targetActor,
              selector: 5,
              associated: true,
              offset: Object.freeze([0, 0, 0]),
            }),
            callFileOffset: operation.callFileOffset,
          }));
        }
      }
    }
  }
  nativeHandPoseCues.sort((left, right) => left.frame - right.frame);
  nativeFaceClipCues.sort((left, right) => left.frame - right.frame);
  nativeFaceControllerCues.sort((left, right) => left.frame - right.frame);
  nativeFaceGazeCues.sort((left, right) => left.frame - right.frame);
  return Object.freeze({
    nativeHandPoseTables: Object.freeze(nativeHandPoseTables),
    nativeHandPoseCues: Object.freeze(nativeHandPoseCues),
    nativeBodyHandPoseCues: Object.freeze(nativeBodyHandPoseCues),
    nativeHandComponentCues: Object.freeze(nativeHandComponentCues),
    nativeHandComponentLimitations: Object.freeze(nativeHandComponentLimitations),
    nativeDetailedHandDefaults: Object.freeze(nativeDetailedHandDefaults),
    nativeFaceClipCues: Object.freeze(nativeFaceClipCues),
    nativeFaceControllerCues: Object.freeze(nativeFaceControllerCues),
    nativeFaceGazeCues: Object.freeze(nativeFaceGazeCues),
    unresolved: Object.freeze(unresolved),
  });
}
