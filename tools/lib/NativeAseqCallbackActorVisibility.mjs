import { isSynchronousHelper, nativeAseqCallbackFrame } from "./NativeAseqScriptOwnership.mjs";

// The room compiler emits two guarded alternatives for operation 0x001f and
// then writes operation 0x00a8 at their join. Only the branch with literal
// -1 executes. It is unsafe to replay both writes in file-offset order.
function selectedRootWrite(bytes, fn, join, presentation) {
  const predecessors = block => fn.blocks.filter(candidate => candidate.successors.includes(block.id));
  const writes = predecessors(join).flatMap(jump => predecessors(jump))
    .flatMap(block => block.actions.filter(action => action.operationHex === "0x001f")
      .map(action => ({ block, action })));
  if (writes.length !== 2) throw Error("Unexpected native visibility branch at " + presentation.callFileOffset);
  const selected = writes.filter(({ block, action }) => {
    const parents = predecessors(block);
    const branch = parents[0];
    const at = Number(branch?.terminator?.fileOffset);
    if (parents.length !== 1 || branch.successors[0] !== block.id || branch.terminator.mnemonic !== "bf"
      || bytes.readUInt16LE(at - 2) !== 0x8800 || bytes.readUInt16LE(at - 4) !== 0x6043
      || ![0xe400, 0xe4ff].includes(bytes.readUInt16LE(at - 6))
      || action.arguments[0].ascii !== presentation.arguments[0].ascii) {
      throw Error("Unproven native actor visibility at " + action.callFileOffset);
    }
    return bytes.readUInt16LE(at - 6) === 0xe4ff;
  });
  const enabled = presentation.arguments[1].value;
  if (selected.length !== 1 || ![0, 1].includes(enabled)
    || selected[0].action.arguments[1].value !== (enabled ? 1 : 2)) {
    throw Error("Native root and associated presentation differ at " + presentation.callFileOffset);
  }
  return selected[0].action.callFileOffset;
}

export function extractNativeAseqActorVisibility({ bytes, callback, initializer, functions, actors }) {
  const byFrame = new Map();
  const add = (fn, block, action, frame) => {
    const rootCall = selectedRootWrite(bytes, fn, block, action);
    const actorTag = action.arguments[0].ascii;
    if (!actors.includes(actorTag)) {
      if (frame !== 0) throw Error("Timed visibility for absent actor " + actorTag);
      return;
    }
    if (!byFrame.has(frame)) byFrame.set(frame, []);
    byFrame.get(frame).push({
      kind: "actor-visibility",
      actorTag,
      enabled: action.arguments[1].value === 1,
      source: {
        callbackFunction: fn.id,
        rootCallFileOffset: rootCall,
        callFileOffset: action.callFileOffset,
      },
    });
  };
  const frameOf = action => nativeAseqCallbackFrame(bytes, Number(callback.id), callback, action, functions);
  let initialized = false;
  for (const block of callback.blocks) {
    for (const action of block.actions) {
      if (action.kind === "directCall" && action.targetFileOffset === initializer.id) {
        if (initialized || frameOf(action) !== 0 || !isSynchronousHelper(initializer, functions)) {
          throw Error("Unexpected native visibility initialization in " + callback.id);
        }
        initialized = true;
        for (const setupBlock of initializer.blocks) {
          for (const setup of setupBlock.actions.filter(a => a.operationHex === "0x00a8")) {
            add(initializer, setupBlock, setup, 0);
          }
        }
      }
      if (action.operationHex !== "0x00a8") continue;
      // In the confrontation AKIR's initial hide joins immediately before
      // the start of this slot; later changes have a governing counter test.
      const beforeStart = block.successors.length === 1 && callback.blocks
        .find(b => b.id === block.successors[0])?.actions[0];
      const frame = beforeStart?.operationId === 0x50 && beforeStart.arguments[0].kind === "frame-field"
        ? 0 : frameOf(action);
      add(callback, block, action, frame);
    }
  }
  if (!initialized) throw Error("Missing native visibility initialization in " + callback.id);
  return [...byFrame].sort(([a], [b]) => a - b).map(([frame, cues]) => ({ frame, cues }));
}
