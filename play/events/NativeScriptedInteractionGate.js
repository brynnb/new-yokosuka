const FULL_TURN_RAW = 0x10000;
const FULL_TURN_RADIANS = Math.PI * 2;

function stopped(reason) {
  return { resolved: false, matched: false, reason };
}

function noMatch(reason) {
  return { resolved: true, matched: false, reason };
}

function browserPosition(value) {
  const x = Number(value?.x ?? value?.[0]);
  const y = Number(value?.y ?? value?.[1]);
  const z = Number(value?.z ?? value?.[2]);
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
}

export function browserYawToNativeRaw(yaw) {
  const value = Number(yaw);
  if (!Number.isFinite(value)) return null;
  const turns = -value / FULL_TURN_RADIANS;
  const raw = Math.trunc(turns * FULL_TURN_RAW);
  return ((raw % FULL_TURN_RAW) + FULL_TURN_RAW) % FULL_TURN_RAW;
}

export function nativeCircularAngleDifference(left, right) {
  const direct = Math.abs((left & 0xffff) - (right & 0xffff));
  return Math.min(direct, FULL_TURN_RAW - direct);
}

export function evaluateNativeScriptedInteractionGate(
  activation,
  context = {},
) {
  if (!activation || typeof activation !== "object") {
    return stopped("scripted-gate-definition-missing");
  }
  if (activation.kind === "tagged-object-action") {
    const expectedTag = String(activation.objectTag || "").toUpperCase();
    const selectedTag = String(context.selectedObjectTag || "").toUpperCase();
    if (
      !/^[A-Z0-9_]{4}$/.test(expectedTag)
      || !Number.isInteger(activation.action)
    ) {
      return stopped("scripted-gate-object-action-definition-invalid");
    }
    if (!selectedTag || !Number.isInteger(context.selectedObjectAction)) {
      return stopped("scripted-gate-object-action-context-missing");
    }
    if (
      selectedTag !== expectedTag
      || context.selectedObjectAction !== activation.action
    ) {
      return noMatch("scripted-gate-object-action");
    }
    return {
      resolved: true,
      matched: true,
      reason: null,
      objectTag: expectedTag,
      action: activation.action,
    };
  }
  const {
    dialogueState,
    gameDate,
    playerPosition,
    playerYaw,
  } = context;
  const flag = activation.persistentFlag;
  if (!dialogueState || typeof dialogueState.read !== "function") {
    return stopped("scripted-gate-dialogue-state-missing");
  }
  const flagValue = dialogueState.read(flag.bank, flag.index);
  if (flagValue !== flag.requiredValue) {
    return noMatch("scripted-gate-persistent-flag");
  }

  if (!(gameDate instanceof Date) || !Number.isFinite(gameDate.getTime())) {
    return stopped("scripted-gate-game-date-missing");
  }
  const hour = gameDate.getUTCHours();
  const hourRange = activation.hourRange;
  if (
    hour < hourRange.minimumInclusive
    || hour > hourRange.maximumInclusive
  ) {
    return noMatch("scripted-gate-hour");
  }

  const position = browserPosition(playerPosition);
  const facingRaw = browserYawToNativeRaw(playerYaw);
  if (!position || facingRaw === null) {
    return stopped("scripted-gate-player-transform-missing");
  }
  const record = activation.nativeSpatialRecord;
  if (
    !Array.isArray(record?.position)
    || record.position.length !== 3
    || record.position.some(value => !Number.isFinite(value))
  ) {
    return stopped("scripted-gate-spatial-record-invalid");
  }
  const nativePosition = [
    Math.fround(-position[0]),
    Math.fround(position[1]),
    Math.fround(position[2]),
  ];
  const verticalDelta = Math.fround(
    record.position[1] - nativePosition[1],
  );
  if (!(Math.abs(verticalDelta) < record.verticalHalfExtent)) {
    return noMatch("scripted-gate-vertical-bounds");
  }

  const radians = facingRaw * FULL_TURN_RADIANS / FULL_TURN_RAW;
  const sine = Math.fround(Math.sin(radians));
  const cosine = Math.fround(Math.cos(radians));
  const deltaX = Math.fround(record.position[0] - nativePosition[0]);
  const deltaZ = Math.fround(record.position[2] - nativePosition[2]);
  const lateral = Math.fround(
    Math.fround(deltaX * cosine) - Math.fround(deltaZ * sine),
  );
  const longitudinal = Math.fround(
    Math.fround(deltaZ * cosine) + Math.fround(deltaX * sine),
  );
  if (!(Math.abs(lateral) < record.lateralHalfWidth)) {
    return noMatch("scripted-gate-lateral-bounds");
  }
  if (!(Math.abs(longitudinal) < record.longitudinalHalfExtent)) {
    return noMatch("scripted-gate-longitudinal-bounds");
  }

  const facingDifference = nativeCircularAngleDifference(
    facingRaw,
    record.requiredFacingRaw,
  );
  if (!(facingDifference < record.facingToleranceRaw)) {
    return noMatch("scripted-gate-facing");
  }
  return {
    resolved: true,
    matched: true,
    reason: null,
    nativePosition,
    facingRaw,
    localPosition: { lateral, longitudinal, verticalDelta },
    facingDifference,
  };
}
