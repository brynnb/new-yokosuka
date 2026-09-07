import {
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA,
} from "../data/dialogue/nativeProgressIndices.generated.js";

function normalizedActorCode(value) {
  return typeof value === "string" && value.length === 4
    ? value.toUpperCase()
    : null;
}

export function nativeDialogueActorIdentityForRuntimeOperand(
  encodedIdentity,
  currentActorCode,
) {
  const index = Number(encodedIdentity);
  if (!Number.isInteger(index) || index < 0 || index > 0x0fff) {
    return null;
  }
  if (index === 0) return normalizedActorCode(currentActorCode);
  if (index >= NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.fixedIdentities.length) {
    return null;
  }
  return NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.fixedIdentities[index] ?? null;
}

export function readNativeDialogueActorRuntimeValue(
  encodedIdentity,
  currentActorCode,
  readActorQueryState,
) {
  const identity = nativeDialogueActorIdentityForRuntimeOperand(
    encodedIdentity,
    currentActorCode,
  );
  if (!identity || typeof readActorQueryState !== "function") return null;
  const value = readActorQueryState(identity);
  return Number.isInteger(value) ? value : null;
}

export function createNativeDialogueActorRuntimeValueReader({
  networkState,
  getWorldId = null,
} = {}) {
  return (encodedIdentity, currentActorCode) => (
    readNativeDialogueActorRuntimeValue(
      encodedIdentity,
      currentActorCode,
      (actorCode) => networkState?.actorQueryStateForActorCode?.(
        actorCode,
        getWorldId?.() ?? null,
      ),
    )
  );
}
