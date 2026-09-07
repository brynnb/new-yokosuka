import itemNames from "./data/shenmue2-item-names.json" with { type: "json" };

// Area names are documented in docs/reference/external/shenmue2-map-ids.md. Keep the raw area
// code visible because it is still the stable key used by extracted assets.
const AREA_METADATA = Object.freeze({
  AK00: ["Fortune's Pier", "Aberdeen"],
  AK09: ["Fortune's Pier (alternate)", "Aberdeen"],
  AKA3: ["Unidentified Aberdeen scene", "Aberdeen"],
  AKS0: ["Fortune's Eatery", "Aberdeen"],
  AKS1: ["Blue Sky", "Aberdeen"],
  AKT0: ["Gambling Warehouse 0", "Aberdeen"],
  AKT1: ["Gambling Warehouse 1", "Aberdeen"],
  AKT2: ["Gambling Warehouse 2", "Aberdeen"],
  AKT3: ["Gambling Warehouse 3", "Aberdeen"],
  AKY0: ["Warehouse F", "Aberdeen"],
  AR01: ["Worker's Pier Intro / Free Stay Lodge", "Aberdeen"],
  AR02: ["Worker's Pier", "Aberdeen"],
  AR03: ["Queen's Street", "Aberdeen"],
  AR09: ["Queen's Street (alternate)", "Aberdeen"],
  ARA0: ["Bar Swing", "Aberdeen"],
  ARBT: ["Fortune's Pier battle variant", "Aberdeen"],
  ARC0: ["Pigeon Cafe", "Aberdeen"],
  ARM0: ["Hong Kong Souvenirs", "Aberdeen"],
  ARSF: ["Rooftop Fight", "Aberdeen"],
  ARZ0: ["General Store", "Aberdeen"],
  CWON: ["Worker's Pier event variant", "Aberdeen"],
  WB00: ["Scarlet Hills", "Wan Chai"],
  WB01: ["Man Mo Temple", "Wan Chai"],
  WE00: ["Golden Quarter", "Wan Chai"],
  WECF: ["Moon Cafe", "Wan Chai"],
  WEG0: ["Pine Game Arcade", "Wan Chai"],
  WEM1: ["S.I.C. Pool Hall / Slot House W", "Wan Chai"],
  WES1: ["Unidentified Wan Chai scene WES1", "Wan Chai"],
  WESM: ["Unidentified Wan Chai scene WESM", "Wan Chai"],
  WET0: ["Tomato Convenience Store", "Wan Chai"],
  WK00: ["South Carmain Quarter", "Wan Chai"],
  WK09: ["South Carmain Quarter (Lucky Hit)", "Wan Chai"],
  WKA0: ["Yan Tin Apartments", "Wan Chai"],
  WN00: ["Lucky Charm Quarter", "Wan Chai"],
  WR00: ["White Dynasty Quarter", "Wan Chai"],
  WRS2: ["Bar Liverpool", "Wan Chai"],
  WS00: ["Green Market Quarter", "Wan Chai"],
  WS09: ["Green Market Quarter (Lucky Hit)", "Wan Chai"],
  WSG1: ["Guang Martial Arts School", "Wan Chai"],
  WSY0: ["Come Over Guest House", "Wan Chai"],
  WT00: ["Wise Men's Quarter", "Wan Chai"],
  WTA0: ["Da Yuan Apartments", "Wan Chai"],
  AB00: ["Beverly Hills Wharf", "Aberdeen"],
  WBBK: ["Scarlet Hills (airing out books)", "Wan Chai"],
  Q100: ["Thousand White Quarter", "Kowloon"],
  Q200: ["Stand Quarter", "Kowloon"],
  Q300: ["Dimsum Quarter", "Kowloon"],
  QR00: ["Dragon Street", "Kowloon"],
  QA00: ["Three Birds Building", "Kowloon"],
  QA11: ["Three Birds Roof", "Kowloon"],
  QA22: ["Slot House K", "Kowloon"],
  QAW1: ["Dimsum Building", "Kowloon"],
  QAW6: ["Dancing Dragon Building", "Kowloon"],
  QB00: ["Great View Building", "Kowloon"],
  QBAA: ["Great View Herbs", "Kowloon"],
  QC00: ["Thousand White Building", "Kowloon"],
  QCAE: ["Thousand White Warehouse", "Kowloon"],
  QD00: ["Ghost Hall Building", "Kowloon"],
  QD01: ["God of Wealth Building", "Kowloon"],
  QDKJ: ["Five Stars Corp. — Yuanda Zhu's Room", "Kowloon"],
  QE00: ["Moon Child Building", "Kowloon"],
  QE03: ["Golden Flower Building", "Kowloon"],
  QE09: ["Black Heaven Building", "Kowloon"],
  QEDJ: ["Yuan's Room", "Kowloon"],
  QEH1: ["Moon Child Orphanage", "Kowloon"],
  QF00: ["Yellow Head Building", "Kowloon"],
  QF01: ["Yellow Head Building — Floors 1–2", "Kowloon"],
  QF02: ["Yellow Head Building — Floors 3–4", "Kowloon"],
  QF39: ["Yellow Head Building — Floor 40", "Kowloon"],
  QFRR: ["Yellow Head Building Rooftop", "Kowloon"],
  QGBT: ["Blue Dragon Garden", "Kowloon"],
  QJBT: ["Phoenix Building", "Kowloon"],
  QKBT: ["Big Ox Building — B5", "Kowloon"],
  QRC0: ["Huang's Room", "Kowloon"],
  QRR0: ["Ren's Hideout", "Kowloon"],
  QSFA: ["Former Barracks", "Kowloon"],
  QSFB: ["Small Dragon Garden", "Kowloon"],
  QSFC: ["Star Gazing Point", "Kowloon"],
  QSFD: ["Construction Base", "Kowloon"],
  QTB1: ["Former Factory Site", "Kowloon"],
  QTB2: ["Old Government Office Site", "Kowloon"],
  QTB3: ["Thunder House", "Kowloon"],
  QTB4: ["Fighting Place", "Kowloon"],
  KES1: ["Stone Pit", "Guilin"],
  KMZ1: ["Forest 1", "Guilin"],
  KMZ2: ["Forest 2", "Guilin"],
  KMZ3: ["Forest 3", "Guilin"],
  KMZ4: ["Forest 4", "Guilin"],
  KRF1: ["Kowloon — Disc 4 Intro", "Guilin"],
  KRH1: ["Langhuishan", "Guilin"],
  KSH1: ["Shenhua's House", "Guilin"],
  KWM1: ["Green Field", "Guilin"],
  KWW1: ["Path Through a Wood", "Guilin"],
  KWW4: ["Cloud Bird Trail", "Guilin"],
  // Additional names from Wulinshu Map IDs (SM2), revision 437. Unknown
  // copies identify the location, not the original purpose of the variant.
  Q109: ["Thousand White Quarter (alternate)", "Kowloon"],
  QC01: ["Thousand White Building (alternate QC01)", "Kowloon"],
  QC06: ["Thousand White Building (alternate QC06)", "Kowloon"],
  QE01: ["Moon Child Building (alternate)", "Kowloon"],
  QF06: ["Yellow Head Building (alternate)", "Kowloon"],
  QF40: ["Yellow Head Building — Floor 40 (alternate)", "Kowloon"],
  QLBT: ["Black Heaven Building (alternate)", "Kowloon"],
  QR09: ["Dragon Street (alternate)", "Kowloon"],
  QAXX: ["Handcuff QTE Jump Scene", "Kowloon"],
  // The source assigns both buildings to each ID; do not choose one.
  QAE1: ["Tea Break / Three Birds Building — Floor 1", "Kowloon"],
  QAE6: ["Tea Break / Three Birds Building — Floor 6", "Kowloon"],
});

