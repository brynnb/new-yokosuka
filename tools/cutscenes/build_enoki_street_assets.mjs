// Extract the motion bank loaded by D000's DEQB street encounter.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MotnLoader } from "../../src/MotnLoader.js";
import { parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const discRoot = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const archivePath = path.join(discRoot, "data/SCENE/01/D000/DEQB.PKS");
const archive = fs.readFileSync(archivePath);
const expectedHash = "77c1b75bed243d89965cf2a30ee03dc94d8c7d3d6353114cce0edc4f4f076f76";
if (sha256(archive) !== expectedHash) {
  throw new Error("Unexpected SHA-256 for Disc 1 D000/DEQB.PKS");
}

const member = parseIpacActivityArchive(archive).members.find((row) => row.name === "M_DEQB.MOTN");
if (!member) {
  throw new Error("Missing M_DEQB.MOTN in Disc 1 D000/DEQB.PKS");
}
const bank = MotnLoader.parse(member.bytes);
const motions = [
  [0, "AKI_HANGEKI_SIPPAI_1QTE"],
  [1, "AKI_KAIHI_SUKASI_PUNCH_SEIKOU_QTE"],
  [25, "OTH_STAND_YANKII_02_LP_F"],
  [27, "OTH_THO_TALK_STAND_YANKII_LP_F"],
  [32, "TKA_HANGEKI_SIPPAI_1QTE"],
  [33, "TKA_KAIHI_SUKASI_PUNCH_SEIKOU_QTE"],
];
for (const [index, name] of motions) {
  const sequence = bank.sequences[index];
  if (sequence?.name !== name || !sequence.valueData?.complete) {
    throw new Error(`Unexpected or incomplete M_DEQB.MOTN sequence ${index} (${name})`);
  }
}

const asset = "play/assets/dobuita/enoki-street/M_DEQB.MOTN";
const outputPath = path.join(root, asset);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, member.bytes);
execFileSync(process.execPath, ["tools/runtime-assets.mjs", "update", asset], {
  cwd: root,
  stdio: "inherit",
});
