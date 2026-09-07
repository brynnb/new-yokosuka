// Curated destination IDs from public/data/maps.csv, not inferred from model
// filenames. Alternate/cutscene copies stay in the detailed source folders.
const INTERIOR_IDS = new Set([
  "JABE", "DCHA", "DKTY", "DAZA", "DSLI", "DBYO", "DPIZ", "DMAJ",
  "DSKI", "MKYU", "YDB1", "JOMO", "DBHB", "DURN", "DRHT", "DTKY",
  "DRME", "DJAZ", "DYKZ", "DKPA", "DRSA", "DSLT", "DSUS", "TATQ",
  "DCBN", "MS08", "DSBA", "DGCT",
]);

export function shenmueInteriorViews(files, mapNames) {
  const byArea = new Map();
  for (const file of [...files].sort()) {
    const match = /^(S[123])_([^_]+)_.+\.mt5$/i.exec(file);
    if (!match) continue;
    const [, scenario, area] = match;
    if (!INTERIOR_IDS.has(area) || !mapNames[area] || byArea.has(area)) continue;
    byArea.set(area, {prefix: `${scenario}_${area}`, label: mapNames[area], interior: true});
  }
  return [...byArea.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export const ASSET_VIEWER_MAIN_VIEWS = Object.freeze([
  Object.freeze({
    label: "Hazuki Residence Interior",
    prefix: "S1_JOMO",
    interior: true,
  }),
  Object.freeze({
    label: "Hazuki Residence Grounds",
    prefix: "S1_BETD",
  }),
  Object.freeze({
    label: "OP00 Introduction Stage",
    prefix: "S1_OP00",
    composition: "OP00",
    initialSeasonIndex: 1,
    initialWeatherIndex: 3,
    components: Object.freeze([
      Object.freeze({ label: "OMO", filename: "S1_OP00_OMO.MT5" }),
      Object.freeze({
        label: "JIMENHAL — shared foundation / winter ground",
        filename: "S1_OP00_JIMENHAL.MT5",
      }),
      Object.freeze({ label: "NAIB", filename: "S1_OP00_NAIB.MT5" }),
      Object.freeze({
        label: "NIWAKAL — warm-season yard layer",
        filename: "S1_OP00_NIWAKAL.MT5",
      }),
      Object.freeze({ label: "OMADO", filename: "S1_OP00_OMADO.MT5" }),
      Object.freeze({ label: "OOSAKI", filename: "S1_OP00_OOSAKI.MT5" }),
      Object.freeze({ label: "JYUU", filename: "S1_OP00_JYUU.MT5" }),
    ]),
  }),
  Object.freeze({ label: "Yamanose", prefix: "S1_JU00" }),
  Object.freeze({ label: "Sakuragaoka", prefix: "S1_JD00" }),
  Object.freeze({ label: "Dobuita", prefix: "S1_D000" }),
  Object.freeze({
    label: "New Yokosuka Harbor",
    prefix: "S2_MFSY",
  }),
  Object.freeze({
    label: "Old Warehouse District",
    prefix: "S2_MKSG",
  }),
  Object.freeze({
    label: "Motorcycle Route",
    prefix: "S3_NBIK",
    mapOnly: true,
  }),
  Object.freeze({
    label: "70-Man Battle",
    prefix: "S3_MFBT",
    mapOnly: true,
  }),
  Object.freeze({
    label: "Nozomi Rescue",
    prefix: "S3_TERY",
    mapOnly: true,
  }),
  Object.freeze({
    label: "Dobuita Departure",
    prefix: "S3_DXMS",
    mapOnly: true,
  }),
]);
