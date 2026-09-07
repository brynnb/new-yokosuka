import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NPC_CONTROLLER_FAMILY_BY_MODEL,
} from "../../play/data/npc-controller-target-families.web.js";
import nativeRoomActors from "../../play/data/nativeRoomActors.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scheduledActors = JSON.parse(fs.readFileSync(
  path.join(root, "play/data/scheduled-actors.json"),
  "utf8",
));
const nativeActivityActors = JSON.parse(fs.readFileSync(
  path.join(root, "play/data/events/nativeActivityActors.json"),
  "utf8",
));
const characterDirectory = path.join(root, "play/assets/characters");
const outputPath = path.join(
  root,
  "play/data/shenmue1-playable-avatars.generated.json",
);

const MAIN_MODEL_FILES = new Set([
  "ACS_M.CHRM",
  "BLA_M.CHRM",
  "BLB_M.CHRM",
  "CHA_M.CHRM",
  "FUK_M.CHRM",
  "GIB_M.CHRM",
  "GIJ_M.CHRM",
  "IWA_M.CHRM",
  "JIM_M.CHRM",
  "JKA_M.CHRM",
  "KIS_M.CHRM",
  "KOK_M.CHRM",
  "SYU_M.CHRM",
]);
const CATEGORY_BY_FAMILY = new Map([
  [0, "men"],
  [3, "men"],
  [7, "men"],
  [10, "men"],
  [12, "women"],
  [15, "women"],
  [19, "women"],
  [4, "kids"],
  [8, "kids"],
  [16, "animals"],
  [18, "animals"],
]);
const EXTRA_MODELS = new Map([
  ["FUB_M", {
    label: "Fuku-san (Alternate)",
    textureFile: "FUB_textures.bin",
    category: "men",
  }],
]);
const PARTIAL_RENDER_ROUTE_MODELS = new Set(["HOB_L", "TKI_L"]);
const UNSELECTABLE_MODELS = new Set(["HOB_L", "TKI_L"]);
const ACTIVITY_ONLY_MODELS = new Set(Object.values(
  nativeActivityActors.worlds || {},
).flatMap((definitions) => definitions
  .filter(({ activityOnly }) => activityOnly === true)
  .map(({ modelCode }) => modelCode)));
const ROOM_OWNED_MODELS = new Set(nativeRoomActors.modelCodes || []);

function avatarId(modelCode) {
  return `s1-${modelCode.toLowerCase().replaceAll("_", "-")}`;
}

const actorByModel = new Map();
for (const actor of scheduledActors.actors) {
  if (!actorByModel.has(actor.modelCode)) actorByModel.set(actor.modelCode, actor);
}

const avatars = fs.readdirSync(characterDirectory)
  .filter((filename) => filename.endsWith(".CHRM"))
  .filter((filename) => !MAIN_MODEL_FILES.has(filename))
  .filter((filename) => !ACTIVITY_ONLY_MODELS.has(
    filename.slice(0, -".CHRM".length),
  ))
  .filter((filename) => !ROOM_OWNED_MODELS.has(
    filename.slice(0, -".CHRM".length),
  ))
  .map((modelFile) => {
    const modelCode = modelFile.slice(0, -".CHRM".length);
    const actor = actorByModel.get(modelCode);
    const extra = EXTRA_MODELS.get(modelCode);
    const family = NPC_CONTROLLER_FAMILY_BY_MODEL[modelCode];
    const category = extra?.category || CATEGORY_BY_FAMILY.get(family);
    if (!actor && !extra) {
      throw new Error(`No playable avatar metadata for ${modelFile}`);
    }
    if (!category) {
      throw new Error(`No playable avatar category for ${modelFile}`);
    }
    const textureFile = extra?.textureFile || actor.textureFile;
    if (!fs.existsSync(path.join(characterDirectory, textureFile))) {
      throw new Error(`Missing playable avatar texture ${textureFile}`);
    }
    return {
      id: avatarId(modelCode),
      label: extra?.label || actor.label,
      category,
      controllerFamily: family,
      modelCode,
      modelFile,
      textureFile,
      ...(PARTIAL_RENDER_ROUTE_MODELS.has(modelCode)
        ? { allowPartialRenderRoutes: true }
        : {}),
      ...(UNSELECTABLE_MODELS.has(modelCode)
        ? { selectable: false }
        : {}),
    };
  })
  .sort((left, right) => left.label.localeCompare(right.label, "en"));

fs.writeFileSync(outputPath, `${JSON.stringify({
  schema: "new-yokosuka-shenmue1-playable-avatars-v1",
  generatedFrom: [
    "play/data/scheduled-actors.json",
    "play/data/events/nativeActivityActors.json",
    "play/data/npc-controller-target-families.web.js",
    "play/assets/characters",
  ],
  avatars,
}, null, 2)}\n`);

console.log(`Wrote ${avatars.length} Shenmue I NPC avatars.`);