const ITEM_NAMES = new Map();
for (const entry of itemNames.entries) {
  const names = ITEM_NAMES.get(entry.model) || new Set();
  names.add(entry.name);
  ITEM_NAMES.set(entry.model, names);
}

export function shenmue2ItemName(sourceMember) {
  const match = /^([A-Z0-9]+)\.(?:CHRM|MT7)$/i.exec(String(sourceMember || ""));
  if (!match) return null;
  const stem = match[1].toUpperCase();
  // The HD wiki lists resource IDs. Our Dreamcast corpus appends exactly
  // one G/I/T suffix to these IDs. This is an observed naming join, not
  // evidence of item behavior; never use arbitrary prefix matching.
  const names = ITEM_NAMES.get(stem)
    || (/^[A-Z0-9]{7}[GIT]$/.test(stem) ? ITEM_NAMES.get(stem.slice(0, -1)) : null);
  return names?.size === 1 ? [...names][0] : null;
}

const PRINCIPAL_AREAS = new Set([
  "AK00", "AR02", "AR03",
  "WB00", "WE00", "WK00", "WN00", "WR00", "WS00", "WT00",
  "AB00", "Q100", "Q200", "Q300", "QR00", "KRH1", "KSH1", "KES1",
]);

// Curated browsing categories, not a flag recovered from the game. These
// named streets, gardens, roofs and countryside routes use AREA_METADATA's
// source map IDs. Alternate/event copies remain in the disc folders.
const OUTDOOR_AREAS = new Set([
  "AK00", "AR02", "AR03", "AB00",
  "WB00", "WE00", "WK00", "WN00", "WR00", "WS00", "WT00",
  "Q100", "Q200", "Q300", "QR00", "QA11", "QFRR", "QGBT",
  "QSFA", "QSFB", "QSFC", "QSFD", "QTB1", "QTB2", "QTB4",
  "KRH1", "KSH1", "KWM1", "KWW1", "KWW4", "KMZ1", "KMZ2", "KMZ3", "KMZ4",
]);

