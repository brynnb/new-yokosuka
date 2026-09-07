function actorTag(value, label) {
  const normalized = String(value || "").toUpperCase();
  if (!/^[A-Z0-9_]{4}$/.test(normalized)) {
    throw new TypeError(`${label} is invalid`);
  }
  return normalized;
}

/**
 * Resolve package-declared facial aliases without modifying the shared face
 * manifest. The alias keeps its authored actor identity while borrowing the
 * exact source actor's FACE/FTBL and TALK-pose record.
 */
export function resolveNativeCutsceneFacialAssets(
  definitions = {},
  aliases = {},
) {
  if (
    !definitions
    || Array.isArray(definitions)
    || !aliases
    || Array.isArray(aliases)
  ) throw new TypeError("cutscene facial assets and aliases must be objects");
  const resolved = { ...definitions };
  for (const [aliasValue, sourceValue] of Object.entries(aliases)) {
    const alias = actorTag(aliasValue, "cutscene FACE alias");
    const sourceActorTag = actorTag(sourceValue, `${alias} FACE source`);
    const source = resolved[sourceActorTag];
    if (!source || resolved[alias]) {
      throw new Error(`cutscene FACE alias ${alias} -> ${sourceActorTag} conflicts`);
    }
    resolved[alias] = Object.freeze({
      ...source,
      actorTag: alias,
      poses: Object.freeze({ ...source.poses, actorTag: sourceActorTag }),
    });
  }
  return Object.freeze(resolved);
}
