function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`native collection ${name} must be a byte`);
  }
  return value;
}

function requireBytes(values, length, name) {
  if (
    !Array.isArray(values)
    || values.length !== length
    || values.some(value => !Number.isInteger(value) || value < 0 || value > 0xff)
  ) {
    throw new TypeError(
      `native collection ${name} must contain ${length} bytes`,
    );
  }
  return Uint8Array.from(values);
}

export class NativeCollectionOperationState {
  constructor() {
    this.primaryBytes = undefined;
    this.auxiliaryRecords = undefined;
  }

  configurePrimaryBytes(values) {
    this.primaryBytes = requireBytes(values, 256, "primary storage");
  }

  configureAuxiliaryRecords(records) {
    if (!Array.isArray(records) || records.length !== 32) {
      throw new TypeError(
        "native collection auxiliary storage must contain 32 records",
      );
    }
    this.auxiliaryRecords = records.map((record, index) => ({
      valueByte: requireByte(record?.valueByte, `record ${index} value`),
      selectorByte: requireByte(
        record?.selectorByte,
        `record ${index} selector`,
      ),
    }));
  }

  planPrimaryIncrement({ index, quantity }) {
    if (!this.primaryBytes) {
      return {
        applied: false,
        reason: "native-collection-primary-state-unavailable",
      };
    }
    const signedIndex = (index << 16) >> 16;
    if (signedIndex < 0 || signedIndex >= 235) {
      return { applied: false, result: 0, reason: "index-out-of-range" };
    }
    const amount = quantity & 0xff;
    const sum = this.primaryBytes[signedIndex] + amount;
    return {
      applied: true,
      route: "primary",
      index: signedIndex,
      quantity: amount,
      value: sum > 0xff ? 0xff : sum,
      result: sum > 0xff ? 0 : 1,
      lowIndexPreparation: signedIndex < 67,
      specialCallback: (
        signedIndex === 51
          ? { kind: "fixed-route", argument0: 0, argument1: 0x7080 }
          : signedIndex === 85
            ? { kind: "registered-request", argument: 0x0321 }
            : signedIndex === 89 || signedIndex === 90
              ? { kind: "registered-request", argument: 0x0320 }
              : null
      ),
    };
  }

  commitPrimaryIncrement(plan) {
    if (!plan?.applied || plan.route !== "primary" || !this.primaryBytes) {
      throw new TypeError("native collection primary plan is invalid");
    }
    this.primaryBytes[plan.index] = plan.value;
  }

  planAuxiliaryIncrement({ index, quantity }) {
    if (!this.auxiliaryRecords) {
      return {
        applied: false,
        reason: "native-collection-auxiliary-state-unavailable",
      };
    }
    const signedIndex = (index << 24) >> 24;
    if (signedIndex < 0 || signedIndex >= 28) {
      return { applied: false, result: 0, reason: "index-out-of-range" };
    }
    let recordIndex = this.auxiliaryRecords.findIndex(
      record => ((record.selectorByte << 24) >> 24) === signedIndex,
    );
    if (recordIndex < 0) {
      recordIndex = this.auxiliaryRecords.findIndex(
        record => record.selectorByte === 0xff,
      );
    }
    if (recordIndex < 0) {
      return { applied: false, result: 0, reason: "record-unavailable" };
    }
    const record = this.auxiliaryRecords[recordIndex];
    const sum = record.valueByte + (quantity & 0xff);
    return {
      applied: true,
      route: "auxiliary",
      index: signedIndex,
      recordIndex,
      quantity: quantity & 0xff,
      value: sum >= 0xff ? 0xff : sum,
      selectorByte: signedIndex,
      result: 1,
    };
  }

  commitAuxiliaryIncrement(plan) {
    if (
      !plan?.applied
      || plan.route !== "auxiliary"
      || !this.auxiliaryRecords
    ) {
      throw new TypeError("native collection auxiliary plan is invalid");
    }
    const record = this.auxiliaryRecords[plan.recordIndex];
    record.valueByte = plan.value;
    record.selectorByte = plan.selectorByte & 0xff;
  }

