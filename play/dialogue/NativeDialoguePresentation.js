function participantIndex(localCode) {
  if (typeof localCode !== "string" || localCode.length === 0) return null;
  const index = localCode.charCodeAt(0) - 0x41;
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function nativeDialogueMessageParticipant(
  message,
  participantFourccs,
) {
  const index = participantIndex(message?.localCode);
  if (index === null || !Array.isArray(participantFourccs)) return null;
  return participantFourccs[index] ?? null;
}

export function nativeDialogueMessageDuration(message) {
  const nativeFloat = Number(message?.nativeFloat);
  if (!Number.isFinite(nativeFloat)) return null;
  if (nativeFloat !== 0) return nativeFloat + 0.5;
  const byteLength = Number(message?.sourceByteLength);
  if (!Number.isInteger(byteLength) || byteLength < 6) return null;
  const contentByteLength = byteLength - 6;
  let multiplier;
  if (byteLength <= 12) multiplier = 10;
  else if (byteLength <= 18) multiplier = 5;
  else if (byteLength <= 24) multiplier = 4;
  else multiplier = 3;
  return contentByteLength * multiplier / 30;
}

export function nativeDialoguePresentationMessage(
  message,
  participantFourccs,
) {
  const explicitDuration = Number(message?.nativeDurationSeconds);
  return {
    ...message,
    nativeParticipantCode: nativeDialogueMessageParticipant(
      message,
      participantFourccs,
    ),
    nativeDurationSeconds: Number.isFinite(explicitDuration)
      && explicitDuration >= 0
      ? explicitDuration
      : nativeDialogueMessageDuration(message),
  };
}

export function nativeDialogueCommandReceiver(commandWord) {
  if (!Number.isInteger(commandWord)) return null;
  if (commandWord === 0xfc00) {
    return {
      path: "inlineFc",
      queueAddress: null,
      handlers: [],
    };
  }
  if (commandWord === 0x10) {
    return {
      path: "inline10",
      queueAddress: null,
      handlers: [],
    };
  }
  if (commandWord < 0 || commandWord > 0xfff) return null;
  const handlers = [];
  if (commandWord >= 0x28 && commandWord <= 0x31) {
    handlers.push("0x0c161140");
  }
  if (commandWord >= 0x32 && commandWord <= 0x3b) {
    handlers.push("0x0c16175c");
  }
  if (commandWord >= 0x8c && commandWord <= 0x95) {
    handlers.push("table:0x0c2243a0");
  }
  if (
    (commandWord >= 0x14 && commandWord <= 0x1d)
    || (commandWord >= 0x78 && commandWord <= 0x81)
  ) {
    handlers.push("0x0c16188c");
  }
  const participantFacingTargetIndex = (
    commandWord >= 0x14 && commandWord <= 0x1d
      ? commandWord - 0x14
      : commandWord >= 0x78 && commandWord <= 0x81
        ? commandWord - 0x78
        : null
  );
  const participantTableIndex = (
    commandWord >= 0x32 && commandWord <= 0x3b
      ? commandWord - 0x31
      : commandWord >= 0x8c && commandWord <= 0x95
        ? commandWord - 0x8b
        : null
  );
  if (commandWord === 0x0d) handlers.push("0x0c161e54");
  if (commandWord === 0x0a || commandWord === 0x0f) {
    handlers.push("0x0c161f22");
  }
  return {
    path: "queued",
    queueAddress: "0x0c222580",
    enqueueAddress: "0x0c153810",
    dequeueAddress: "0x0c1538a2",
    receiverAddress: "0x0c160efe",
    stateCode: commandWord === 0x14 ? 0x6c : 0x6d,
    participantFacingTargetIndex,
    participantTableIndex,
    handlers,
  };
}

export function nativeDialogueParticipantTableRoute(
  commandWord,
  participantFourccs,
) {
  const receiver = nativeDialogueCommandReceiver(commandWord);
  const index = receiver?.participantTableIndex;
  if (!Number.isInteger(index)) return null;
  const participantCode = Array.isArray(participantFourccs)
    ? participantFourccs[index] ?? null
    : null;
  return {
    index,
    participantCode,
    behavior: commandWord < 0x8c
      ? "participantControlDispatch"
      : "selectedParticipantWrite",
    handlerAddress: commandWord < 0x8c ? "0x0c16175c" : null,
    selectedParticipantAddress: commandWord >= 0x8c
      ? "0x0c2243a0"
      : null,
    motionPoint: commandWord < 0x8c
      ? {
          nativeOffset: [-0.001, 0, 0],
          nativeAxis: [0, 1, 0],
          requestAddress: "0x0c0fef0e",
        }
      : null,
  };
}

export function nativeDialogueParticipantFacingTarget(
  commandWord,
  actorDescriptor,
) {
  const receiver = nativeDialogueCommandReceiver(commandWord);
  const index = receiver?.participantFacingTargetIndex;
  if (!Number.isInteger(index)) return null;
  const vector = actorDescriptor?.participantFacingTargets?.[index];
  if (!Array.isArray(vector) || vector.length !== 3) return null;
  return {
    index,
    scenePosition: [...vector],
    controllerType: "FACE",
    appliesControlStateTransition: commandWord < 0x78,
    handlerAddress: "0x0c16188c",
  };
}

export function buildNativeDialoguePresentationProgram(
  presentationTokens,
  messages,
) {
  const commands = [];
  let messageCursor = 0;
  let nativeTimeSeconds = 0;
  for (const token of presentationTokens || []) {
    if (token.kind === "message") {
      const message = messages?.[messageCursor] ?? null;
      messageCursor += 1;
      commands.push({
        ...token,
        nativeTimeSeconds,
        message,
      });
      if (!Number.isFinite(message?.nativeDurationSeconds)) {
        nativeTimeSeconds = null;
      } else if (nativeTimeSeconds !== null) {
        nativeTimeSeconds += message.nativeDurationSeconds;
      }
      continue;
    }
    if (token.kind === "nativeCommand") {
      commands.push({
        ...token,
        nativeTimeSeconds,
        nativeReceiver: nativeDialogueCommandReceiver(token.commandWord),
      });
      if (nativeTimeSeconds !== null) {
        nativeTimeSeconds += token.nativeTickAdvance / 30;
      }
      continue;
    }
    commands.push({ ...token });
  }
  return {
    commands,
    nativeDurationSeconds: nativeTimeSeconds,
    messageCount: messageCursor,
  };
}
