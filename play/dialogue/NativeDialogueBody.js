import {
  nativeDialogueSelectorResource,
  parseNativeDialogueExpression,
  signExtendNativeDialogue,
} from "./NativeDialogueSelector.js";
import {
  evaluateNativeDialoguePredicate,
} from "./NativeDialoguePredicate.js";

function hex(value) {
  return `0x${value.toString(16)}`;
}

function unresolved(state, reasons) {
  return {
    status: "unresolved",
    state,
    reasons: [...new Set(reasons.filter(Boolean))],
  };
}

function branchOperand(bytes, cursor, bits = 12) {
  if (bits === 12) {
    return ((bytes[cursor] & 0x0f) << 8) | bytes[cursor + 1];
  }
  return (
    ((bytes[cursor] & 0x0f) << 16)
    | (bytes[cursor + 1] << 8)
    | bytes[cursor + 2]
  );
}

function signedByte(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function signedWord(value) {
  return value & 0x8000 ? value - 0x10000 : value;
}

function writeNativeRuntimeField(state, selector, rawValue, context) {
  const manager = { ...(state.runtimeFields?.manager || {}) };
  const person = { ...(state.runtimeFields?.person || {}) };
  let write = null;
  if (selector === 1 || selector === 2) {
    const offset = selector === 1 ? 0x10 : 0x11;
    manager[offset] = rawValue;
    write = { scope: "manager", offset, value: rawValue, rawValue };
  } else if (selector >= 3 && selector <= 6) {
    const offset = 0x08 + selector;
    person[offset] = rawValue;
    write = { scope: "person", offset, value: rawValue, rawValue };
  } else if (selector === 7) {
    person[0x10] = signedByte(rawValue);
    write = {
      scope: "person",
      offset: 0x10,
      value: signedByte(rawValue),
      rawValue,
    };
  }
  state.runtimeFields = { manager, person };
  if (write) context.writeNativeDialogueRuntimeField?.(write);
  return write;
}

function randomBlockStarts(bytes, cursor) {
  if (cursor + 1 >= bytes.length) {
    throw new Error(`truncated random block at ${hex(cursor)}`);
  }
  const count = bytes[cursor + 1];
  let block = cursor + 2;
  const starts = [];
  for (let index = 0; index < count; index += 1) {
    if (block + 1 >= bytes.length) {
      throw new Error(`truncated random choice at ${hex(block)}`);
    }
    starts.push(block);
    const length = ((bytes[block] & 0x0f) << 8) | bytes[block + 1];
    block += 2 + length;
    if (block > bytes.length) {
      throw new Error(`random choice exceeds stream at ${hex(cursor)}`);
    }
  }
  return { count, starts, end: block };
}

function chooseRandomBlock(source, cursor, state, context) {
  let blocks;
  try {
    blocks = randomBlockStarts(source.bytes, cursor);
  } catch (error) {
    return { error: `body:random:${error.message}` };
  }
  if (blocks.count === 0) return { error: `body:random:empty:${hex(cursor)}` };
  let index = 0;
  if (blocks.count > 1) {
    index = context.chooseNativeDialogueRandomBlock?.({
      actorCode: source.key,
      recordOffset: source.resource.recordRoutingOffset + cursor,
      count: blocks.count,
    });
    if (!Number.isInteger(index) || index < 0 || index >= blocks.count) {
      return {
        error: (
          `body:randomChoice:${source.resource.recordRoutingOffset + cursor}`
        ),
      };
    }
  }
  return { cursor: blocks.starts[index], randomChoiceIndex: index };
}

function runNestedMessageGroup(source, state, context) {
  const { bytes, resource } = source;
  let cursor = state.cursor;
  let lastExpression = state.lastExpression;
  const messageIndexes = [];
  const presentationTokens = [];
  let pendingMessageFlags = 0;
  const visited = new Set();

  while (cursor >= 0 && cursor < bytes.length) {
    const key = `${cursor}:${lastExpression?.resolved
      ? lastExpression.value
      : lastExpression?.reasons?.join(",") || "initial"}`;
    if (visited.has(key)) {
      return unresolved(state, [`messageGroup:cycle:${hex(cursor)}`]);
    }
    visited.add(key);

    const opcode = bytes[cursor];
    const opcodeClass = opcode & 0xf0;
    if ([0x00, 0x20, 0x30, 0x60, 0x70, 0x90, 0xc0].includes(opcodeClass)) {
      if (cursor + 1 >= bytes.length) {
        return unresolved(state, [`messageGroup:truncated:${hex(cursor)}`]);
      }
      const encoded = ((opcode & 0x0f) << 8) | bytes[cursor + 1];
      const recordOffset = resource.recordRoutingOffset + cursor;
      if (opcodeClass === 0x20) {
        messageIndexes.push(encoded);
        presentationTokens.push({
          kind: "message",
          messageIndex: encoded,
          nativeFlags: pendingMessageFlags,
          opcode,
          recordOffset,
        });
        pendingMessageFlags = 0;
      } else if (opcodeClass === 0x30) {
        presentationTokens.push({
          kind: "nativeCommand",
          commandWord: encoded,
          nativeTickAdvance: 1,
          opcode,
          recordOffset,
        });
        if (
          (encoded >= 0x14 && encoded <= 0x1d)
          || (encoded >= 0x78 && encoded <= 0x81)
        ) {
          pendingMessageFlags |= 2;
        }
      } else if (opcodeClass === 0x60) {
        presentationTokens.push({
          kind: "nativeCommand",
          commandWord: encoded,
          nativeTickAdvance: 0,
          opcode,
          recordOffset,
        });
      } else if (opcodeClass === 0x90) {
        presentationTokens.push({
          kind: "progressMarker",
          encodedOperand: encoded,
          opcode,
          recordOffset,
        });
      } else if (opcodeClass === 0xc0) {
        const write = writeNativeRuntimeField(
          state,
          opcode & 0x0f,
          bytes[cursor + 1],
          context,
        );
        presentationTokens.push({
          kind: "runtimeWrite",
          selector: opcode & 0x0f,
          rawValue: bytes[cursor + 1],
          write,
          opcode,
          recordOffset,
        });
      }
      cursor += 2;
      continue;
    }
    if (opcodeClass === 0x40) {
      if (!lastExpression?.resolved) {
        return unresolved(state, lastExpression?.reasons || [
          `messageGroup:lastExpression:${hex(cursor)}`,
        ]);
      }
      const encoded = branchOperand(bytes, cursor);
      cursor += 2;
      if (lastExpression.value === 0) {
        cursor += signExtendNativeDialogue(encoded, 12);
      }
      continue;
    }
    if (opcodeClass === 0x50) {
      const encoded = branchOperand(bytes, cursor);
      cursor += 2 + signExtendNativeDialogue(encoded, 12);
      continue;
    }
    if ([0x80, 0xa0, 0xb0].includes(opcodeClass)) {
      return {
        status: "messageGroup",
        actorCode: source.key,
        messageIndexes,
        presentationTokens,
        startOffset: resource.recordRoutingOffset + state.cursor,
        returnOffset: resource.recordRoutingOffset + cursor,
        state: { ...state, cursor, lastExpression },
      };
    }
    if (opcodeClass === 0xd0) {
      if (cursor + 2 >= bytes.length) {
        return unresolved(state, [
          `messageGroup:truncatedBranch:${hex(cursor)}`,
        ]);
      }
      const encoded = branchOperand(bytes, cursor, 20);
      cursor += 3 + signExtendNativeDialogue(encoded, 20);
      continue;
    }
    if (opcodeClass === 0xe0) {
      if (opcode !== 0xe0) {
        return {
          status: "messageGroup",
          actorCode: source.key,
          messageIndexes,
          presentationTokens,
          startOffset: resource.recordRoutingOffset + state.cursor,
          returnOffset: resource.recordRoutingOffset + cursor,
          state: { ...state, cursor, lastExpression },
        };
      }
      const choice = chooseRandomBlock(source, cursor, state, context);
      if (choice.error) return unresolved(state, [choice.error]);
      cursor = choice.cursor;
      continue;
    }
    if (opcode === 0xf0) {
      try {
        const parsed = parseNativeDialogueExpression(bytes, cursor + 1);
        cursor = parsed.cursor;
        lastExpression = evaluateNativeDialoguePredicate(
          parsed.predicate,
          context,
        );
      } catch (error) {
        return unresolved(state, [
          `messageGroup:expression:${error.message}`,
        ]);
      }
      continue;
    }
    if (opcode === 0xfc) {
      presentationTokens.push({
        kind: "nativeCommand",
        commandWord: 0xfc00,
        nativeTickAdvance: 0,
        opcode,
        recordOffset: resource.recordRoutingOffset + cursor,
      });
      cursor += 1;
      continue;
    }
    if ([0xf6, 0xf7, 0xf8].includes(opcode)) {
      pendingMessageFlags |= 4;
      cursor += 1;
      continue;
    }
    if ([0xf1, 0xfd].includes(opcode)) {
      cursor += 1;
      continue;
    }
    return {
      status: "messageGroup",
      actorCode: source.key,
      messageIndexes,
      presentationTokens,
      startOffset: resource.recordRoutingOffset + state.cursor,
      returnOffset: resource.recordRoutingOffset + cursor,
      state: { ...state, cursor, lastExpression },
      boundary: opcode === 0xf9 ? "dynamicContinuation" : "outerControl",
    };
  }
  return unresolved(state, [`messageGroup:outOfBounds:${hex(cursor)}`]);
}

export function createNativeDialogueBodyState(selection) {
  if (selection?.status !== "selected") {
    throw new TypeError("a selected native dialogue entry is required");
  }
  const source = nativeDialogueSelectorResource(selection.actorCode);
  if (!source) throw new Error(`missing actor resource ${selection.actorCode}`);
  const cursor = selection.bodyOffset - source.resource.recordRoutingOffset;
  if (cursor < 0 || cursor >= source.bytes.length) {
    throw new Error(`body offset ${hex(selection.bodyOffset)} is unavailable`);
  }
  return {
    actorCode: source.key,
    cursor,
    continuation60: null,
    continuation64: null,
    lastExpression: null,
    runtimeFields: {
      manager: {},
      person: {},
    },
  };
}

export function stepNativeDialogueBody(inputState, context = {}) {
  let state = { ...inputState };
  const source = nativeDialogueSelectorResource(state.actorCode);
  if (!source) {
    return unresolved(state, [`body:resource:${state.actorCode}`]);
  }
  const { bytes, resource } = source;
  const visited = new Set();

  while (state.cursor >= 0 && state.cursor < bytes.length) {
    const cursor = state.cursor;
    const visitKey = `${cursor}:${state.continuation60 ?? "none"}:${
      state.lastExpression?.resolved
        ? state.lastExpression.value
        : state.lastExpression?.reasons?.join(",") || "initial"
    }`;
    if (visited.has(visitKey)) {
      return unresolved(state, [`body:cycle:${hex(cursor)}`]);
    }
    visited.add(visitKey);

    const opcode = bytes[cursor];
    if (opcode < 0x80) {
      if (cursor + 1 >= bytes.length) {
        return unresolved(state, [`body:truncated:${hex(cursor)}`]);
      }
      const encoded = branchOperand(bytes, cursor);
      const opcodeClass = opcode & 0x70;
      const following = cursor + 2;
      if (opcodeClass === 0x00) {
        state.cursor = following;
        continue;
      }
      if (opcodeClass === 0x10) {
        const redirect = context.readNativeDialogueProgressRedirect?.({
          actorCode: source.key,
          recordOffset: resource.recordRoutingOffset + cursor,
          followingOffset: resource.recordRoutingOffset + following,
          hasSavedContinuation: state.continuation60 !== null,
          encodedOperand: encoded,
        });
        if (redirect === false) {
          state.cursor = following;
          continue;
        }
        if (Number.isInteger(redirect)) {
          state.cursor = redirect - resource.recordRoutingOffset;
          continue;
        }
        if (Number.isInteger(redirect?.offset)) {
          state.cursor = redirect.offset - resource.recordRoutingOffset;
          if (redirect.yieldState5) {
            state.runtimeFields = {
              manager: { ...(state.runtimeFields?.manager || {}) },
              person: {
                ...(state.runtimeFields?.person || {}),
                0x09: 5,
              },
            };
            return {
              status: "event",
              actorCode: source.key,
              event: {
                kind: "state5",
                reason: "progressRedirect",
                recordOffset: resource.recordRoutingOffset + cursor,
              },
              state,
            };
          }
          continue;
        }
        return unresolved(state, [
          `body:progressRedirect:${resource.recordRoutingOffset + cursor}`,
        ]);
      }
      if (opcodeClass === 0x20) {
        return runNestedMessageGroup(source, state, context);
      }
      if (opcodeClass === 0x30) {
        state.cursor = following;
        if (encoded === 0x10) continue;
        return {
          status: "event",
          actorCode: source.key,
          event: {
            kind: "invokeAndYield",
            opcode,
            encodedOperand: encoded,
            recordOffset: resource.recordRoutingOffset + cursor,
          },
          state,
        };
      }
      if (opcodeClass === 0x40) {
        if (!state.lastExpression?.resolved) {
          return unresolved(state, state.lastExpression?.reasons || [
            `body:lastExpression:${hex(cursor)}`,
          ]);
        }
        state.cursor = (
          state.lastExpression.value === 0
            ? following + signExtendNativeDialogue(encoded, 12)
            : following
        );
        continue;
      }
      if (opcodeClass === 0x50) {
        state.cursor = following + signExtendNativeDialogue(encoded, 12);
        continue;
      }
      if (opcodeClass === 0x60 || opcodeClass === 0x70) {
        const value = opcodeClass === 0x60 ? 1 : 0;
        const wrote = context.writeStateBank?.(2, encoded, value);
        if (wrote !== true) {
          return unresolved(state, [
            `body:stateBank2Write:${encoded}:${value}`,
          ]);
        }
        state.cursor = following;
        continue;
      }
      return unresolved(state, [`body:unknownLowClass:${hex(cursor)}`]);
    }

    if (opcode < 0xe0) {
      const opcodeClass = opcode & 0xf0;
      if (opcodeClass === 0x80) {
        if (cursor + 1 >= bytes.length) {
          return unresolved(state, [`body:truncated80:${hex(cursor)}`]);
        }
        const encoded = branchOperand(bytes, cursor);
        const saved = cursor + 2;
        state = {
          ...state,
          cursor: saved + signExtendNativeDialogue(encoded, 12),
          continuation60: saved,
        };
        continue;
      }
      if (opcodeClass === 0x90) {
        const wrote = context.recordNativeDialogueProgressOffset?.({
          actorCode: source.key,
          recordOffset: resource.recordRoutingOffset + cursor,
          followingOffset: resource.recordRoutingOffset + cursor + 2,
        });
        if (wrote !== true) {
          return unresolved(state, [
            `body:progressWrite:${resource.recordRoutingOffset + cursor}`,
          ]);
        }
        state.continuation64 = null;
        state.cursor = cursor + 2;
        continue;
      }
      if (opcodeClass === 0xc0) {
        if (cursor + 1 >= bytes.length) {
          return unresolved(state, [`body:truncatedC0:${hex(cursor)}`]);
        }
        writeNativeRuntimeField(
          state,
          opcode & 0x0f,
          bytes[cursor + 1],
          context,
        );
        state.cursor = cursor + 2;
        continue;
      }
      if (opcodeClass === 0xa0 || opcodeClass === 0xb0) {
        state.cursor = cursor + 1;
        continue;
      }
      if (opcodeClass === 0xd0) {
        if (cursor + 2 >= bytes.length) {
          return unresolved(state, [`body:truncatedD0:${hex(cursor)}`]);
        }
        const encoded = branchOperand(bytes, cursor, 20);
        state.cursor = cursor + 3 + signExtendNativeDialogue(encoded, 20);
        continue;
      }
    }

    if (opcode < 0xf0) {
      if (opcode === 0xe0) {
        const choice = chooseRandomBlock(source, cursor, state, context);
        if (choice.error) return unresolved(state, [choice.error]);
        state.cursor = choice.cursor;
        continue;
      }
      let following;
      if (opcode === 0xe1) {
        following = cursor + 11;
        if (following > bytes.length) {
          return unresolved(state, [`body:truncatedE1:${hex(cursor)}`]);
        }
      }
      else if (opcode === 0xe2 || opcode === 0xe3) following = cursor + 2;
      else {
        if (cursor + 1 >= bytes.length) {
          return unresolved(state, [`body:truncatedEvent:${hex(cursor)}`]);
        }
        following = cursor + 2 + bytes[cursor + 1];
      }
      state.cursor = following;
      // The verified native E-class handler only marks E1, E2, and E4 as
      // externally pending. E3 and E5-EF consume bytes and stay in the
      // interpreter's dispatch loop.
      if (opcode === 0xe3 || opcode >= 0xe5) {
        continue;
      }
      return {
        status: "event",
        actorCode: source.key,
        event: {
          kind: "nativeEvent",
          opcode,
          recordOffset: resource.recordRoutingOffset + cursor,
          byteLength: following - cursor,
          bytes: bytes.subarray(cursor, following),
          ...(opcode === 0xe1 ? {
            payloadByte: bytes[cursor + 2],
            nativeArguments: [3, 5, 7, 9].map((offset) => (
              signedWord(
                (bytes[cursor + offset] << 8)
                | bytes[cursor + offset + 1],
              )
            )),
          } : {}),
        },
        state,
      };
    }

    if (opcode === 0xf0) {
      try {
        const parsed = parseNativeDialogueExpression(bytes, cursor + 1);
        state.cursor = parsed.cursor;
        state.lastExpression = evaluateNativeDialoguePredicate(
          parsed.predicate,
          context,
        );
      } catch (error) {
        return unresolved(state, [`body:expression:${error.message}`]);
      }
      continue;
    }
    if ([0xf1, 0xf4, 0xfa, 0xfb, 0xfd, 0xfe].includes(opcode)) {
      state.cursor = cursor + 1;
      continue;
    }
    if (opcode === 0xf2) {
      state.cursor = cursor + 4;
      return {
        status: "event",
        actorCode: source.key,
        event: {
          kind: "state5",
          opcode,
          recordOffset: resource.recordRoutingOffset + cursor,
          byteLength: 4,
          bytes: bytes.subarray(cursor, cursor + 4),
        },
        state,
      };
    }
    if (opcode === 0xf5) {
      if (cursor + 3 >= bytes.length) {
        return unresolved(state, [`body:truncatedF5:${hex(cursor)}`]);
      }
      const encoded = (
        (bytes[cursor + 1] << 16)
        | (bytes[cursor + 2] << 8)
        | bytes[cursor + 3]
      );
      state.continuation64 = (
        cursor + 4 + signExtendNativeDialogue(encoded, 24)
      );
      state.cursor = cursor + 4;
      continue;
    }
    if (opcode === 0xf9) {
      if (state.continuation60 !== null) {
        state.cursor = state.continuation60;
        state.continuation60 = null;
        continue;
      }
      const continuation5c = context.readNativeDialogueContinuation5c?.({
        actorCode: source.key,
        recordOffset: resource.recordRoutingOffset + cursor,
      });
      if (Number.isInteger(continuation5c)) {
        state.cursor = continuation5c - resource.recordRoutingOffset;
        continue;
      }
      return unresolved(state, [
        `body:continuation5c:${resource.recordRoutingOffset + cursor}`,
      ]);
    }
    if (opcode === 0xfc) {
      state.cursor = cursor + 1;
      return {
        status: "event",
        actorCode: source.key,
        event: {
          kind: "state6",
          opcode,
          recordOffset: resource.recordRoutingOffset + cursor,
        },
        state,
      };
    }
    if ([0xf3, 0xf6, 0xf7, 0xf8, 0xff].includes(opcode)) {
      return {
        status: "complete",
        actorCode: source.key,
        lifecycleOpcode: opcode,
        recordOffset: resource.recordRoutingOffset + cursor,
        state,
      };
    }
    return unresolved(state, [`body:unknownControl:${hex(cursor)}`]);
  }
  return unresolved(state, [`body:outOfBounds:${hex(state.cursor)}`]);
}

async function loadNativeDialogueMessageResource(actorCode) {
  const key = String(actorCode || "").toUpperCase();
  let loaded;
  try {
    loaded = await import(
      `../data/dialogue/messages/${key}.generated.js`
    );
  } catch {
    return null;
  }
  const resource = loaded.NATIVE_DIALOGUE_MESSAGE_RESOURCE;
  if (!resource || resource.actorCode !== key) return null;
  return resource;
}

function loadedMessageResult(resource, messages) {
  return {
    actorCode: resource.actorCode,
    actorLabel: resource.actorLabel,
    authoredPersonIdentity: resource.authoredPersonIdentity,
    participantFourccs: resource.participantFourccs,
    messages,
  };
}

export async function loadNativeDialogueMessages(actorCode, indexes) {
  const key = String(actorCode || "").toUpperCase();
  const resource = await loadNativeDialogueMessageResource(key);
  if (!resource) return null;
  const messages = [];
  for (const index of indexes) {
    const message = resource.messages[index];
    if (!message || message.index !== index) {
      throw new Error(`${key} message index ${index} is unavailable`);
    }
    messages.push(message);
  }
  return loadedMessageResult(resource, messages);
}

export async function loadNativeDialogueMessagesByVoiceId(
  actorCode,
  voiceIds,
) {
  const key = String(actorCode || "").toUpperCase();
  const resource = await loadNativeDialogueMessageResource(key);
  if (!resource) return null;
  const byVoiceId = new Map();
  for (const message of resource.messages) {
    if (
      typeof message?.voiceId !== "string"
      || byVoiceId.has(message.voiceId)
    ) {
      continue;
    }
    byVoiceId.set(message.voiceId, message);
  }
  const messages = [];
  for (const voiceId of voiceIds) {
    const message = byVoiceId.get(voiceId);
    if (!message) {
      throw new Error(`${key} voice ${voiceId} is unavailable`);
    }
    messages.push(message);
  }
  return loadedMessageResult(resource, messages);
}
