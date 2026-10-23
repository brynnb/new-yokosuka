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

/**
 * Complete package presentation from proven body/FACE pairs. Actor names alone
 * are not sufficient: Fuku-san, Shenhua, Nozomi and young Ryo have multiple
 * body variants. Explicit scene bindings/aliases retain ownership; unknown
 * bodies stay unbound and are reported by the presentation audit.
 */
export function bindNativeCutsceneFacialAssets(definition, catalog, assetUrl) {
  const presentation = definition.presentation || {};
  const faces = { ...presentation.facialAssets };
  const assets = { ...definition.assets };
  const candidates = [
    ...Object.values(catalog.facialAssets || {}),
    ...Object.values(catalog.facialVariants || {}),
  ];
  // AKIR is the shared scene player's Ryo body. Package-owned and explicitly
  // declared actor models below take precedence, including flashback variants.
  const models = new Map(definition.actors?.requirePlayer === false ? []
    : [["AKIR", catalog.facialAssets?.AKIR?.bodyModelCode]]);
  for (const actor of definition.actorDefinitions || []) models.set(actor.actorCode, actor.modelCode);
  for (const [tag, actor] of Object.entries(definition.environment?.packageActors || {})) {
    models.set(tag, actor.modelCode);
  }
  for (const tag of definition.actorTags || []) {
    if (faces[tag] || presentation.facialActorAliases?.[tag]) continue;
    const model = models.get(tag);
    if (!model) continue;
    const matches = candidates.filter(face => face.bodyModelCode === model);
    const exact = matches.filter(face => face.actorTag === tag);
    const choices = exact.length ? exact : matches;
    if (choices.length > 1) throw new Error(`${definition.id}: ambiguous FACE for ${tag}/${model}`);
    const face = choices[0];
    if (!face) continue;
    faces[tag] = face.actorTag === tag ? face : Object.freeze({ ...face, actorTag: tag });
    // The pose record retains its source actor identity when the same exact
    // body is used under another AUTH tag. Do not invent another TALK record.
    for (const record of [face.model, face.table, face.poses]) {
      if (!record?.path) throw new Error(`${definition.id}: incomplete FACE assets for ${tag}`);
      assets[record.path] = assetUrl(record.path);
    }
  }
  return Object.freeze({
    ...definition,
    assets: Object.freeze(assets),
    presentation: Object.freeze({ ...presentation, facialAssets: Object.freeze(faces) }),
  });
}
