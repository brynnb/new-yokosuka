import {
  NATIVE_SCRIPTED_DIALOGUE_RESOURCES,
} from "../data/dialogue/nativeScriptedDialogue.generated.js";

function normalizedVoiceIds(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const voiceIds = values.map(value => String(value || "").toUpperCase());
  return voiceIds.every(value => /^[A-Z]{1,2}\d{4}[A-Z]\d{3}$/.test(value))
    ? voiceIds
    : null;
}

export function nativeScriptedDialogueResource(actorCode, voiceIds) {
  const actor = String(actorCode || "").toUpperCase();
  const requested = normalizedVoiceIds(voiceIds);
  if (!requested) return null;
  const matches = NATIVE_SCRIPTED_DIALOGUE_RESOURCES.filter(resource => (
    resource.actorCode === actor
    && resource.messages.length === requested.length
    && resource.messages.every((message, index) => (
      message.voiceId === requested[index]
    ))
  ));
  if (matches.length > 1) {
    throw new Error(
      `scripted dialogue ${actor}/${requested.join(",")} is ambiguous`,
    );
  }
  return matches[0] ?? null;
}

export function nativeScriptedDialogueMessages(resource) {
  if (!resource) return null;
  return resource.messages.map(message => ({
    ...message,
    nativeDurationSeconds: (
      message.decodedSampleCount / message.decodedSampleRate
    ),
  }));
}
