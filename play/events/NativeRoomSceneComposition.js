import {
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";

function requireFourcc(value, label) {
  const tag = String(value || "").toUpperCase();
  if (!/^[A-Z0-9_]{4}$/.test(tag)) {
    throw new TypeError(`${label} must be a four-character identifier`);
  }
  return tag;
}

function requirePosition(value) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(component => !Number.isFinite(component))
  ) {
    throw new TypeError(
      "native room object position must contain three finite numbers",
    );
  }
  return value.map(component => Math.fround(component));
}

function requireRecordKinds(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("native room object records must be an array");
  }
  const kinds = value.map(kind => String(kind || "").toUpperCase());
  if (kinds.some(kind => kind !== "FIXO")) {
    throw new Error("native room scene record kind is not implemented");
  }
  return [...new Set(kinds)];
}

export function composeNativeRoomScene(sceneState, {
  objects = [],
  attachmentTargets = [],
} = {}) {
  if (!sceneState || typeof sceneState.writeObjectVector !== "function") {
    throw new TypeError("native room scene gameplay state is required");
  }
  if (!Array.isArray(objects) || !Array.isArray(attachmentTargets)) {
    throw new TypeError("native room scene composition arrays are required");
  }

  const objectTags = new Set();
  for (const descriptor of objects) {
    const objectTag = requireFourcc(
      descriptor?.objectTag,
      "native room object tag",
    );
    if (objectTags.has(objectTag)) {
      throw new Error(`native room object ${objectTag} is duplicated`);
    }
    objectTags.add(objectTag);
    const position = requirePosition(descriptor.nativePosition);
    sceneState.writeObjectVector(
      objectTag,
      position.map(nativeFloat32Word),
    );
    for (const kind of requireRecordKinds(descriptor.records || [])) {
      if (kind === "FIXO") {
        sceneState.configureObjectFixoRecord({
          objectTag,
          available: true,
        });
      }
    }
  }

  const targetTags = new Set();
  for (const descriptor of attachmentTargets) {
    const objectTag = requireFourcc(
      descriptor?.objectTag,
      "native FIXO target tag",
    );
    if (targetTags.has(objectTag)) {
      throw new Error(`native FIXO target ${objectTag} is duplicated`);
    }
    targetTags.add(objectTag);
    sceneState.configureFixoAttachmentTarget({
      objectTag,
      hasMomtRecord: descriptor.hasMomtRecord,
      controlIds: descriptor.controlIds,
    });
  }

  return {
    objectTags: [...objectTags],
    attachmentTargetTags: [...targetTags],
  };
}
