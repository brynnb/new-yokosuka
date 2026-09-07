import {
  NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
} from "./NativeOperation013cRuntime.js";

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function resourceKey(path, name) {
  return `${requireString(path, "native resource path")}\0${
    requireString(name, "native resource name")
  }`;
}

export class NativeSceneResourceRegistry {
  constructor() {
    this.resources = new Map();
    this.staticRecordPairs = new Set();
    this.activeRecords = new Set();
    this.archiveDeclarations = new Set();
    this.activeArchives = new Set();
    this.archiveActivities = new Map();
    this.motionRequests = new Map();
    this.nextMotionRequestHandle = 1;
    this.handMotionRequests = new Map();
    this.nextHandMotionRequestHandle = 1;
    this.sceneSchedulerInitializations = [];
    this.scrollSpriteResources = new Map();
  }

  clear() {
    this.resources.clear();
    this.staticRecordPairs.clear();
    this.activeRecords.clear();
    this.archiveDeclarations.clear();
    this.activeArchives.clear();
    this.archiveActivities.clear();
    this.motionRequests.clear();
    this.nextMotionRequestHandle = 1;
    this.handMotionRequests.clear();
    this.nextHandMotionRequestHandle = 1;
    this.sceneSchedulerInitializations.length = 0;
    this.scrollSpriteResources.clear();
  }

  register({ path, name, ready, resource = null }) {
    if (typeof ready !== "boolean") {
      throw new TypeError("native scene resource readiness must be Boolean");
    }
    const key = resourceKey(path, name);
    if (this.resources.has(key)) {
      throw new Error(`native scene resource ${path}${name} is duplicated`);
    }
    this.resources.set(key, {
      path,
      name,
      ready,
      resource,
    });
    return key;
  }

  createRecord({
    argument2,
    argument3,
    argument2String,
    argument3String,
  }) {
    const staticKey = `${argument2}:${argument3}`;
    if (this.staticRecordPairs.has(staticKey)) {
      const record = Object.freeze({
        kind: "native-scene-static-record",
        argument2,
        argument3,
      });
      this.activeRecords.add(record);
      return {
        schema: NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
        record,
        activityComplete: true,
      };
    }
    const key = resourceKey(argument2String, argument3String);
    const registered = this.resources.get(key);
    if (!registered) {
      throw new Error(
        `native scene resource ${argument2String}${argument3String} `
        + "is unavailable",
      );
    }
    const record = Object.freeze({
      kind: "native-scene-resource-record",
      key,
    });
    this.activeRecords.add(record);
    return {
      schema: NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
      record,
      activityComplete: registered.ready,
    };
  }

  prepareProgramRecords(program) {
    const pairs = program?.operation013cStaticRecordPairs ?? [];
    if (!Array.isArray(pairs)) {
      throw new TypeError(
        "native operation 0x013c program pairs must be an array",
      );
    }
    for (const pair of pairs) {
      if (
        !Number.isSafeInteger(pair.argument2)
        || pair.argument2 < 0
        || !Number.isSafeInteger(pair.argument3)
        || pair.argument3 < 0
      ) {
        throw new TypeError("native operation 0x013c program pair is invalid");
      }
      this.staticRecordPairs.add(`${pair.argument2}:${pair.argument3}`);
    }
    const strings = new Map(
      (program?.staticStrings ?? []).map(entry => [entry.pointer, entry.value]),
    );
    const archives = program?.operation013cArchivePairs ?? [];
    if (!Array.isArray(archives)) {
      throw new TypeError(
        "native operation 0x013c archive pairs must be an array",
      );
    }
    for (const pair of archives) {
      const path = strings.get(pair?.pathPointer);
      const name = strings.get(pair?.namePointer);
      if (typeof path !== "string" || typeof name !== "string") {
        throw new TypeError(
          "native operation 0x013c archive pair strings are unavailable",
        );
      }
      this.archiveDeclarations.add(resourceKey(path, name));
    }
    return pairs.length + archives.length;
  }

  acquireArchive({ path, name }) {
    const key = resourceKey(path, name);
    if (!this.archiveDeclarations.has(key)) {
      throw new Error(`native scene archive ${path}${name} is undeclared`);
    }
    const resource = Object.freeze({
      kind: "native-scene-precompiled-archive",
      key,
      path,
      name,
    });
    this.activeArchives.add(resource);
    return resource;
  }

  releaseArchive({ resource }) {
    if (!this.activeArchives.delete(resource)) {
      throw new Error("native scene archive is not active");
    }
    for (const record of this.archiveActivities.get(resource) ?? []) {
      this.activeRecords.delete(record);
    }
    this.archiveActivities.delete(resource);
    return true;
  }

