// Source-proven TEL_ receiver control and hand binding from JOMO's telephone
// controller. Reusing it with other motions preserves the binding, not a claim
// that the other call's pickup/hangup timeline has been reconstructed.
export const JOMO_TELEPHONE_RECEIVER = Object.freeze({
  objectTag: "TEL_", actorCode: "AKIR", bindingIndex: 3, objectRenderKey: 3,
  actorRenderKey: -0x42, actorRuntimeMatrixIndex: 30,
  handCorrection: Object.freeze({
    translation: Object.freeze([0.07499999552965164, 0.02499999850988388, 0]),
    rotationAxis: "z", rotationFixedTurnRaw: 0x4000,
  }),
  controllerTranslation: Object.freeze([-0.04, -0.01, 0.02]),
  controllerRotationWords: Object.freeze([0x0000c000, 0x000004f6, 0x0000ec16]),
  adapterStatus: "exact-telm-render-control-binding",
});