export function primaryShenmue2AreaRecords(archives) {
  const main = archives.get("MPK00") || [];
  if (main.some(record => record.kind === "MAPM")) return main;
  const environment = archives.get("MPK01") || [];
  // Some areas (notably Shenhua's house) put the main environment in MPK01
  // and its placed objects in MPK00. Never merge MAP_* event versions.
  return environment.some(record => record.kind === "MAPM")
    ? [...environment, ...main] : null;
}

// Named destinations worth browsing as rooms/buildings. Deliberately excludes
// unidentified scenes, outdoor event sets and repetitive individual floors.
const INTERIOR_AREAS = new Set([
  "AKS0", "AKS1", "AKT0", "AKT1", "AKT2", "AKT3", "AKY0",
  "ARA0", "ARC0", "ARM0", "ARZ0", "WB01", "WECF", "WEG0", "WEM1",
  "WET0", "WKA0", "WRS2", "WSG1", "WSY0", "WTA0",
  "QA00", "QA22", "QAW1", "QAW6", "QB00", "QBAA", "QC00", "QCAE",
  "QD00", "QD01", "QDKJ", "QE00", "QE03", "QE09", "QEDJ", "QEH1",
  "QF00", "QJBT", "QKBT", "QRC0", "QRR0", "QTB3", "KES1",
]);

export function shenmue2OutdoorViews(groups) {
  return shenmue2AreaViews(groups, OUTDOOR_AREAS);
}

export function shenmue2InteriorViews(groups) {
  return shenmue2AreaViews(groups, INTERIOR_AREAS);
}

function shenmue2AreaViews(groups, includedAreas) {
  const byArea = new Map();
  const ordered = [...groups].sort((a,b) => a.disc - b.disc
    || String(a.scene || "").localeCompare(String(b.scene || "")));
  for (const group of ordered) {
    if (!includedAreas.has(group.area) || byArea.has(group.area)) continue;
    const records = primaryShenmue2AreaRecords(group.archives);
    // An archive without a classified main environment is not a complete
    // area shortcut (some forest archives contain only CHRM objects).
    if (!records) continue;
    byArea.set(group.area, {...group, records, label: shenmue2AreaPresentation(group.area).label});
  }
  return [...byArea.values()].sort((a,b) => compareShenmue2Areas(a.area,b.area));
}

export function shenmue2SceneVariantViews(groups) {
  const identity = group => JSON.stringify([group.disc, group.scene, group.area]);
  const defaults = new Set(shenmue2OutdoorViews(groups).map(identity));
  const eventAreas = new Set(["AK09", "AR09", "WK09", "WS09", "ARBT", "CWON", "WBBK", "ARSF", "AR01", "KRF1"]);
  return groups.filter(group => (OUTDOOR_AREAS.has(group.area) || eventAreas.has(group.area))
    && !defaults.has(identity(group))).flatMap(group => {
    const records = primaryShenmue2AreaRecords(group.archives);
    return records ? [{...group, records, label: shenmue2AreaPresentation(group.area).label}] : [];
  });
}

const LIBRARY_METADATA = Object.freeze({
  ARCHIVE: ["Shared archive models", "Shared assets"],
  GLOBAL: ["Global model library", "Shared assets"],
  PACK: ["Shared character packs", "Shared assets"],
});