  startArchiveActivity({ archive, firstIndex, secondIndex }) {
    if (!this.activeArchives.has(archive?.resource)) {
      throw new Error("native scene archive activity has no active archive");
    }
    const record = Object.freeze({
      kind: "native-scene-precompiled-archive-activity",
      archive: archive.resource,
      firstIndex,
      secondIndex,
    });
    this.activeRecords.add(record);
    if (!this.archiveActivities.has(archive.resource)) {
      this.archiveActivities.set(archive.resource, new Set());
    }
    this.archiveActivities.get(archive.resource).add(record);
    return {
      schema: NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
      record,
      // The canonical browser package is already extracted and resident when
      // its owner program begins; there is no asynchronous GD-ROM transfer.
      activityComplete: true,
    };
  }

  releaseRecord(record) {
    if (!this.activeRecords.delete(record)) {
      throw new Error("native scene resource record is not active");
    }
    return true;
  }

  queueMotionResource({
    path,
    name,
    resourceType,
    global,
    source = null,
  }) {
    if (resourceType !== "MOTI") {
      throw new TypeError("native motion resource type must be MOTI");
    }
    if (typeof global !== "boolean") {
      throw new TypeError("native motion resource scope must be Boolean");
    }
    const normalizedPath = requireString(path, "native motion resource path");
    const normalizedName = requireString(name, "native motion resource name");
    if (this.nextMotionRequestHandle > 0x7fffffff) {
      throw new RangeError("native motion resource handle space is exhausted");
    }
    const handle = this.nextMotionRequestHandle;
    this.nextMotionRequestHandle += 1;
    const resource = Object.freeze({
      kind: "native-motion-resource-request",
      handle,
      path: normalizedPath,
      name: normalizedName,
      resourceType,
      global,
      source,
    });
    this.motionRequests.set(handle, resource);
    return { handle, resource };
  }

  motionRequest(handle) {
    if (!Number.isSafeInteger(handle) || handle < 1) return null;
    return this.motionRequests.get(handle) ?? null;
  }

  queueHandMotionResource({
    path,
    name,
    resourceType,
    global,
    source = null,
  }) {
    if (resourceType !== "HNDM") {
      throw new TypeError("native hand-motion resource type must be HNDM");
    }
    if (global !== false) {
      throw new TypeError(
        "native hand-motion resource scope must be scene-local",
      );
    }
    const normalizedPath = requireString(
      path,
      "native hand-motion resource path",
    );
    const normalizedName = requireString(
      name,
      "native hand-motion resource name",
    );
    if (this.nextHandMotionRequestHandle > 0x7fffffff) {
      throw new RangeError(
        "native hand-motion resource handle space is exhausted",
      );
    }
    const handle = this.nextHandMotionRequestHandle;
    this.nextHandMotionRequestHandle += 1;
    const resource = Object.freeze({
      kind: "native-hand-motion-resource-request",
      handle,
      path: normalizedPath,
      name: normalizedName,
      resourceType,
      global,
      source,
    });
    this.handMotionRequests.set(handle, resource);
    return { handle, resource };
  }

  handMotionRequest(handle) {
    if (!Number.isSafeInteger(handle) || handle < 1) return null;
    return this.handMotionRequests.get(handle) ?? null;
  }

  initializeSceneScheduler(request) {
    const initialization = Object.freeze({
      ...request,
      path: requireString(request?.path, "native scene-scheduler path"),
      name: requireString(request?.name, "native scene-scheduler filename"),
    });
    this.sceneSchedulerInitializations.push(initialization);
    return { accepted: true, initialization };
  }

  queueScrollSpriteResource({ path, name, slotIndex, source = null }) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
      throw new RangeError("native SCRL resource slot must be between 0 and 2");
    }
    const resource = Object.freeze({
      kind: "native-scroll-sprite-resource",
      path: requireString(path, "native SCRL resource path"),
      name: requireString(name, "native SCRL resource name"),
      slotIndex,
      source,
    });
    this.scrollSpriteResources.set(slotIndex, resource);
    return { resource };
  }

  releaseScrollSpriteResource({ slotIndex, resource }) {
    const active = this.scrollSpriteResources.get(slotIndex);
    if (!active || (resource && active !== resource)) return false;
    this.scrollSpriteResources.delete(slotIndex);
    return true;
  }

  adapter() {
    return {
      createRecord: detail => this.createRecord(detail),
      releaseRecord: record => this.releaseRecord(record),
      acquireArchive: detail => this.acquireArchive(detail),
      releaseArchive: detail => this.releaseArchive(detail),
      startArchiveActivity: detail => this.startArchiveActivity(detail),
      queueNativeMotionResource: detail => this.queueMotionResource(detail),
      queueNativeHandMotionResource: detail => (
        this.queueHandMotionResource(detail)
      ),
      initializeSceneScheduler: detail => (
        this.initializeSceneScheduler(detail)
      ),
      queueNativeScrollSpriteResource: detail => (
        this.queueScrollSpriteResource(detail)
      ),
      releaseNativeScrollSpriteResource: detail => (
        this.releaseScrollSpriteResource(detail)
      ),
      prepareProgramRecords: program => this.prepareProgramRecords(program),
    };
  }
}

export function createNativeSceneResourceRegistry() {
  return new NativeSceneResourceRegistry();
}
