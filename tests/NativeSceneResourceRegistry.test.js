import assert from "node:assert/strict";
import test from "node:test";

import {
  NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
} from "../play/events/NativeOperation013cRuntime.js";
import {
  createNativeSceneResourceRegistry,
} from "../play/events/NativeSceneResourceRegistry.js";

test("creates and releases exact preloaded scene resource records", () => {
  const registry = createNativeSceneResourceRegistry();
  registry.register({
    path: "/scene/01/D000/",
    name: "DESA",
    ready: true,
    resource: { loaded: true },
  });
  const created = registry.createRecord({
    argument2String: "/scene/01/D000/",
    argument3String: "DESA",
  });
  assert.equal(created.schema, NATIVE_OPERATION_013C_RECORD_LIFECYCLE);
  assert.equal(created.activityComplete, true);
  assert.equal(created.record.kind, "native-scene-resource-record");
  assert.equal(registry.releaseRecord(created.record), true);
  assert.throws(
    () => registry.releaseRecord(created.record),
    /not active/,
  );
});

test("scene resource creation fails closed for unregistered identities", () => {
  const registry = createNativeSceneResourceRegistry();
  assert.throws(() => registry.createRecord({
    argument2String: "/scene/01/D000/",
    argument3String: "NONE",
  }), /unavailable/);
});

test("creates only exact static record pairs declared by the event program", () => {
  const registry = createNativeSceneResourceRegistry();
  assert.equal(registry.prepareProgramRecords({
    operation013cStaticRecordPairs: [{ argument2: 0xeeed, argument3: 0xeefd }],
  }), 1);
  const created = registry.createRecord({
    argument2: 0xeeed,
    argument3: 0xeefd,
  });
  assert.equal(created.activityComplete, true);
  assert.deepEqual(created.record, {
    kind: "native-scene-static-record",
    argument2: 0xeeed,
    argument3: 0xeefd,
  });
  assert.throws(() => registry.createRecord({
    argument2: 1,
    argument3: 2,
  }), /must be a non-empty string/);
});

test("owns exact precompiled archive resources declared by the program", () => {
  const registry = createNativeSceneResourceRegistry();
  assert.equal(registry.prepareProgramRecords({
    staticStrings: [
      { pointer: 0x2748, value: "/scene/01/OP02/" },
      { pointer: 0x2758, value: "OP02.afs" },
    ],
    operation013cArchivePairs: [{
      pathPointer: 0x2748,
      namePointer: 0x2758,
    }],
  }), 1);
  const archive = registry.acquireArchive({
    path: "/scene/01/OP02/",
    name: "OP02.afs",
  });
  const activity = registry.startArchiveActivity({
    archive: { resource: archive },
    firstIndex: 0,
    secondIndex: 1,
  });
  assert.equal(activity.activityComplete, true);
  assert.equal(activity.record.firstIndex, 0);
  assert.equal(activity.record.secondIndex, 1);
  assert.equal(registry.releaseArchive({ resource: archive }), true);
  assert.throws(() => registry.acquireArchive({
    path: "/scene/01/OP02/",
    name: "missing.afs",
  }), /undeclared/);
});

test("allocates opaque MOTI request handles until world resources clear", () => {
  const registry = createNativeSceneResourceRegistry();
  const first = registry.queueMotionResource({
    path: "scene/01/OP00",
    name: "M_0101A.BIN",
    resourceType: "MOTI",
    global: false,
    source: { callFileOffset: "0x15476" },
  });
  const second = registry.queueMotionResource({
    path: "misc",
    name: "M_MOBJ.BIN",
    resourceType: "MOTI",
    global: true,
  });

  assert.equal(first.handle, 1);
  assert.equal(second.handle, 2);
  assert.equal(registry.motionRequest(1), first.resource);
  assert.equal(registry.motionRequest(2), second.resource);
  registry.clear();
  assert.equal(registry.motionRequest(1), null);
  assert.equal(registry.queueMotionResource({
    path: "scene/01/OP00",
    name: "M_UO.BIN",
    resourceType: "MOTI",
    global: false,
  }).handle, 1);
});

test("owns one exact SCRL resource per native presentation slot", () => {
  const registry = createNativeSceneResourceRegistry();
  const first = registry.queueScrollSpriteResource({
    path: "scroll",
    name: "SCROLL25.SPR",
    slotIndex: 0,
    source: { callFileOffset: "0x2552e" },
  });
  assert.equal(first.resource.kind, "native-scroll-sprite-resource");
  assert.equal(first.resource.slotIndex, 0);
  const replacement = registry.queueScrollSpriteResource({
    path: "sprite",
    name: "SCROLL27.SPR",
    slotIndex: 0,
  });
  assert.equal(registry.scrollSpriteResources.get(0), replacement.resource);
  assert.throws(() => registry.queueScrollSpriteResource({
    path: "sprite",
    name: "SCROLL05.SPR",
    slotIndex: 3,
  }), /between 0 and 2/);
});
