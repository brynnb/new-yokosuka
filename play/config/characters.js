import { runtimeAssetGroup, runtimeAssetUrl } from "../../src/RuntimeAssets.js";
const fukuModelUrl = runtimeAssetUrl("play/assets/characters/FUK_M.CHRM");
const ineModelUrl = runtimeAssetUrl("play/assets/INE_M.CHRM");
const ineTexturePackUrl = runtimeAssetUrl("play/assets/INE_textures.bin");
import shenmue1PlayableAvatars from "../data/shenmue1-playable-avatars.generated.json";
import {
  characterModelBindScaleCorrection,
} from "../characters/CharacterModelCorrections.js";

export const bundledCharacterModels = {
  ...runtimeAssetGroup("play/assets/characters/*.CHRM"),
  ...runtimeAssetGroup("play/assets/shenmue2-characters/*.CHRM"),
};
export const bundledCharacterTextures = {
  ...runtimeAssetGroup("play/assets/characters/*_textures.bin"),
  ...runtimeAssetGroup("play/assets/shenmue2-characters/*_textures.bin"),
};

export function bundledCharacterAsset(
  assets,
  filename,
  directory = "characters",
) {
  const url = assets[`play/assets/${directory}/${filename}`];
  if (!url) throw new Error(`Missing bundled character asset: ${filename}`);
  return url;
}

function humansCharacter(id, label, modelCode, options = {}) {
  return Object.freeze({
    id,
    label,
    model: `${modelCode}_M.CHRM`,
    modelUrl: bundledCharacterAsset(
      bundledCharacterModels,
      `${modelCode}_M.CHRM`,
    ),
    texturePackUrl: bundledCharacterAsset(
      bundledCharacterTextures,
      `${modelCode}_textures.bin`,
    ),
    ryoHeadAtlasFix: false,
    groundOffset: null,
    backFaceCulling: true,
    nativeTwiddledRectUV: true,
    clockwiseCulling: true,
    hiddenRootRenderKeys: Object.freeze([-0x44]),
    ...options,
  });
}

function npcCharacter(definition) {
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    category: definition.category,
    controllerFamily: definition.controllerFamily,
    modelCode: definition.modelCode,
    modelScale: characterModelBindScaleCorrection(definition.modelCode),
    model: definition.modelFile,
    modelUrl: bundledCharacterAsset(
      bundledCharacterModels,
      definition.modelFile,
    ),
    texturePackUrl: bundledCharacterAsset(
      bundledCharacterTextures,
      definition.textureFile,
    ),
    ryoHeadAtlasFix: false,
    groundOffset: null,
    backFaceCulling: true,
    nativeTwiddledRectUV: true,
    clockwiseCulling: true,
    hiddenRootRenderKeys: Object.freeze([-0x44]),
    allowPartialRenderRoutes: definition.allowPartialRenderRoutes === true,
    selectable: definition.selectable !== false,
    // Generated NPC rigs expose the seated arm channels opposite to the
    // Ryo-authored forklift motion.
    mirrorForkliftArmChannels: true,
  });
}

export const MAIN_CHARACTERS = Object.freeze([
  Object.freeze({
    id: "ryo",
    label: "Ryo Hazuki",
    nativeActorTag: "AKIR",
    model: "S2_YDB1_YKC_M.MT5",
    texturePackModel: "S2_YDB1_YKC_M.MT5",
    ryoHeadAtlasFix: true,
    groundOffset: 0.003655,
    outdoorFootwear: Object.freeze({
      // YKB is the original sneaker-equipped Ryo body. YKC uses the authored
      // sock geometry/texture seen after Ryo removes his shoes at home.
      model: "S3_DGCT_YKB_M.MT5",
      texturePackModel: "S3_DGCT_YKB_M.MT5",
      renderKeys: Object.freeze([18, 19, 23, 24]),
    }),
  }),
  Object.freeze({
    id: "fuku",
    label: "Fuku-san",
    model: "FUK_M.CHRM",
    modelUrl: fukuModelUrl,
    texturePackModel: "S2_YDB1_YKC_M.MT5",
    ryoHeadAtlasFix: false,
    groundOffset: null,
    hiddenRootRenderKeys: Object.freeze([-0x44]),
  }),
  Object.freeze({
    id: "ine",
    label: "Ine-san",
    model: "INE_M.CHRM",
    modelUrl: ineModelUrl,
    texturePackUrl: ineTexturePackUrl,
    ryoHeadAtlasFix: false,
    groundOffset: null,
    backFaceCulling: true,
    nativeTwiddledRectUV: true,
    clockwiseCulling: true,
  }),
  humansCharacter("iwao", "Iwao Hazuki", "IWA"),
  humansCharacter("chai", "Chai", "CHA", {
    hiddenRenderKeys: Object.freeze([88, 89]),
  }),
  humansCharacter("guizhang", "Guizhang Chen", "KIS"),
  humansCharacter("masterChen", "Master Chen", "SYU"),
  humansCharacter("lanDi", "Lan Di", "KOK"),
  humansCharacter("jimmy", "Jimmy Yan", "JIM"),
  humansCharacter("terry", "Terry Ryan", "ACS"),
  humansCharacter("tony", "Tony Abrams", "GIJ"),
  humansCharacter("smith", "Smith Bradley", "GIB"),
  humansCharacter("manInBlackA", "Man in Black A", "BLA"),
  humansCharacter("manInBlackB", "Man in Black B", "BLB"),
  humansCharacter("youngRyo", "Young Ryo", "JKA"),
]);

export const SHENMUE1_NPC_CHARACTERS = Object.freeze(
  shenmue1PlayableAvatars.avatars.map(npcCharacter),
);

export const CHARACTERS = Object.freeze([
  ...MAIN_CHARACTERS,
  ...SHENMUE1_NPC_CHARACTERS,
]);

export const SELECTABLE_CHARACTERS = Object.freeze(
  CHARACTERS.filter((character) => character.selectable !== false),
);

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((character) => (
  [character.id, character]
)));
