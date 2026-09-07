export function scheduledActorModelCode(definition, descriptorState) {
  const overrideCode = descriptorState?.modelOverrideCode;
  return definition?.modelOverrides?.some(
    (override) => override.modelCode === overrideCode,
  )
    ? overrideCode
    : definition?.modelCode || null;
}
