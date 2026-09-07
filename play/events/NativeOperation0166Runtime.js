function requireBit(value, name) {
  if (value !== 0 && value !== 1) {
    throw new RangeError(`native operation 0x0166 ${name} must be zero or one`);
  }
  return value;
}

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native operation 0x0166 record requires a four-character ID",
    );
  }
  return fourcc;
}

function requireResourceIdentity(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`native operation 0x0166 ${name} is unavailable`);
  }
  return value;
}

function tagArgument(action, readArgument, index) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(index);
  if (typeof value === "string") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native operation 0x0166 record tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeOperation0166State {
  constructor() {
    this.modeTwoControlDword = undefined;
    this.modeEightControlDword = undefined;
    this.modeTwoCleanupRequired = undefined;
    this.modeThirteenRecords = undefined;
    this.modeThirtyRecords = undefined;
    this.cleanupLists = undefined;
    this.actorLifecycleRecords = undefined;
    this.pendingActorAttachment = undefined;
    this.sceneSchedulerBootstrap = undefined;
    this.nextAttachmentToken = 1;
    this.revision = 0;
  }

  configureActorLifecycleRecords(records) {
    if (!Array.isArray(records)) {
      throw new TypeError(
        "native operation 0x0166 actor records must be an array",
      );
    }
    this.actorLifecycleRecords = new Map();
    for (const entry of records) {
      const actorTag = requireFourcc(entry.actorTag);
      if (this.actorLifecycleRecords.has(actorTag)) {
        throw new Error(
          `native operation 0x0166 duplicate actor record ${actorTag}`,
        );
      }
      const list = entry.list ?? "inactive";
      if (list !== "inactive" && list !== "active" && list !== "dynamic") {
        throw new RangeError(
          `native operation 0x0166 actor record list is invalid: ${list}`,
        );
      }
      const attachment = entry.attachment ?? 0;
      if (!Number.isSafeInteger(attachment) || attachment < 0) {
        throw new RangeError(
          "native operation 0x0166 actor attachment must be non-negative",
        );
      }
      this.actorLifecycleRecords.set(actorTag, {
        actorTag,
        list,
        enabled: entry.enabled === undefined ? list === "active" : Boolean(entry.enabled),
        attachment,
        bound: Boolean(entry.bound),
      });
    }
    this.pendingActorAttachment = undefined;
    this.nextAttachmentToken = 1;
    this.revision += 1;
    return this.readActorLifecycleRecords();
  }

  configureModeThirtyRecords(records) {
    if (!Array.isArray(records)) {
      throw new TypeError("native operation 0x0166 mode-thirty records must be an array");
    }
    const next = new Map();
    for (const record of records) {
      if (!Number.isInteger(record.key) || !Number.isInteger(record.state)) {
        throw new TypeError("native operation 0x0166 mode-thirty record is invalid");
      }
      const key = record.key >>> 0;
      if (next.has(key)) {
        throw new Error(`native operation 0x0166 duplicate mode-thirty key ${key}`);
      }
      next.set(key, record.state | 0);
    }
    this.modeThirtyRecords = next;
    this.revision += 1;
  }

  queryModeThirtyRecord(key) {
    if (!this.modeThirtyRecords) return undefined;
    const state = this.modeThirtyRecords.get(key >>> 0);
    return state === 2 ? 1 : 0;
  }

  planModeZero({ path, name, areaTag }) {
    return {
      applied: true,
      mode: 0,
      expectedRevision: this.revision,
      request: Object.freeze({
        path: requireResourceIdentity(path, "scheduler path"),
        name: requireResourceIdentity(name, "scheduler filename"),
        areaTag: requireFourcc(areaTag),
        nativeOwnerTagGlobal: 0x0c21bcb0,
        nativeStreamDirectoryTemplate: "scene/%02d/stream",
        nativeIndexName: "HUMANS.idx",
        nativeIndexType: "MOBJ",
      }),
    };
  }

  requireActorLifecycleRecords() {
    if (!this.actorLifecycleRecords) {
      throw new Error(
        "native operation 0x0166 actor-record state is unavailable",
      );
    }
    return this.actorLifecycleRecords;
  }

  activateActorRecord(actorTag, enabled) {
    const records = this.requireActorLifecycleRecords();
    const key = requireFourcc(actorTag);
    const record = records.get(key);
    if (!record) return { actorTag: key, matched: false };
    record.enabled = enabled !== 0;
    if (record.list === "inactive") record.list = "active";
    this.revision += 1;
    return {
      actorTag: key,
      matched: true,
      enabled: record.enabled,
      list: record.list,
    };
  }

  detachDynamicActorRecord(actorTag) {
    const records = this.requireActorLifecycleRecords();
    const key = requireFourcc(actorTag);
    const record = records.get(key);
    if (record?.list === "dynamic") {
      records.delete(key);
      this.revision += 1;
      return {
        actorTag: key,
        matched: true,
        attachment: record.attachment,
      };
    }
    const activation = this.activateActorRecord(key, 1);
    return {
      actorTag: key,
      matched: false,
      attachment: 0,
      activation,
    };
  }

  requestActorAttachment(actorTag) {
    const records = this.requireActorLifecycleRecords();
    const key = requireFourcc(actorTag);
    const record = records.get(key);
    if (!record || record.list !== "active") {
      return { actorTag: key, available: false, result: 0 };
    }
    const token = this.nextAttachmentToken;
    this.nextAttachmentToken += 1;
    this.pendingActorAttachment = { actorTag: key, token };
    this.revision += 1;
    return { actorTag: key, available: true, token, result: token };
  }

  bindPendingActorAttachment(token) {
    this.requireActorLifecycleRecords();
    if (!Number.isSafeInteger(token) || token <= 0) {
      throw new RangeError(
        "native operation 0x0166 attachment token must be positive",
      );
    }
    const pending = this.pendingActorAttachment;
    if (!pending || pending.token !== token) {
      return { matched: false, ready: false, result: 0 };
    }
    const record = this.actorLifecycleRecords.get(pending.actorTag);
    if (!record || record.list !== "active") {
      return { matched: false, ready: false, result: 0 };
    }
    record.attachment = token;
    record.bound = true;
    this.pendingActorAttachment = undefined;
    this.revision += 1;
    return {
      actorTag: record.actorTag,
      matched: true,
      ready: true,
      attachment: token,
      result: 1,
    };
  }

  releaseActorAttachment(attachment) {
    const records = this.requireActorLifecycleRecords();
    if (!Number.isSafeInteger(attachment) || attachment < 0) {
      throw new RangeError(
        "native operation 0x0166 attachment must be non-negative",
      );
    }
    const record = [...records.values()].find(
      candidate => candidate.attachment === attachment,
    );
    if (!record) return { matched: false, attachment };
    record.attachment = 0;
    record.bound = false;
    this.revision += 1;
    return { matched: true, actorTag: record.actorTag, attachment };
  }

  readActorLifecycleRecords() {
    if (!this.actorLifecycleRecords) return undefined;
    return [...this.actorLifecycleRecords.values()].map(record => ({
      ...record,
    }));
  }

  configureControl({
    modeTwoControlDword,
    modeEightControlDword,
    modeTwoCleanupRequired,
  }) {
    if (typeof modeTwoCleanupRequired !== "boolean") {
      throw new TypeError(
        "native operation 0x0166 cleanup requirement must be boolean",
      );
    }
    this.modeTwoControlDword = requireBit(
      modeTwoControlDword,
      "mode-two control dword",
    );
    this.modeEightControlDword = requireBit(
      modeEightControlDword,
      "mode-eight control dword",
    );
    this.modeTwoCleanupRequired = modeTwoCleanupRequired;
    this.revision += 1;
  }

  configureModeThirteenRecords(records) {
    if (!Array.isArray(records)) {
      throw new TypeError(
        "native operation 0x0166 mode-thirteen records must be an array",
      );
    }
    this.modeThirteenRecords = records.map(({ objectTag, field90 = 0 }) => {
      if (!Number.isInteger(field90)) {
        throw new TypeError(
          "native operation 0x0166 record +0x90 must be an integer",
        );
      }
      return {
        objectTag: requireFourcc(objectTag),
        field90: field90 >>> 0,
      };
    });
    this.revision += 1;
  }

  configureCleanupLists({
    modeTwoLinkedRecordCount = 0,
    modeThreeFirstListCount = 0,
    modeThreeSecondListCount = 0,
    modeEighteenFirstListCount = 0,
    modeEighteenSecondListCount = 0,
  } = {}) {
    const entries = {
      modeTwoLinkedRecordCount,
      modeThreeFirstListCount,
      modeThreeSecondListCount,
      modeEighteenFirstListCount,
      modeEighteenSecondListCount,
    };
    for (const [name, value] of Object.entries(entries)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(
          `native operation 0x0166 ${name} must be non-negative`,
        );
      }
    }
    this.cleanupLists = { ...entries };
    this.modeTwoCleanupRequired = modeTwoLinkedRecordCount > 0;
    this.revision += 1;
    return this.readCleanupLists();
  }

  requireCleanupLists() {
    if (!this.cleanupLists) {
      throw new Error(
        "native operation 0x0166 cleanup-list state is unavailable",
      );
    }
    return this.cleanupLists;
  }

  clearModeTwoLinkedRecords() {
    const lists = this.requireCleanupLists();
    const released = lists.modeTwoLinkedRecordCount;
    lists.modeTwoLinkedRecordCount = 0;
    this.modeTwoCleanupRequired = false;
    return { released };
  }

  releaseModeThreeLists() {
    const lists = this.requireCleanupLists();
    const released = {
      first: lists.modeThreeFirstListCount,
      second: lists.modeThreeSecondListCount,
    };
    lists.modeThreeFirstListCount = 0;
    lists.modeThreeSecondListCount = 0;
    return released;
  }

  releaseModeEighteenLists() {
    const lists = this.requireCleanupLists();
    const released = {
      first: lists.modeEighteenFirstListCount,
      second: lists.modeEighteenSecondListCount,
    };
    lists.modeEighteenFirstListCount = 0;
    lists.modeEighteenSecondListCount = 0;
    return released;
  }

  planModeTwo(value) {
    if (
      this.modeTwoControlDword === undefined
      || this.modeTwoCleanupRequired === undefined
    ) {
      return {
        applied: false,
        reason: "native-operation-0166-control-state-unavailable",
      };
    }
    const nextValue = value === 0 ? 0 : 1;
    return {
      applied: true,
      mode: 2,
      expectedRevision: this.revision,
      value: nextValue,
      cleanupRequired: (
        nextValue === 0 && this.modeTwoCleanupRequired
      ),
    };
  }

  planModeEight(value) {
    if (this.modeEightControlDword === undefined) {
      return {
        applied: false,
        reason: "native-operation-0166-control-state-unavailable",
      };
    }
    const nextValue = value === 0 ? 0 : 1;
    return {
      applied: true,
      mode: 8,
      expectedRevision: this.revision,
      value: nextValue,
      enableCallbackRequired: (
        this.modeEightControlDword === 0 && nextValue === 1
      ),
    };
  }

  planModeThirteen({ objectTag, value }) {
    if (!this.modeThirteenRecords) {
      return {
        applied: false,
        reason: "native-operation-0166-record-state-unavailable",
      };
    }
    if (!Number.isInteger(value)) {
      throw new TypeError(
        "native operation 0x0166 mode-thirteen value must be an integer",
      );
    }
    const key = requireFourcc(objectTag);
    const index = this.modeThirteenRecords.findIndex(
      record => record.objectTag === key,
    );
    if (index < 0) {
      return { applied: false, mode: 13, objectTag: key, result: 0 };
    }
    return {
      applied: true,
      mode: 13,
      objectTag: key,
      index,
      value: value >>> 0,
      result: 1,
      expectedRevision: this.revision,
    };
  }

  commit(plan) {
    if (!plan?.applied) return;
    if (plan.expectedRevision !== this.revision) {
      throw new Error("native operation 0x0166 state changed before commit");
    }
    if (plan.mode === 0) this.sceneSchedulerBootstrap = plan.request;
    else if (plan.mode === 2) this.modeTwoControlDword = plan.value;
    else if (plan.mode === 8) this.modeEightControlDword = plan.value;
    else if (plan.mode === 13) {
      this.modeThirteenRecords[plan.index].field90 = plan.value;
    } else {
      throw new Error("native operation 0x0166 commit mode is unsupported");
    }
    this.revision += 1;
  }

  readControl() {
    return {
      modeTwoControlDword: this.modeTwoControlDword,
      modeEightControlDword: this.modeEightControlDword,
      modeTwoCleanupRequired: this.modeTwoCleanupRequired,
    };
  }

  readSceneSchedulerBootstrap() {
    return this.sceneSchedulerBootstrap
      ? { ...this.sceneSchedulerBootstrap }
      : undefined;
  }

  readModeThirteenRecords() {
    return this.modeThirteenRecords?.map(record => ({ ...record }));
  }

  readCleanupLists() {
    return this.cleanupLists ? { ...this.cleanupLists } : undefined;
  }
}

