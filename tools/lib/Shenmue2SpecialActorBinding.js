export const SHENMUE2_SPECIAL_ACTOR_MODELS = Object.freeze([
  Object.freeze({
    actorCode: "RYO_",
    modelCode: "RYO_M",
    modelSha256: (
      "feb7c61ce446fae3ce2fac431f7483000eca04be12bb187276c22472ee44116f"
    ),
    sourceFile: (
      ".disc-work/shenmue2-disc1-models/models/"
      + "S2DC_D1_GLOBAL_SCENE_01_MODEL_CHARA_RYO_M.MT7"
    ),
    bundledFile: "play/assets/shenmue2-characters/RYO_M.CHRM",
    runtimeBindingMethod: "native CLMD record controller pointer -0x20",
    evidence: (
      "The live Dreamcast CLMD record stores actor code RYO_ at +0x4c and "
      + "the compact-controller pointer at +0x2c. The Disc 1 global "
      + "SCENE/01/MODEL/CHARA archive supplies its canonical RYO_M model."
    ),
  }),
]);

export const SHENMUE2_SPECIAL_ACTOR_CODES = Object.freeze(
  SHENMUE2_SPECIAL_ACTOR_MODELS.map(({ actorCode }) => actorCode),
);

export const SHENMUE2_SPECIAL_MODEL_BY_ACTOR = new Map(
  SHENMUE2_SPECIAL_ACTOR_MODELS.map((binding) => [
    binding.actorCode,
    binding,
  ]),
);

export const SHENMUE2_SPECIAL_MODEL_BY_CODE = new Map(
  SHENMUE2_SPECIAL_ACTOR_MODELS.map((binding) => [
    binding.modelCode,
    binding,
  ]),
);
