import assert from "node:assert/strict";
import test from "node:test";

import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeOperation01adSemanticHandlers,
  createNativeOperation01adState,
  NATIVE_OPERATION_01AD_TABLE,
} from "../play/events/NativeOperation01adRuntime.js";

function action(index, value) {
  return {
    kind: "engineOperation",
    semanticId: "native-fixed-stride-record-dword-write",
    arguments: [
      { kind: "constant", value: index },
      { kind: "constant", value },
    ],
  };
}

test("operation 0x01ad writes exact 96-byte-stride record dwords", async () => {
  const state = createNativeOperation01adState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation01adSemanticHandlers({ state }),
  });
  assert.deepEqual(await execute(action(16, 1)), {
    status: "continued",
    mutation: {
      index: 16,
      address: NATIVE_OPERATION_01AD_TABLE.baseAddress + 16 * 96,
      previous: 0,
      value: 1,
    },
  });
  assert.equal(state.read(16), 1);
  assert.equal((await execute(action(17, 1))).reason,
    "native-operation-01ad-index-unproved");
  assert.equal((await execute(action(0, 2))).reason,
    "native-operation-01ad-value-unproved");
});

test("operation 0x01ad exposes one generic external table-write adapter", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation01adSemanticHandlers({
      writeNativeFixedStrideRecordDword: detail => {
        writes.push(detail);
        return { previous: 1, value: detail.value };
      },
    }),
  });
  const result = await execute(action(3, 0));
  assert.equal(result.mutation.previous, 1);
  assert.deepEqual(writes, [{
    index: 3,
    address: NATIVE_OPERATION_01AD_TABLE.baseAddress + 3 * 96,
    value: 0,
  }]);
});
