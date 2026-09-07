function requireDword(value, label) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

const RECORD_COUNT = 32;

function requireVectorWords(value) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError(
      "native fixed record position must contain three integer words",
    );
  }
  return value.map((word, index) => requireDword(
    word,
    `native fixed record position word ${index}`,
  ));
}

export class NativeOperation0120State {
  constructor() {
    this.records = undefined;
    this.modeTwoRecords = undefined;
    this.revision = 0;
  }

  configureRecords(records) {
    if (!Array.isArray(records) || records.length !== RECORD_COUNT) {
      throw new RangeError(
        "native operation 0x0120 requires exactly 32 fixed records",
      );
    }
    this.records = records.map(({ word00, word08 = 0 }, index) => ({
      word00: requireDword(
        word00,
        `native operation 0x0120 record ${index} dword +0x00`,
      ),
      word08: requireDword(
        word08,
        `native operation 0x0120 record ${index} dword +0x08`,
      ),
    }));
    this.revision += 1;
    return this.readRecords();
  }

  configureModeTwoRecords(records) {
    if (!Array.isArray(records) || records.length !== RECORD_COUNT) {
      throw new RangeError(
        "native operation 0x0120 mode two requires exactly 32 fixed records",
      );
    }
    this.modeTwoRecords = records.map(({
      positionWords1c = [0, 0, 0],
      word28 = 0,
      word34 = 0,
    }, index) => ({
      positionWords1c: requireVectorWords(positionWords1c),
      word28: requireDword(
        word28,
        `native fixed record ${index} dword +0x28`,
      ),
      word34: requireDword(
        word34,
        `native operation 0x0120 mode-two record ${index} dword +0x34`,
      ),
    }));
    this.revision += 1;
    return this.readModeTwoRecords();
  }

  planModeZero(value) {
    if (!this.records) {
      return {
        applied: false,
        reason: "native-operation-0120-record-table-unavailable",
      };
    }
    const word = requireDword(
      value,
      "native operation 0x0120 mode-zero value",
    );
    return {
      applied: true,
      mode: 0,
      result: 0,
      expectedRevision: this.revision,
      value: word,
      records: this.records.map(record => ({
        word00: record.word00,
        word08: record.word00 === 0 ? 0 : word,
      })),
    };
  }

  planModeOne(index, value) {
    if (!this.records) {
      return {
        applied: false,
        reason: "native-operation-0120-record-table-unavailable",
      };
    }
    if (!Number.isInteger(index) || index < 0 || index >= RECORD_COUNT) {
      throw new RangeError(
        "native operation 0x0120 mode-one index must be between 0 and 31",
      );
    }
    const word = requireDword(
      value,
      "native operation 0x0120 mode-one value",
    );
    const records = this.records.map(record => ({ ...record }));
    const result = records[index].word08;
    records[index].word08 = records[index].word00 === 0 ? 0 : word;
    return {
      applied: true,
      mode: 1,
      expectedRevision: this.revision,
      index,
      value: word,
      result,
      records,
    };
  }

  planModeTwo(index, value) {
    if (!this.modeTwoRecords) {
      return {
        applied: false,
        reason: "native-operation-0120-mode-two-table-unavailable",
      };
    }
    if (!Number.isInteger(index) || index < 0 || index >= RECORD_COUNT) {
      throw new RangeError(
        "native operation 0x0120 mode-two index must be between 0 and 31",
      );
    }
    const word = requireDword(
      value,
      "native operation 0x0120 mode-two value",
    );
    const records = this.modeTwoRecords.map(record => ({ ...record }));
    const result = records[index].word34;
    records[index].word34 = word;
    return {
      applied: true,
      mode: 2,
      expectedRevision: this.revision,
      index,
      value: word,
      result,
      records,
    };
  }

  planFixedRecordPose(index, positionWords1c, word28) {
    if (!this.modeTwoRecords) {
      return {
        applied: false,
        reason: "native-fixed-record-table-unavailable",
      };
    }
    if (!Number.isInteger(index) || index < 0 || index >= RECORD_COUNT) {
      throw new RangeError(
        "native fixed record index must be between 0 and 31",
      );
    }
    const records = this.modeTwoRecords.map(record => ({
      ...record,
      positionWords1c: [...record.positionWords1c],
    }));
    records[index].positionWords1c = requireVectorWords(positionWords1c);
    records[index].word28 = requireDword(
      word28,
      "native fixed record dword +0x28",
    );
    return {
      applied: true,
      mode: "fixed-record-pose",
      expectedRevision: this.revision,
      index,
      records,
    };
  }

  commit(plan) {
    if (
      !plan?.applied
      || ![0, 1, 2, "fixed-record-pose"].includes(plan.mode)
    ) {
      throw new TypeError("native operation 0x0120 state plan is required");
    }
    if (plan.expectedRevision !== this.revision) {
      throw new Error("native operation 0x0120 state changed before commit");
    }
    if (plan.mode === 2 || plan.mode === "fixed-record-pose") {
      this.modeTwoRecords = plan.records.map(record => ({
        ...record,
        positionWords1c: [...record.positionWords1c],
      }));
    } else {
      this.records = plan.records.map(record => ({ ...record }));
    }
    this.revision += 1;
    return this.readRecords();
  }

  readRecords() {
    return this.records?.map(record => ({ ...record }));
  }

  readModeTwoRecords() {
    return this.modeTwoRecords?.map(record => ({
      ...record,
      positionWords1c: [...record.positionWords1c],
    }));
  }
}

export function createNativeOperation0120State() {
  return new NativeOperation0120State();
}

export function createNativeOperation0120SemanticHandlers({
  applyRecordState,
} = {}) {
  return {
    "native-operation-0120-record-field-control": ({
      context,
      readArgument,
    }) => {
      try {
        const mode = readArgument(0);
        if (![0, 1, 2].includes(mode)) {
          return {
            status: "stopped",
            reason: "native-operation-0120-mode-unproved",
          };
        }
        const state = context.nativeOperation0120State;
        if (!state || typeof state.planModeZero !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-0120-record-table-unavailable",
          };
        }
        const plan = (
          mode === 0
            ? state.planModeZero(readArgument(1))
            : mode === 1
              ? state.planModeOne(readArgument(1), readArgument(2))
              : state.planModeTwo(readArgument(1), readArgument(2))
        );
        if (plan.reason) {
          return { status: "stopped", reason: plan.reason };
        }
        if (typeof applyRecordState === "function" && mode !== 2) {
          const applied = applyRecordState({
            mode,
            records: plan.records.map(record => ({ ...record })),
          });
          if (applied && typeof applied.then === "function") {
            throw new TypeError(
              "native operation 0x0120 record adapter must be synchronous",
            );
          }
          if (applied === false) {
            throw new Error(
              "native operation 0x0120 record adapter rejected the mutation",
            );
          }
        }
        state.commit(plan);
        return {
          status: "continued",
          mutation: {
            mode,
            value: plan.value,
            ...(mode === 0
              ? { recordCount: RECORD_COUNT }
              : { index: plan.index }),
          },
          result: plan.result,
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