const REGION_ORDER = Object.freeze({
  Aberdeen: 0,
  "Wan Chai": 1,
  Kowloon: 2,
  Guilin: 3,
  "Other scenes": 4,
  "Shared assets": 5,
});

export function shenmue2RecordParts(record) {
  const parts = String(record?.filename || "").split("_");
  return {
    disc: record.disc ?? Number(/^S2DC_D([1-4])_/.exec(record.filename)?.[1] || 0),
    scene: record.scene ?? null,
    area: record.area || parts[2] || "UNKNOWN",
    archive: record.archive || parts[3] || "UNKNOWN",
  };
}

export function groupShenmue2Catalog(records) {
  const groups = new Map();
  for (const record of records) {
    const { disc, scene, area, archive } = shenmue2RecordParts(record);
    const key = JSON.stringify([disc, scene, area]);
    if (!groups.has(key)) groups.set(key, { disc, scene, area, archives: new Map() });
    const archives = groups.get(key).archives;
    if (!archives.has(archive)) archives.set(archive, []);
    archives.get(archive).push(record);
  }
  return [...groups.values()].sort((a, b) => a.disc - b.disc
    || compareShenmue2Areas(a.area, b.area)
    || String(a.scene || "").localeCompare(String(b.scene || "")));
}

export function shenmue2AreaPresentation(area) {
  const code = String(area || "UNKNOWN").toUpperCase();
  const known = AREA_METADATA[code] || LIBRARY_METADATA[code];
  const label = known?.[0] || `Unidentified scene ${code}`;
  const region = known?.[1] || "Other scenes";
  return Object.freeze({
    code,
    label,
    region,
    principal: PRINCIPAL_AREAS.has(code),
    library: Boolean(LIBRARY_METADATA[code]),
  });
}

export function compareShenmue2Areas(left, right) {
  const a = shenmue2AreaPresentation(left);
  const b = shenmue2AreaPresentation(right);
  return (REGION_ORDER[a.region] - REGION_ORDER[b.region])
    || Number(b.principal) - Number(a.principal)
    || a.label.localeCompare(b.label)
    || a.code.localeCompare(b.code);
}

export function shenmue2ArchivePresentation(archive, records = []) {
  const code = String(archive || "UNKNOWN").toUpperCase();
  const kinds = new Set(records.map((record) => record.kind));
  if (code === "MPK00" && kinds.has("MAPM")) {
    return Object.freeze({
      code,
      label: "Main area · environment, props & street objects",
      role: "main-area",
      order: 0,
    });
  }
  if (kinds.has("MAPM") || kinds.has("PROP")) {
    return Object.freeze({
      code,
      label: `Additional scene / interior · ${code}`,
      role: "additional-scene",
      order: 1,
    });
  }
  if (kinds.has("CHRM")) {
    return Object.freeze({
      code,
      label: `Event & cutscene set · ${code}`,
      role: "event-set",
      order: 2,
    });
  }
  return Object.freeze({
    code,
    label: `Other assets · ${code}`,
    role: "other",
    order: 3,
  });
}

export function compareShenmue2Archives(left, right) {
  const a = shenmue2ArchivePresentation(left.archive, left.records);
  const b = shenmue2ArchivePresentation(right.archive, right.records);
  return a.order - b.order || a.code.localeCompare(b.code);
}

export function compareShenmue2Records(left, right) {
  const kindOrder = { MAPM: 0, PROP: 1, CHRM: 2, MT7: 3 };
  return (kindOrder[left.kind] ?? 4) - (kindOrder[right.kind] ?? 4)
    || String(left.sourceMember || left.filename).localeCompare(
      String(right.sourceMember || right.filename),
    );
}

export function shenmue2RecordDisplayName(record, archive) {
  const sourceName = record.sourceMember || String(record.filename || "").split("_").at(-1);
  const name = record.duplicateMemberName
    ? `${sourceName} (archive entry ${record.sourceMemberIndex})`
    : sourceName;
  if (record.kind === "MAPM") {
    return `${sourceName === "MAP.MAPM" ? "Base environment" : "Environment layer"} · ${name}`;
  }
  if (record.kind === "PROP") return `Placed scene props · ${name}`;
  const itemName = shenmue2ItemName(sourceName);
  if (itemName) return `${itemName} · ${name}`;
  if (record.kind === "CHRM" && archive === "MPK00") {
    return `Street object / character · ${name}`;
  }
  if (record.kind === "CHRM") return `Character / object · ${name}`;
  return name;
}
