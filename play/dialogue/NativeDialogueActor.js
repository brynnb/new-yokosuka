import {
  NATIVE_DIALOGUE_ACTOR_RUNTIME,
} from "../data/dialogue/nativeActorRuntime.generated.js";

export function nativeDialogueActorDescriptor(actorCode) {
  const key = String(actorCode || "").toUpperCase();
  return NATIVE_DIALOGUE_ACTOR_RUNTIME.resources[key] ?? null;
}

export function resolveNativeDialogueActorProgressIndex(
  actorCode,
  allocator,
) {
  const descriptor = nativeDialogueActorDescriptor(actorCode);
  if (!descriptor) return null;
  if (Number.isInteger(descriptor.fixedProgressIndex)) {
    return descriptor.fixedProgressIndex;
  }
  if (!allocator?.resolve) {
    throw new Error(
      `${descriptor.actorCode} requires the native dynamic progress pool`,
    );
  }
  return allocator.resolve(descriptor.authoredPersonIdentity);
}

export const NATIVE_DIALOGUE_ACTOR_RESOURCE_COUNT =
  NATIVE_DIALOGUE_ACTOR_RUNTIME.resourceCount;
export const NATIVE_DIALOGUE_FIXED_ACTOR_PROGRESS_BINDING_COUNT =
  NATIVE_DIALOGUE_ACTOR_RUNTIME.fixedProgressBindingCount;
export const NATIVE_DIALOGUE_DYNAMIC_ACTOR_PROGRESS_BINDING_COUNT =
  NATIVE_DIALOGUE_ACTOR_RUNTIME.dynamicProgressBindingCount;
