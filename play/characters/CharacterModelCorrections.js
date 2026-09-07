const CHARACTER_MODEL_BIND_SCALE_CORRECTIONS = Object.freeze({
  // SHA_L's source hierarchy is authored at 10x the normalized character
  // scale used by both its native animation matrices and the game world.
  SHA_L: 0.1,
});

export function characterModelBindScaleCorrection(modelCode) {
  return CHARACTER_MODEL_BIND_SCALE_CORRECTIONS[modelCode] ?? 1;
}
