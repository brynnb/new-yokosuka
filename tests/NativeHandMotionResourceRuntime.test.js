import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeHandMotionResourceSemanticHandlers,
  planNativeHandMotionResourceRequest,
} from "../play/events/NativeHandMotionResourceRuntime.js";

function action(pointer = 0x223d8) {
  return {
    semanticId: "native-hand-motion-resource-request",
    callFileOffset: "0x154ae",
    arguments: [
      { kind: "constant", value: 1 },
      { kind: "constant", value: 0x3030504f },
      { kind: "static-pointer", value: pointer },
    ],
  };
}

test("HMOT requests use the native scene path and HNDM resource type", () => {
  assert.deepEqual(planNativeHandMotionResourceRequest({
    discNumber: 1,
    areaWord: 0x3030504f,
    filename: "HMOT0102.BIN",
  }), {
    path: "scene/01/OP00",
    name: "HMOT0102.BIN",
    resourceType: "HNDM",
    global: false,
  });
});

test("HMOT handler queues the exact request and publishes its handle", async () => {
  const requests = [];
  const handler = createNativeHandMotionResourceSemanticHandlers({
    queueNativeHandMotionResource: request => {
      requests.push(request);
      return { handle: 17, resource: { kind: "fixture" } };
    },
  })["native-hand-motion-resource-request"];
  const values = [1, 0x3030504f, 0x223d8];
  const result = await handler({
    action: action(),
    context: {
      location: { functionId: "0x1512a" },
      resolveNativeStaticString: pointer => (
        pointer === 0x223d8 ? "HMOT0102.BIN" : null
      ),
    },
    readArgument: index => values[index],
  });

  assert.equal(result.status, "continued");
  assert.equal(result.result, 17);
  assert.deepEqual(requests, [{
    path: "scene/01/OP00",
    name: "HMOT0102.BIN",
    resourceType: "HNDM",
    global: false,
    source: {
      functionFileOffset: "0x1512a",
      callFileOffset: "0x154ae",
    },
  }]);
});

test("HMOT handler requires a proved static filename pointer", async () => {
  const invalid = action();
  invalid.arguments[2] = { kind: "runtime" };
  const result = await createNativeHandMotionResourceSemanticHandlers()[
    "native-hand-motion-resource-request"
  ]({ action: invalid, context: {}, readArgument: () => 0 });
  assert.deepEqual(result, {
    status: "stopped",
    reason: "native-hand-motion-filename-pointer-unproved",
  });
});