export function createNativeOperation0166State() {
  return new NativeOperation0166State();
}

export function createNativeOperation0166SemanticHandlers({
  initializeSceneScheduler,
  releaseModeThreeLists,
  releaseModeEighteenLists,
  clearModeTwoLinkedRecords,
  notifyModeEightEnabled,
} = {}) {
  return {
    "native-operation-0166-mode-28-global-clear": async ({
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 28) {
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-unproved",
        };
      }
      const write = context.writeNativeOperation0166Mode28GlobalDword;
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-28-global-writer-missing",
        };
      }
      const previous = await write(0);
      return {
        status: "continued",
        result: 0,
        mutation: { mode: 28, previous, value: 0 },
      };
    },
    "native-operation-0166-mode-29-bounded-poll": async ({
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 29) {
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-unproved",
        };
      }
      const plan = context.planNativeOperation0166Mode29Poll?.();
      if (!plan?.applied) {
        return {
          status: "stopped",
          reason: plan?.reason || "native-operation-0166-mode-29-counter-unavailable",
        };
      }
      let activeDword;
      if (plan.requiresActiveDword) {
        const read = context.readNativeOperation0166Mode29ActiveDword;
        if (typeof read !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-0166-mode-29-active-dword-reader-missing",
          };
        }
        activeDword = await read();
        if (!Number.isInteger(activeDword)) {
          return {
            status: "stopped",
            reason: "native-operation-0166-mode-29-active-dword-unavailable",
          };
        }
      }
      const mutation = context.commitNativeOperation0166Mode29Poll?.({
        ...plan,
        activeDword,
      });
      if (!mutation) {
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-29-counter-writer-missing",
        };
      }
      return { status: "continued", result: mutation.result, mutation };
    },
    "native-operation-0166-mode-30-record-state-query": async ({
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 30) {
        return { status: "stopped", reason: "native-operation-0166-mode-unproved" };
      }
      const key = readArgument(1);
      if (!Number.isInteger(key)) {
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-30-record-key-unavailable",
        };
      }
      if ((key >>> 0) === 0x524f4f44) {
        return { status: "continued", result: 1, query: { mode: 30, key: key >>> 0 } };
      }
      const result = context.nativeOperation0166State?.queryModeThirtyRecord(key);
      if (result === undefined) {
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-30-record-state-unavailable",
        };
      }
      return { status: "continued", result, query: { mode: 30, key: key >>> 0 } };
    },
    "native-operation-0166-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      const planState = context.nativeOperation0166State;
      try {
        if (mode === 0) {
          if (!planState || typeof planState.commit !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-0166-control-state-unavailable",
            };
          }
          if (
            action.arguments?.[1]?.kind !== "static-pointer"
            || action.arguments?.[2]?.kind !== "static-pointer"
          ) {
            return {
              status: "stopped",
              reason: "native-operation-0166-mode-zero-resource-shape-unproved",
            };
          }
          const resolveStaticString = context.resolveNativeStaticString;
          if (typeof resolveStaticString !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-0166-static-string-resolver-missing",
            };
          }
          const plan = planState.planModeZero({
            path: resolveStaticString(readArgument(1)),
            name: resolveStaticString(readArgument(2)),
            areaTag: tagArgument(action, readArgument, 3),
          });
          const initialize = (
            initializeSceneScheduler
            || context.initializeNativeOperation0166SceneScheduler
          );
          if (typeof initialize !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-0166-scene-scheduler-initializer-missing",
            };
          }
          const initialized = await initialize(plan.request);
          if (initialized === undefined || initialized === false) {
            return {
              status: "stopped",
              reason: "native-operation-0166-scene-scheduler-initialization-rejected",
            };
          }
          planState.commit(plan);
          return {
            result: 1,
            mutation: { mode, request: plan.request },
          };
        }
        if (mode === 2 || mode === 8 || mode === 13) {
          if (!planState || typeof planState.commit !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-0166-control-state-unavailable",
            };
          }
          let plan;
          if (mode === 2) {
            plan = planState.planModeTwo(readArgument(1));
            if (plan.cleanupRequired) {
              const cleanup = (
                clearModeTwoLinkedRecords
                || context.clearNativeOperation0166ModeTwoLinkedRecords
              );
              if (typeof cleanup !== "function") {
                return {
                  status: "stopped",
                  reason: "native-operation-0166-mode-two-cleanup-missing",
                };
              }
              await cleanup();
            }
          } else if (mode === 8) {
            plan = planState.planModeEight(readArgument(1));
            if (plan.enableCallbackRequired) {
              const notify = (
                notifyModeEightEnabled
                || context.notifyNativeOperation0166ModeEightEnabled
              );
              if (typeof notify !== "function") {
                return {
                  status: "stopped",
                  reason: "native-operation-0166-mode-eight-callback-missing",
                };
              }
              await notify(1);
            }
          } else {
            plan = planState.planModeThirteen({
              objectTag: tagArgument(action, readArgument, 1),
              value: readArgument(2),
            });
          }
          if (plan.reason) return { status: "stopped", reason: plan.reason };
          if (plan.applied) planState.commit(plan);
          return {
            result: mode === 13 ? plan.result : 1,
            mutation: plan,
          };
        }

        const releaseThree = (
          releaseModeThreeLists
          || context.releaseNativeOperation0166ModeThreeLists
        );
        if (mode === 3) {
          if (typeof releaseThree !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-0166-mode-three-adapter-missing",
            };
          }
          await releaseThree();
          return { result: 1, mutation: { mode } };
        }
        if (mode === 18) {
          const releaseEighteen = (
            releaseModeEighteenLists
            || context.releaseNativeOperation0166ModeEighteenLists
          );
          if (
            typeof releaseThree !== "function"
            || typeof releaseEighteen !== "function"
          ) {
            return {
              status: "stopped",
              reason: "native-operation-0166-mode-eighteen-adapter-missing",
            };
          }
          await releaseThree();
          await releaseEighteen();
          return { result: 1, mutation: { mode } };
        }
        if (mode === 4) {
          if (!planState) {
            return {
              status: "stopped",
              reason: "native-operation-0166-actor-record-state-unavailable",
            };
          }
          const mutation = planState.activateActorRecord(
            tagArgument(action, readArgument, 1),
            readArgument(2),
          );
          return { result: 1, mutation: { mode, ...mutation } };
        }
        if (mode === 5) {
          if (!planState) {
            return {
              status: "stopped",
              reason: "native-operation-0166-actor-record-state-unavailable",
            };
          }
          const mutation = planState.requestActorAttachment(
            tagArgument(action, readArgument, 1),
          );
          return { result: mutation.result, mutation: { mode, ...mutation } };
        }
        if (mode === 6) {
          if (!planState) {
            return {
              status: "stopped",
              reason: "native-operation-0166-actor-record-state-unavailable",
            };
          }
          const mutation = planState.bindPendingActorAttachment(
            readArgument(1),
          );
          return { result: mutation.result, mutation: { mode, ...mutation } };
        }
        if (mode === 7) {
          if (!planState) {
            return {
              status: "stopped",
              reason: "native-operation-0166-actor-record-state-unavailable",
            };
          }
          const mutation = planState.releaseActorAttachment(readArgument(1));
          return { result: 1, mutation: { mode, ...mutation } };
        }
        if (mode === 27) {
          if (!planState) {
            return {
              status: "stopped",
              reason: "native-operation-0166-actor-record-state-unavailable",
            };
          }
          const mutation = planState.detachDynamicActorRecord(
            tagArgument(action, readArgument, 1),
          );
          return { result: mutation.attachment, mutation: { mode, ...mutation } };
        }
        return {
          status: "stopped",
          reason: "native-operation-0166-mode-unproved",
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
