function requireWord(value, label) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value | 0;
}

function requirePointer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative pointer`);
  }
  return value;
}

export const NATIVE_OPERATION_013C_RECORD_LIFECYCLE = (
  "native-operation-013c-record-lifecycle-v1"
);

function createdRecordResult(value) {
  if (
    value?.schema !== NATIVE_OPERATION_013C_RECORD_LIFECYCLE
  ) {
    return { record: value, activityComplete: false };
  }
  if (typeof value.activityComplete !== "boolean") {
    throw new TypeError(
      "operation 0x013c lifecycle completion must be Boolean",
    );
  }
  return {
    record: value.record,
    activityComplete: value.activityComplete,
  };
}

export class NativeOperation013cState {
  constructor() {
    this.clear();
  }

  clear() {
    this.word08 = undefined;
    this.record52 = null;
    this.record56 = null;
    this.record60 = null;
    this.record64 = null;
    this.word68 = undefined;
    this.platformWord72 = undefined;
    this.platformActivity = false;
    this.recordsBySourcePointer = new Map();
    this.archiveRecords = Array(4).fill(null);
    this.archiveActivities = new Map();
  }

  archiveRecord(path, name) {
    return this.archiveRecords.find(
      entry => entry?.path === path && entry.name === name,
    ) ?? null;
  }

  retainArchiveRecord(entry) {
    if (!this.archiveRecords.includes(entry)) {
      throw new Error("operation 0x013c archive record is not active");
    }
    entry.referenceCount += 1;
    return entry.record;
  }

  installArchiveRecord({ path, name, resource }) {
    const occupiedCount = this.archiveRecords.filter(Boolean).length;
    if (occupiedCount >= 4) return null;
    const slot = this.archiveRecords.findIndex(entry => entry === null);
    const record = Object.freeze({
      kind: "native-operation-013c-archive-record",
      slot,
      path,
      name,
    });
    const entry = {
      path,
      name,
      record,
      resource,
      referenceCount: 1,
    };
    this.archiveRecords[slot] = entry;
    return record;
  }

  archiveEntry(record) {
    return this.archiveRecords.find(entry => entry?.record === record) ?? null;
  }

  planArchiveRelease(record) {
    const entry = this.archiveEntry(record);
    if (!entry) return null;
    return {
      entry,
      remainingReferenceCount: entry.referenceCount - 1,
      releasesResource: entry.referenceCount === 1,
    };
  }

  commitArchiveRelease(plan) {
    if (!plan || !this.archiveRecords.includes(plan.entry)) {
      throw new Error("operation 0x013c archive release plan is stale");
    }
    if (plan.releasesResource) {
      const index = this.archiveRecords.indexOf(plan.entry);
      this.archiveRecords[index] = null;
      for (const [key, activity] of this.archiveActivities) {
        if (activity.archiveRecord === plan.entry.record) {
          this.archiveActivities.delete(key);
        }
      }
    } else {
      plan.entry.referenceCount = plan.remainingReferenceCount;
    }
    return plan.remainingReferenceCount;
  }

  archiveActivityKey(archiveRecord, firstIndex, secondIndex) {
    const entry = this.archiveEntry(archiveRecord);
    if (!entry) return null;
    return `${entry.record.slot}:${firstIndex | 0}:${secondIndex | 0}`;
  }

  resolveArchiveActivity(archiveRecord, firstIndex, secondIndex) {
    const key = this.archiveActivityKey(
      archiveRecord,
      firstIndex,
      secondIndex,
    );
    return key === null ? null : this.archiveActivities.get(key)?.record ?? null;
  }

  commitArchiveActivity({
    archiveRecord,
    firstIndex,
    secondIndex,
    record,
  }) {
    const key = this.archiveActivityKey(
      archiveRecord,
      firstIndex,
      secondIndex,
    );
    if (key === null) {
      throw new Error("operation 0x013c archive record is unavailable");
    }
    if (record === undefined || record === null) {
      throw new TypeError("operation 0x013c archive activity record is required");
    }
    this.archiveActivities.set(key, {
      archiveRecord,
      firstIndex: firstIndex | 0,
      secondIndex: secondIndex | 0,
      record,
    });
    this.record56 = record;
    return record;
  }

  configureRecord({
    sourcePointer,
    record,
    word04,
    eligibleForOffset52 = false,
  }) {
    const pointer = requirePointer(
      sourcePointer,
      "operation 0x013c record source",
    );
    if (record === undefined || record === null) {
      throw new TypeError("operation 0x013c record identity is required");
    }
    if (word04 !== undefined) {
      requireWord(word04, "operation 0x013c record dword +0x04");
    }
    if (typeof eligibleForOffset52 !== "boolean") {
      throw new TypeError(
        "operation 0x013c offset-52 eligibility must be Boolean",
      );
    }
    this.recordsBySourcePointer.set(pointer, {
      record,
      word04: word04 === undefined ? undefined : word04 | 0,
      eligibleForOffset52,
    });
    return record;
  }

  resolveRecord(sourcePointer) {
    return this.recordsBySourcePointer.get(
      requirePointer(sourcePointer, "operation 0x013c record source"),
    )?.record ?? null;
  }

  writeWord08(value) {
    this.word08 = requireWord(value, "operation 0x013c container dword +0x08");
    return this.word08;
  }

  writePlatformWord72(value) {
    const word = requireWord(
      value,
      "operation 0x013c platform dword +0x48",
    );
    this.platformWord72 = word === 0 ? 3000 : word;
    return this.platformWord72;
  }

  installResolvedRecord52(record) {
    const configured = [...this.recordsBySourcePointer.values()].find(
      candidate => candidate.record === record,
    );
    if (
      !configured
      || !configured.eligibleForOffset52
      || !configured.word04
    ) {
      return {
        applied: false,
        reason: "operation-013c-record-ineligible-for-offset-52",
      };
    }
    this.record52 = record;
    return {
      applied: true,
      field: "record52",
      record,
    };
  }

  prepareRecordCreate() {
    this.word68 = 0;
  }

  commitCreatedRecord(sourcePointer, record) {
    if (record === undefined || record === null) return false;
    this.recordsBySourcePointer.set(
      requirePointer(sourcePointer, "operation 0x013c created-record source"),
      {
        record,
        word04: undefined,
        eligibleForOffset52: false,
      },
    );
    this.record56 = record;
    return true;
  }

  completeCreatedRecordActivity(record) {
    if (this.record56 !== record) return false;
    this.record56 = null;
    return true;
  }

  commitReleasedRecord(record) {
    const clearedRecord52 = this.record52 === record;
    if (clearedRecord52) this.record52 = null;
    for (const [pointer, configured] of this.recordsBySourcePointer) {
      if (configured.record === record) {
        this.recordsBySourcePointer.delete(pointer);
      }
    }
    return {
      releasedRecord: record,
      clearedRecord52,
    };
  }

  configureContainerRecords({
    record52,
    record56,
    record60,
    record64,
    word68,
  } = {}) {
    if (word68 !== undefined) {
      this.word68 = requireWord(
        word68,
        "operation 0x013c container dword +0x44",
      );
    }
    for (const [field, value] of Object.entries({
      record52,
      record56,
      record60,
      record64,
    })) {
      if (value !== undefined) this[field] = value;
    }
    return this.readContainer();
  }

  hasInternalActivity() {
    return (
      this.record56 !== null
      || this.record60 !== null
      || this.record64 !== null
    );
  }

  configurePlatformActivity(active) {
    if (typeof active !== "boolean") {
      throw new TypeError(
        "operation 0x013c platform activity must be Boolean",
      );
    }
    this.platformActivity = active;
    return this.platformActivity;
  }

  queryPlatformActivity() {
    return this.platformActivity;
  }

  readContainer() {
    return {
      word08: this.word08,
      record52: this.record52,
      record56: this.record56,
      record60: this.record60,
      record64: this.record64,
      word68: this.word68,
      platformWord72: this.platformWord72,
    };
  }
}

export function createNativeOperation013cSemanticHandlers({
  resolveRecord,
  createRecord,
  releaseRecord,
  queryPlatformActivity,
  acquireArchive,
  releaseArchive,
  startArchiveActivity,
} = {}) {
  return {
    "native-operation-013c-container-control": async ({
      context,
      readArgument,
    }) => {
      const majorRoute = readArgument(0);
      const selector = readArgument(1);
      const resolve = (
        resolveRecord || context.resolveNativeOperation013cRecord
      );
      const state = context.nativeOperation013cState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-operation-013c-state-missing",
        };
      }

      if (majorRoute === 1 && selector === 0) {
        const resolveStaticString = context.resolveNativeStaticString;
        if (typeof resolveStaticString !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-013c-static-string-resolver-missing",
          };
        }
        const path = resolveStaticString(readArgument(2));
        const name = resolveStaticString(readArgument(3));
        if (typeof path !== "string" || typeof name !== "string") {
          return {
            status: "stopped",
            reason: "native-operation-013c-archive-identity-unavailable",
          };
        }
        const existing = state.archiveRecord(path, name);
        if (existing) {
          return { result: state.retainArchiveRecord(existing) };
        }
        if (state.archiveRecords.every(Boolean)) return { result: 0 };
        const acquire = (
          acquireArchive || context.acquireNativeOperation013cArchive
        );
        if (typeof acquire !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-013c-archive-acquirer-missing",
          };
        }
        const resource = await acquire({ path, name });
        if (resource === undefined || resource === null || resource === false) {
          return { result: 0 };
        }
        return {
          result: state.installArchiveRecord({ path, name, resource }),
        };
      }

      if (majorRoute === 1 && selector === 1) {
        const record = readArgument(2);
        const plan = state.planArchiveRelease(record);
        if (!plan) return { result: 0 };
        if (plan.releasesResource) {
          const release = (
            releaseArchive || context.releaseNativeOperation013cArchive
          );
          if (typeof release !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-013c-archive-releaser-missing",
            };
          }
          await release({
            path: plan.entry.path,
            name: plan.entry.name,
            resource: plan.entry.resource,
          });
        }
        return { result: state.commitArchiveRelease(plan) };
      }

      if (majorRoute === 2 && selector === 1) {
        return {
          status: "continued",
          mutation: {
            field: "word08",
            value: state.writeWord08(readArgument(2)),
          },
        };
      }

      if (majorRoute === 0 && selector === 2) {
        if (state.hasInternalActivity()) return { result: 1 };
        const query = (
          queryPlatformActivity || context.queryNativeOperation013cActivity
        );
        if (typeof query !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-013c-platform-query-missing",
          };
        }
        const active = await query();
        if (typeof active !== "boolean") {
          return {
            status: "stopped",
            reason: "native-operation-013c-platform-query-invalid",
          };
        }
        return { result: active ? 1 : 0 };
      }

      if (majorRoute === 0 && selector === 8) {
        const archiveRecord = readArgument(2);
        const firstIndex = requireWord(
          readArgument(3),
          "operation 0x013c archive activity first index",
        );
        const secondIndex = requireWord(
          readArgument(4),
          "operation 0x013c archive activity second index",
        );
        if (!state.archiveEntry(archiveRecord)) return { result: 0 };
        if (
          state.resolveArchiveActivity(
            archiveRecord,
            firstIndex,
            secondIndex,
          ) !== null
          || state.record56 !== null
        ) {
          return { result: 0 };
        }
        const start = (
          startArchiveActivity
          || context.startNativeOperation013cArchiveActivity
        );
        if (typeof start !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-013c-archive-activity-starter-missing",
          };
        }
        const created = createdRecordResult(await start({
          archive: state.archiveEntry(archiveRecord),
          firstIndex,
          secondIndex,
        }));
        state.commitArchiveActivity({
          archiveRecord,
          firstIndex,
          secondIndex,
          record: created.record,
        });
        const activityCompleted = (
          created.activityComplete
          && state.completeCreatedRecordActivity(created.record)
        );
        return {
          result: 1,
          mutation: {
            archiveActivityStarted: true,
            activityCompleted,
          },
        };
      }

      if (majorRoute === 0 && selector === 10) {
        return {
          status: "continued",
          mutation: {
            field: "platformWord72",
            value: state.writePlatformWord72(readArgument(2)),
          },
        };
      }

      if (typeof resolve !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-013c-record-resolver-missing",
        };
      }

      if (majorRoute === 0 && selector === 5) {
        return {
          result: (await resolve(readArgument(2))) == null ? 0 : 1,
        };
      }

      if (majorRoute === 0 && selector === 0) {
        const argument2 = readArgument(2);
        const argument3 = readArgument(3);
        if ((await resolve(argument3)) != null) return { result: 0 };
        const create = createRecord || context.createNativeOperation013cRecord;
        if (typeof create !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-013c-record-creator-missing",
          };
        }
        state.prepareRecordCreate();
        const resolveStaticString = context.resolveNativeStaticString;
        const created = createdRecordResult(await create({
          argument2,
          argument3,
          ...(typeof resolveStaticString === "function"
            ? {
                argument2String: resolveStaticString(argument2),
                argument3String: resolveStaticString(argument3),
              }
            : {}),
        }));
        const committed = state.commitCreatedRecord(
          argument3,
          created.record,
        );
        const activityCompleted = (
          committed
          && created.activityComplete
          && state.completeCreatedRecordActivity(created.record)
        );
        return {
          result: committed ? 1 : 0,
          mutation: {
            recordCreated: committed,
            activityCompleted,
          },
        };
      }

      const record = await resolve(readArgument(2));
      if (majorRoute === 0 && selector === 6) {
        if (record == null) {
          return {
            status: "continued",
            mutation: { released: false },
          };
        }
        const release = (
          releaseRecord || context.releaseNativeOperation013cRecord
        );
        if (typeof release !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-013c-record-releaser-missing",
          };
        }
        await release(record);
        return {
          status: "continued",
          mutation: {
            released: true,
            ...state.commitReleasedRecord(record),
          },
        };
      }

      if (majorRoute === 2 && selector === 2) {
        if (record == null) {
          return {
            status: "continued",
            mutation: {
              applied: false,
              reason: "operation-013c-record-not-found",
            },
          };
        }
        return {
          status: "continued",
          mutation: state.installResolvedRecord52(record),
        };
      }

      if (majorRoute === 2 && selector === 3) {
        return { result: record !== null && state.record52 === record ? 1 : 0 };
      }

      return {
        status: "stopped",
        reason: "native-operation-013c-route-unproved",
      };
    },
  };
}

export function createNativeOperation013cState() {
  return new NativeOperation013cState();
}
