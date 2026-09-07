import controllerFamilyData from "../../src/data/shenmue-controller-families.web.js";
import {
  NPC_CONTROLLER_FAMILY_BY_MODEL,
} from "../data/npc-controller-target-families.web.js";

// These are the 21 controller descriptors used by the original SH-4
// executable. They were extracted from the table at 0x0c293ea4; each MOTN
// sequence identifies its descriptor with the low 15 bits of metadata +0x02.
// No body-shape, sequence-name, or model-name inference is involved.
export const SHENMUE_CONTROLLER_FAMILIES = Object.freeze(
  controllerFamilyData.families.map((family) => Object.freeze({
    id: `SH4_${String(family.index).padStart(2, "0")}`,
    index: family.index,
    sourceAddress: family.executableTableEntry,
    nativeTypes: Object.freeze(family.nodes.map((node) => node.type)),
    defaultPositions: Object.freeze(
      family.nodes.map((node) => Object.freeze(node.defaultPosition)),
    ),
    defaultRotationsRaw: Object.freeze(
      family.nodes.map((node) => Object.freeze(node.defaultRotationRaw)),
    ),
    nodes: Object.freeze(family.nodes.map((node) => Object.freeze({
      ...node,
      descriptorHeader: Object.freeze(node.descriptorHeader),
      children: Object.freeze(node.children),
      defaultPosition: Object.freeze(node.defaultPosition),
      defaultRotationRaw: Object.freeze(node.defaultRotationRaw),
    }))),
  })),
);

export function controllerFamilyByIndex(index) {
  return Number.isInteger(index)
    ? SHENMUE_CONTROLLER_FAMILIES[index] || null
    : null;
}

// Exact live captures independently identify these entries. All runtime model
// mappings now come from the original CHRM hierarchy-node selector.
export const GAK_CONTROLLER_FAMILY = controllerFamilyByIndex(4);
export const HRSK_35_CONTROLLER_FAMILY = controllerFamilyByIndex(15);

// The old names described inferred control-count buckets. They now resolve to
// the actual authored families carried by the representative MOTN sequences.
export const MBAS_37_CONTROLLER_FAMILY = controllerFamilyByIndex(7);
export const MBAS_35_CONTROLLER_FAMILY = controllerFamilyByIndex(19);

// The ordinary 13 HRCM render routes were recorded from Ryo's live controller.
// Cats and dogs use the same native render-tree contract, but their authored
// HRCM hierarchies expose these additional nonhuman branches. The controller
// types below come from aligning those Disc-authored hierarchies with the
// executable's exact family-16/family-18 descriptor trees:
//   - paired fore/hind limbs: keys 4, 9, 15, 18, 20, 23
//   - neck/head continuation: key 2
//   - tail: keys 55-57
//   - dog ears: keys 58-59
// This is family data, not an actor/model-name override.
const NONHUMAN_RENDER_CONTROLLER_TYPE_BY_KEY = Object.freeze([
  Object.freeze([0x02, 37]),
  Object.freeze([0x04, 13]),
  Object.freeze([0x09, 7]),
  Object.freeze([0x0f, 29]),
  Object.freeze([0x12, 34]),
  Object.freeze([0x14, 22]),
  Object.freeze([0x17, 27]),
  Object.freeze([0x37, 40]),
  Object.freeze([0x38, 41]),
  Object.freeze([0x39, 43]),
  Object.freeze([0x3a, 45]),
  Object.freeze([0x3b, 44]),
]);

function appendNonhumanRenderRoutes(renderMatrixByKey, family) {
  if (family?.index !== 16 && family?.index !== 18) {
    return renderMatrixByKey;
  }
  const nativeIndexByType = new Map(
    family.nodes.map((node) => [node.type, node.index]),
  );
  for (const [renderKey, controllerType] of (
    NONHUMAN_RENDER_CONTROLLER_TYPE_BY_KEY
  )) {
    const nativeIndex = nativeIndexByType.get(controllerType);
    if (Number.isInteger(nativeIndex)) {
      renderMatrixByKey.set(renderKey, nativeIndex);
    }
  }
  return renderMatrixByKey;
}

export function npcControllerFamilyForModel(modelCode) {
  return controllerFamilyByIndex(
    NPC_CONTROLLER_FAMILY_BY_MODEL[modelCode],
  );
}

export function npcControllerFamilyForMotion(_modelCode, sequence) {
  return controllerFamilyByIndex(sequence?.controllerFamilyIndex);
}

export function applyNpcControllerFamily(
  canonicalRig,
  canonicalRenderMatrixByKey,
  family,
) {
  if (!family) {
    return {
      rig: canonicalRig,
      renderMatrixByKey: canonicalRenderMatrixByKey,
    };
  }

  const canonicalByType = new Map(
    canonicalRig.map((control) => [control.type, control]),
  );
  const nativeIndexByType = new Map(
    family.nodes.map((node) => [node.type, node.index]),
  );
  if (nativeIndexByType.size !== family.nodes.length) {
    throw new Error(`${family.id} contains duplicate controller types`);
  }

  const rig = family.nodes.map((node) => {
    const canonical = canonicalByType.get(node.type);
    return Object.freeze({
      ...(canonical || {}),
      index: node.index,
      type: node.type,
      solverClass: node.solverClass,
      solverSubtype: node.solverSubtype,
      parent: node.parent,
      children: node.children,
      defaultPosition: node.defaultPosition,
      defaultRotationRaw: node.defaultRotationRaw,
      descriptorHeader: node.descriptorHeader,
    });
  });

  const renderMatrixByKey = appendNonhumanRenderRoutes(new Map(
    [...canonicalRenderMatrixByKey].map(([renderKey, canonicalIndex]) => {
      const type = canonicalRig[canonicalIndex]?.type;
      return [renderKey, nativeIndexByType.get(type)];
    }),
  ), family);
  const missingRoutes = [...renderMatrixByKey]
    .filter(([, nativeIndex]) => !Number.isInteger(nativeIndex))
    .map(([renderKey]) => renderKey);
  if (missingRoutes.length > 0) {
    throw new Error(
      `${family.id} controller omits render routes ${missingRoutes.join(", ")}`,
    );
  }

  return {
    rig: Object.freeze(rig),
    renderMatrixByKey,
  };
}