  compactAuxiliaryRecords() {
    if (!this.auxiliaryRecords) {
      throw new Error("native collection auxiliary state is unavailable");
    }
    const populated = this.auxiliaryRecords.filter(
      record => record.valueByte > 0,
    );
    this.auxiliaryRecords = [
      ...populated,
      ...Array.from(
        { length: 32 - populated.length },
        () => ({ valueByte: 0, selectorByte: 0xff }),
      ),
    ];
  }

  queryPrimaryByte(index) {
    if (!this.primaryBytes) {
      throw new Error("native-collection-primary-state-unavailable");
    }
    const signedIndex = (index << 16) >> 16;
    if (signedIndex < 0 || signedIndex >= 235) return 0;
    return this.primaryBytes[signedIndex];
  }

  queryAuxiliaryByte(index) {
    if (!this.auxiliaryRecords) {
      throw new Error("native-collection-auxiliary-state-unavailable");
    }
    const signedIndex = (index << 24) >> 24;
    if (signedIndex < 0 || signedIndex > 28) return 0;
    const record = this.auxiliaryRecords.find(
      candidate => (
        ((candidate.selectorByte << 24) >> 24) === signedIndex
      ),
    );
    return record?.valueByte ?? 0;
  }

  readPrimaryByte(index) {
    return this.primaryBytes?.[index];
  }

  readAuxiliaryRecords() {
    return this.auxiliaryRecords?.map(record => ({ ...record }));
  }
}

export function createNativeCollectionOperationState() {
  return new NativeCollectionOperationState();
}

export function createNativeCollectionOperationSemanticHandlers({
  prepareLowCollectionIndex,
  invokeCollectionSpecialCallback,
  finalizePrimaryCollectionMutation,
  finalizeAuxiliaryCollectionMutation,
} = {}) {
  return {
    "native-collection-byte-query": async ({
      context,
      readArgument,
    }) => {
      const auxiliary = readArgument(1) !== 0;
      const query = auxiliary
        ? context.queryAuxiliaryCollectionByte
        : context.queryPrimaryCollectionByte;
      if (typeof query !== "function") {
        return {
          status: "stopped",
          reason: "native-collection-operation-state-missing",
        };
      }
      try {
        return { result: await query(readArgument(0)) };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "native-collection-byte-increment": async ({
      context,
      readArgument,
    }) => {
      const auxiliary = readArgument(3) !== 0;
      const planOperation = auxiliary
        ? context.planAuxiliaryCollectionIncrement
        : context.planPrimaryCollectionIncrement;
      const commitOperation = auxiliary
        ? context.commitAuxiliaryCollectionIncrement
        : context.commitPrimaryCollectionIncrement;
      if (
        typeof planOperation !== "function"
        || typeof commitOperation !== "function"
      ) {
        return {
          status: "stopped",
          reason: "native-collection-operation-state-missing",
        };
      }
      let plan;
      try {
        plan = await planOperation({
          index: readArgument(0),
          quantity: readArgument(1),
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (plan.reason?.endsWith("state-unavailable")) {
        return { status: "stopped", reason: plan.reason };
      }
      if (!plan.applied) return { result: plan.result, mutation: plan };

      const prepare = (
        prepareLowCollectionIndex
        || context.prepareLowCollectionIndex
      );
      const invokeSpecial = (
        invokeCollectionSpecialCallback
        || context.invokeCollectionSpecialCallback
      );
      const finalize = auxiliary
        ? (
            finalizeAuxiliaryCollectionMutation
            || context.finalizeAuxiliaryCollectionMutation
          )
        : (
            finalizePrimaryCollectionMutation
            || context.finalizePrimaryCollectionMutation
          );
      if (
        (!auxiliary && plan.lowIndexPreparation && typeof prepare !== "function")
        || (!auxiliary && plan.specialCallback && typeof invokeSpecial !== "function")
        || typeof finalize !== "function"
      ) {
        return {
          status: "stopped",
          reason: "native-collection-callback-adapter-missing",
        };
      }
      if (!auxiliary && plan.lowIndexPreparation) await prepare(plan.index);
      if (!auxiliary && plan.specialCallback) {
        await invokeSpecial(plan.specialCallback);
      }
      await commitOperation(plan);
      await finalize({ route: plan.route, index: plan.index });
      return { result: plan.result, mutation: plan };
    },
  };
}
