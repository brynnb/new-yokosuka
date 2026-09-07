import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeMotionResourceRequestSemanticHandlers,
  nativeFourCcFromWord,
  planNativeMotionResourceRequest,
} from "../play/events/NativeMotionResourceRequestRuntime.js";

test("native motion request preserves the executable's scene path contract", () => {
  assert.equal(nativeFourCcFromWord(0x3030504f), "OP00");
  assert.deepEqual(
    planNativeMotionResourceRequest({
      discNumber: 1,
      areaWord: 0x3030504f,
      filename: "M_0101A.BIN",
    }),
    {
      path: "scene/01/OP00",
      name: "M_0101A.BIN",
      resourceType: "MOTI",
      global: false,
    },
  );
});

test("the two native global motion banks route through misc", () => {
  for (const filename of ["M_MOBJ.BIN", "M_MDOR.BIN"]) {
    assert.deepEqual(
      planNativeMotionResourceRequest({
        discNumber: 3,
        areaWord: 0x45455246,
        filename,
      }),
      {
        path: "misc",
        name: filename,
        resourceType: "MOTI",
        global: true,
      },
    );
  }
});

test("operation 0x0084 resolves its filename and returns the queue handle", async () => {
  const requests = [];
  const handlers = createNativeMotionResourceRequestSemanticHandlers({
    queueNativeMotionResource: async request => {
      requests.push(request);
      return { handle: 27, resource: { ready: true } };
    },
  });
  const action = {
    callFileOffset: "0x15476",
    arguments: [
      { kind: "constant" },
      { kind: "constant" },
      { kind: "static-pointer" },
    ],
  };
  const result = await handlers["native-motion-resource-request"]({
    action,
    context: {
      location: { functionId: "0x1512a" },
      resolveNativeStaticString: pointer => (
        pointer === 0x223c3 ? "M_0101A.BIN" : undefined
      ),
    },
    readArgument: index => [1, 0x3030504f, 0x223c3][index],
  });

  assert.deepEqual(requests, [{
    path: "scene/01/OP00",
    name: "M_0101A.BIN",
    resourceType: "MOTI",
    global: false,
    source: {
      functionFileOffset: "0x1512a",
      callFileOffset: "0x15476",
    },
  }]);
  assert.deepEqual(result, {
    status: "continued",
    result: 27,
    request: {
      path: "scene/01/OP00",
      name: "M_0101A.BIN",
      resourceType: "MOTI",
      global: false,
    },
    resource: { ready: true },
  });
});

test("operation 0x0084 rejects unproved filenames before queuing", async () => {
  const handler = createNativeMotionResourceRequestSemanticHandlers({
    queueNativeMotionResource: () => assert.fail("must not queue"),
  })["native-motion-resource-request"];

  assert.deepEqual(await handler({
    action: { arguments: [{}, {}, { kind: "operation-result" }] },
    context: {},
    readArgument: () => 0,
  }), {
    status: "stopped",
    reason: "native-motion-resource-filename-pointer-unproved",
  });
});

test("operation 0x0084 fails closed when the native queue has no handle", async () => {
  const handler = createNativeMotionResourceRequestSemanticHandlers({
    queueNativeMotionResource: async () => ({}),
  })["native-motion-resource-request"];
  const result = await handler({
    action: { arguments: [{}, {}, { kind: "static-pointer" }] },
    context: { resolveNativeStaticString: () => "M_UO.BIN" },
    readArgument: index => [1, 0x3030504f, 0x223cf][index],
  });
  assert.deepEqual(result, {
    status: "stopped",
    reason: "native-motion-resource-handle-unavailable",
  });
});
