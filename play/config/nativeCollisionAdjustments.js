export const NATIVE_COLLISION_ADJUSTMENTS = Object.freeze([
  Object.freeze({
    area: "D000",
    fieldId: "0000",
    sectionIndex: 0,
    recordOffset: 17776,
    code: 9,
    action: "exclude",
    browserLocation: Object.freeze([40.03, 0.07, 46.51]),
    feature: "dobuita-cinema-frontage",
    reason: "Obsolete fixture boundary in front of the Dobuita cinema.",
  }),
  ...[1968, 1996, 2024, 2108].map((recordOffset) => Object.freeze({
    area: "JHD0",
    fieldId: "0000",
    sectionIndex: 0,
    recordOffset,
    code: 200,
    action: "exclude",
    browserLocation: Object.freeze([2.46, 1.06, -21.66]),
    feature: "dojo-sparring-ring",
    reason: "Scripted perimeter around the Hazuki dojo sparring floor.",
    activationNote: (
      "Restore the complete four-segment perimeter only while the scripted "
      + "Fuku-san sparring mode is active."
    ),
  })),
]);

export function nativeCollisionAdjustmentForRecord({
  area,
  fieldId,
  sectionIndex,
  record,
}) {
  return NATIVE_COLLISION_ADJUSTMENTS.find((adjustment) => (
    adjustment.area === area
    && adjustment.fieldId === fieldId
    && adjustment.sectionIndex === sectionIndex
    && adjustment.recordOffset === record.recordOffset
    && adjustment.code === record.code
  )) || null;
}
