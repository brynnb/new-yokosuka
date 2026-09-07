export const SHENMUE_CONTROLLER_FAMILY_COUNT = 21;
export const MT5_CONTROLLER_FAMILY_NODE_TYPE_BASE = 0x7001;

function dataViewFor(source) {
  if (source instanceof DataView) return source;
  if (source instanceof ArrayBuffer) return new DataView(source);
  if (ArrayBuffer.isView(source)) {
    return new DataView(
      source.buffer,
      source.byteOffset,
      source.byteLength,
    );
  }
  throw new TypeError("Expected MT5 bytes");
}

function fourCc(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

// FUN_0c0faef2 reads the selected source hierarchy node's signed low word.
// Values above 0x7000 are converted with nodeType - 0x7001. Other node types
// leave the runtime model record on family zero.
export function controllerFamilyIndexFromMt5NodeFlag(flag) {
  const nodeType = Number(flag) & 0xffff;
  return nodeType > 0x7000
    ? nodeType - MT5_CONTROLLER_FAMILY_NODE_TYPE_BASE
    : 0;
}

export function inspectMt5ControllerFamily(source) {
  const view = dataViewFor(source);
  if (view.byteLength < 12 || fourCc(view, 0) !== "HRCM") {
    throw new Error("Expected an HRCM model resource");
  }

  const modelOffset = view.getUint32(8, true);
  if (modelOffset < 12 || modelOffset + 4 > view.byteLength) {
    throw new Error(
      `Invalid HRCM hierarchy offset 0x${modelOffset.toString(16)}`,
    );
  }

  const rootNodeFlag = view.getUint32(modelOffset, true);
  const rootNodeType = rootNodeFlag & 0xffff;
  const familyIndex = controllerFamilyIndexFromMt5NodeFlag(rootNodeFlag);
  const hasAuthoredFamilyType = (
    rootNodeType >= MT5_CONTROLLER_FAMILY_NODE_TYPE_BASE
    && familyIndex < SHENMUE_CONTROLLER_FAMILY_COUNT
  );

  return Object.freeze({
    modelOffset,
    rootNodeFlag,
    rootNodeType,
    familyIndex,
    hasAuthoredFamilyType,
  });
}

export function authoredControllerFamilyIndexFromMt5(source) {
  const inspection = inspectMt5ControllerFamily(source);
  return inspection.hasAuthoredFamilyType
    ? inspection.familyIndex
    : null;
}
