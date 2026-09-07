import assert from "node:assert/strict";
import test from "node:test";

import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeOperation0026SemanticHandlers,
  NATIVE_OPERATION_0026_GLOBAL_ADDRESS,
} from "../play/events/NativeOperation0026Runtime.js";

const action = {
  kind: "engineOperation",
  semanticId: "native-fixed-global-dword-query",
  arguments: [],
};

test("operation 0x0026 reads its exact fixed global dword", async () => {
  const reads = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0026SemanticHandlers({
      readNativeFixedGlobalDword: detail => {
        reads.push(detail);
        return 0xffff_ffff;
      },
    }),
  });
  assert.deepEqual(await execute(action), { result: -1 });
  assert.deepEqual(reads, [{ address: NATIVE_OPERATION_0026_GLOBAL_ADDRESS }]);
});

test("operation 0x0026 fails closed without the native global owner", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0026SemanticHandlers(),
  });
  assert.deepEqual(await execute(action), {
    status: "stopped",
    reason: "native-fixed-global-dword-reader-missing",
  });
});
