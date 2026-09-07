import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findShenmue1LightScenes } from "../lib/shenmue1_lght.js";

const sources = Object.freeze([
  ["D000", 1, "extracted_files/data/SCENE/01/D000/MAPINFO.BIN"],
  ["DAZA", 1, "extracted_files/data/SCENE/01/DAZA/MAPINFO.BIN"],
  ["DBHB", 1, "extracted_files/data/SCENE/01/DBHB/MAPINFO.BIN"],
  ["DBYO", 1, "extracted_files/data/SCENE/01/DBYO/MAPINFO.BIN"],
  ["DCBN", 1, "extracted_files/data/SCENE/01/DCBN/MAPINFO.BIN"],
  ["DCHA", 1, "extracted_files/data/SCENE/01/DCHA/MAPINFO.BIN"],
  ["DJAZ", 1, "extracted_files/data/SCENE/01/DJAZ/MAPINFO.BIN"],
  ["DKPA", 1, "extracted_files/data/SCENE/01/DKPA/MAPINFO.BIN"],
  ["DKTY", 1, "extracted_files/data/SCENE/01/DKTY/MAPINFO.BIN"],
  ["DPIZ", 1, "extracted_files/data/SCENE/01/DPIZ/MAPINFO.BIN"],
  ["DRHT", 1, "extracted_files/data/SCENE/01/DRHT/MAPINFO.BIN"],
  ["DRME", 1, "extracted_files/data/SCENE/01/DRME/MAPINFO.BIN"],
  ["DRSA", 1, "extracted_files/data/SCENE/01/DRSA/MAPINFO.BIN"],
  ["DSBA", 1, "extracted_files/data/SCENE/01/DSBA/MAPINFO.BIN"],
  ["DSKI", 1, "extracted_files/data/SCENE/01/DSKI/MAPINFO.BIN"],
  ["DSLI", 1, "extracted_files/data/SCENE/01/DSLI/MAPINFO.BIN"],
  ["DSLT", 1, "extracted_files/data/SCENE/01/DSLT/MAPINFO.BIN"],
  ["DTKY", 1, "extracted_files/data/SCENE/01/DTKY/MAPINFO.BIN"],
  ["DURN", 1, "extracted_files/data/SCENE/01/DURN/MAPINFO.BIN"],
  ["DYKZ", 1, "extracted_files/data/SCENE/01/DYKZ/MAPINFO.BIN"],
  ["JOMO", 1, "extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN"],
  ["OP02", 1, "extracted_files/data/SCENE/01/OP02/MAPINFO.BIN"],
  ["JU00", 1, "extracted_files/data/SCENE/01/JU00/MAPINFO.BIN"],
  ["JD00", 1, "extracted_files/data/SCENE/01/JD00/MAPINFO.BIN"],
  ["TATQ", 1, "extracted_files/data/SCENE/01/TATQ/MAPINFO.BIN"],
  ["MFSY", 3, "extracted_disc3_v2/data/SCENE/03/MFSY/MAPINFO.BIN"],
  ["MKSG", 3, "extracted_disc3_v2/data/SCENE/03/MKSG/MAPINFO.BIN"],
  ["MS08", 3, "extracted_disc3_v2/data/SCENE/03/MS08/MAPINFO.BIN"],
  ["MFBT", 3, "extracted_disc3_v2/data/SCENE/03/MFBT/MAPINFO.BIN"],
  ["MA00", 3, "extracted_disc3_v2/data/SCENE/03/MA00/MAPINFO.BIN"],
]);

const output = resolve(
  process.argv[2] || "play/data/shenmue1-native-lights.json",
);
const areas = {};
for (const [area, disc, sourcePath] of sources) {
  const input = resolve(sourcePath);
  const bytes = await readFile(input);
  const candidates = findShenmue1LightScenes(bytes);
  if (candidates.length !== 1) {
    throw new Error(
      `${area} has ${candidates.length} structurally valid LGHT roots`,
    );
  }
  const [{ offset, scene }] = candidates;
  const presets = scene.children.map((child) => ({
    childIndex: child.index,
    sourceOffset: offset + child.sourceOffset,
    mode: child.mode,
    scalar: child.scalar,
    globalValues: child.globalValues,
    sourceRecordCount: child.records.length,
    records: child.records
      .filter(({ enabled }) => enabled === 1)
      .map((record) => ({
        ...record,
        sourceOffset: offset + record.sourceOffset,
      })),
  }));
  areas[area] = {
    source: {
      disc,
      path: sourcePath.replace(/^extracted_(?:files|disc\d+_v\d+)\/data\//, ""),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      lghtOffset: offset,
    },
    initialPresetIndex: 0,
    presets,
  };
}

const document = {
  format: "shenmue1-mapinfo-native-lights-v2",
  runtimePolicy: {
    representation: "clustered-point",
    note: "Every native LGHT child is retained as an addressable scripted preset; Babylon representation remains selected by nativeType.",
  },
  areas,
};
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(
  `Wrote ${output} (${Object.keys(areas).length} areas, ${Object.values(areas).reduce((sum, area) => sum + area.presets.reduce((presetSum, preset) => presetSum + preset.records.length, 0), 0)} enabled preset lights)`,
);
