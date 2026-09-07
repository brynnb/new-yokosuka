export const NATIVE_SCRIPTED_SCENE_CATALOG_SCHEMA = (
  "new-yokosuka-shenmue1-scripted-scene-catalog-v1"
);

function uniqueIndex(records, label) {
  const result = new Map();
  for (const record of records) {
    if (!record?.id || result.has(record.id)) {
      throw new Error(`Native scripted-scene catalog has invalid ${label} identity`);
    }
    result.set(record.id, record);
  }
  return result;
}

function mapKey(disc, area, mapinfoSha256) {
  return `${disc}:${area}:${mapinfoSha256}`;
}

/**
 * Index generated discovery metadata without promoting research candidates.
 * Production callers can only resolve entries from reviewedPrograms.
 */
export function createNativeScriptedSceneCatalog(catalog) {
  if (catalog?.schema !== NATIVE_SCRIPTED_SCENE_CATALOG_SCHEMA) {
    throw new Error("Unsupported native scripted-scene catalog schema");
  }
  const maps = uniqueIndex(catalog.maps || [], "map");
  const programs = uniqueIndex(catalog.reviewedPrograms || [], "program");
  const resources = uniqueIndex(catalog.authResources || [], "AUTH resource");
  const payloads = new Map();
  const entries = new Map();
  const mapsBySource = new Map();

  for (const payload of catalog.authPayloads || []) {
    if (!payload?.sha256 || payloads.has(payload.sha256)) {
      throw new Error("Native scripted-scene catalog has invalid AUTH payload identity");
    }
    payloads.set(payload.sha256, payload);
  }
  for (const sourceMap of maps.values()) {
    const key = mapKey(
      sourceMap.disc,
      sourceMap.area,
      sourceMap.mapinfoSha256,
    );
    if (mapsBySource.has(key)) {
      throw new Error("Native scripted-scene catalog has duplicate MAPINFO provenance");
    }
    mapsBySource.set(key, sourceMap);
    for (const entry of sourceMap.entryCandidates || []) {
      if (!entry?.id || entries.has(entry.id)) {
        throw new Error("Native scripted-scene catalog has invalid entry identity");
      }
      entries.set(entry.id, Object.freeze({ ...entry, mapId: sourceMap.id }));
    }
    for (const programId of sourceMap.reviewedProgramIds || []) {
      const program = programs.get(programId);
      if (
        !program
        || program.disc !== sourceMap.disc
        || program.area !== sourceMap.area
        || program.mapinfoSha256 !== sourceMap.mapinfoSha256
      ) {
        throw new Error(`Reviewed program ${programId} has inconsistent MAPINFO ownership`);
      }
    }
  }
  for (const resource of resources.values()) {
    if (!payloads.has(resource.payloadSha256)) {
      throw new Error(`AUTH resource ${resource.id} has no catalog payload`);
    }
  }

  const expected = catalog.summary || {};
  if (
    expected.mapinfoCount !== maps.size
    || expected.entryCandidateCount !== entries.size
    || expected.reviewedProgramCount !== programs.size
    || expected.logicalAuthResourceCount !== resources.size
    || expected.uniqueAuthPayloadCount !== payloads.size
  ) {
    throw new Error("Native scripted-scene catalog summary does not match its records");
  }

  return Object.freeze({
    summary: Object.freeze({ ...expected }),
    getMapById: id => maps.get(id) || null,
    getMapBySource: ({ disc, area, mapinfoSha256 }) => (
      mapsBySource.get(mapKey(disc, area, mapinfoSha256)) || null
    ),
    getEntryCandidate: id => entries.get(id) || null,
    getReviewedProgram: id => programs.get(id) || null,
    getAuthResource: id => resources.get(id) || null,
    getAuthPayload: payloadSha256 => payloads.get(payloadSha256) || null,
    listMaps: () => [...maps.values()],
    listEntryCandidates: ({
      mapId = null,
      availability = null,
      coverageState = null,
    } = {}) => [...entries.values()].filter(entry => (
      (mapId === null || entry.mapId === mapId)
      && (availability === null || entry.availability === availability)
      && (coverageState === null || entry.coverageState === coverageState)
    )),
    listReviewedPrograms: () => [...programs.values()],
  });
}
