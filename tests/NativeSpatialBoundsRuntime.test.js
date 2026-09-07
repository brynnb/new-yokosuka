import assert from "node:assert/strict";
import test from "node:test";

import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  createNativeEventOperationExecutor,
  createNativeSpatialBoundsSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function fourcc(value) {
  return value.split("").reduce(
    (word, character, index) => (
      word | character.charCodeAt(0) << (index * 8)
    ),
    0,
  ) >>> 0;
}

function words(x, y, z) {
  return [x, y, z].map(nativeFloat32Word);
}

function action(subject, firstPointer, secondPointer, translation = 0) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-xz-bounds-query",
    arguments: [
      { kind: "constant", value: fourcc(subject), ascii: subject },
      { kind: "static-pointer", value: firstPointer },
      { kind: "static-pointer", value: secondPointer },
      translation === 0
        ? { kind: "constant", value: 0 }
        : {
            kind: "constant",
            value: fourcc(translation),
            ascii: translation,
          },
    ],
  };
}

function executor({ objectVectors = {}, nativeVectors = {} } = {}) {
  return createNativeEventOperationExecutor({
    handlers: createNativeSpatialBoundsSemanticHandlers({
      readSceneObjectBaseVector: ({ objectTag }) => objectVectors[objectTag],
      readNativeVector: pointer => nativeVectors[pointer],
    }),
  });
}

function distanceAngleAction({
  first = [0, 0, 0],
  second = [0, 0, 1],
  distance = 1,
  angle = 0x8000,
  tolerance = 1,
} = {}) {
  return {
    kind: "engineOperation",
    semanticId: "native-vector-distance-angle-query",
    arguments: [
      {
        kind: "static-pointer",
        value: 100,
        staticWords: words(...first),
      },
      { kind: "constant", value: nativeFloat32Word(distance) },
      { kind: "constant", value: angle },
      { kind: "constant", value: tolerance },
      {
        kind: "static-pointer",
        value: 200,
        staticWords: words(...second),
      },
    ],
  };
}

test("operation 0x000a performs the exact inclusive XZ bounds query", async () => {
  const execute = executor({
    objectVectors: { AKIR: words(2, 99, -4) },
    nativeVectors: {
      100: words(-2, 500, -4),
      200: words(2, -500, 4),
    },
  });
  const result = await execute(action("AKIR", 100, 200));
  assert.equal(result.result, 1);
  assert.deepEqual(result.query.bounds, {
    minX: -2,
    maxX: 2,
    minZ: -4,
    maxZ: 4,
  });
});

test("operation 0x000a normalizes corners and adds exact object translation", async () => {
  const execute = executor({
    objectVectors: {
      AKIR: words(11, 0, 18),
      PILO: words(10, 50, 20),
    },
    nativeVectors: {
      100: words(2, 0, 3),
      200: words(-2, 0, -3),
    },
  });
  const result = await execute(action("AKIR", 100, 200, "PILO"));
  assert.equal(result.result, 1);
  assert.deepEqual(result.query.bounds, {
    minX: 8,
    maxX: 12,
    minZ: 17,
    maxZ: 23,
  });
});

test("operation 0x000a preserves missing-object zero vectors", async () => {
  const execute = executor({
    nativeVectors: {
      100: words(-1, 0, -1),
      200: words(1, 0, 1),
    },
  });
  assert.equal((await execute(action("NONE", 100, 200))).result, 1);
});

test("operation 0x000a stops when native vector data is unavailable", async () => {
  const missingReader = createNativeEventOperationExecutor({
    handlers: createNativeSpatialBoundsSemanticHandlers({
      readSceneObjectBaseVector: () => words(0, 0, 0),
    }),
  });
  assert.equal(
    (await missingReader(action("AKIR", 100, 200))).reason,
    "native-spatial-bounds-vector-reader-missing",
  );

  const missingVector = executor({
    objectVectors: { AKIR: words(0, 0, 0) },
    nativeVectors: { 100: words(-1, 0, -1) },
  });
  assert.match(
    (await missingVector(action("AKIR", 100, 200))).reason,
    /second corner requires three integer words/,
  );
});

test("operation 0x000b accepts distance equality and strict angular bounds", async () => {
  const execute = executor();
  const matched = await execute(distanceAngleAction());
  assert.equal(matched.result, 1);
  assert.equal(matched.query.distance, 1);
  assert.equal(matched.query.heading, 0x8000);
  assert.equal(matched.query.angularDifference, 0);

  const angleEquality = await execute(distanceAngleAction({
    angle: 0x8001,
    tolerance: 1,
  }));
  assert.equal(angleEquality.result, 0);
  assert.equal(angleEquality.query.angularDifference, 1);
});

test("operation 0x000b preserves wrapped binary-angle difference", async () => {
  const execute = executor();
  const result = await execute(distanceAngleAction({
    second: [0, 0, -1],
    angle: 0xffff,
    tolerance: 2,
  }));
  assert.equal(result.query.heading, 0);
  assert.equal(result.query.angularDifference, 1);
  assert.equal(result.result, 1);
});

test("operation 0x000b evaluates exact wrapped additive angle operands", async () => {
  const execute = executor();
  const action = distanceAngleAction({ second: [0, 0, -1], tolerance: 2 });
  action.arguments[2] = {
    kind: "integer-expression",
    operator: "add",
    left: { kind: "frame-field", offset: 16, width: 4, signedLoad: false },
    right: { kind: "constant", value: 0x8000 },
  };
  const result = await execute(action, {
    readFrameField: () => 0xffff8000,
  });
  assert.equal(result.query.heading, 0);
  assert.equal(result.query.angularDifference, 0);
  assert.equal(result.result, 1);
});

test("operation 0x000b reads exact indexed frame vectors and fields", async () => {
  const execute = executor();
  const action = distanceAngleAction({ second: [0, 0, -1], tolerance: 2 });
  const index = { kind: "frame-field", offset: 312, width: 4, signedLoad: false };
  const stride = {
    kind: "integer-expression",
    operator: "multiply-low",
    left: { kind: "constant", value: 12 },
    right: index,
  };
  action.arguments[0] = {
    kind: "frame-address-expression",
    baseOffset: 108,
    offsetExpression: stride,
  };
  action.arguments[2] = {
    kind: "integer-expression",
    operator: "add",
    left: {
      kind: "frame-field-expression",
      baseOffset: 16,
      offsetExpression: stride,
      width: 4,
      signedLoad: false,
    },
    right: { kind: "constant", value: 0x8000 },
  };
  const fields = {
    312: 1,
    120: nativeFloat32Word(0),
    124: nativeFloat32Word(0),
    128: nativeFloat32Word(0),
    28: 0xffff8000,
  };
  const result = await execute(action, {
    readFrameField: offset => fields[offset],
  });
  assert.equal(result.query.firstSource.offset, 120);
  assert.equal(result.query.angularDifference, 0);
  assert.equal(result.result, 1);
});

function binaryAngleFrameExpression(offset) {
  return {
    kind: "float32-truncate-to-signed-integer",
    operand: {
      kind: "float32-multiply",
      left: {
        kind: "float32-divide",
        left: {
          kind: "float32-from-word",
          operand: { kind: "frame-field", offset, width: 4, signedLoad: false },
        },
        right: {
          kind: "float32-from-word",
          operand: { kind: "constant", value: nativeFloat32Word(360) },
        },
      },
      right: {
        kind: "signed-integer-to-float32",
        operand: { kind: "constant", value: 65536 },
      },
    },
  };
}

test("operation 0x000b evaluates exact native FPU angle operands", async () => {
  const execute = executor();
  const action = distanceAngleAction({ tolerance: 0 });
  action.arguments[2] = binaryAngleFrameExpression(4);
  action.arguments[3] = binaryAngleFrameExpression(60);
  const fields = {
    4: nativeFloat32Word(180),
    60: nativeFloat32Word(45),
  };
  const result = await execute(action, {
    readFrameField: offset => fields[offset],
  });
  assert.equal(result.query.heading, 0x8000);
  assert.equal(result.query.angularTolerance, 0x2000);
  assert.equal(result.result, 1);
});

test("operation 0x000b resolves vector pointers passed through frame fields", async () => {
  const execute = executor({ nativeVectors: { 400: words(0, 0, -1) } });
  const action = distanceAngleAction({ angle: 0 });
  action.arguments[4] = {
    kind: "frame-field", offset: 52, width: 4, signedLoad: false,
  };
  const result = await execute(action, {
    readFrameField: offset => offset === 52 ? 400 : undefined,
  });
  assert.equal(result.query.secondSource.pointer, 400);
  assert.equal(result.result, 1);
});

test("operation 0x000b compares angular tolerance as a signed dword", async () => {
  const execute = executor();
  const result = await execute(distanceAngleAction({
    tolerance: 0xffffffff,
  }));
  assert.equal(result.query.angularTolerance, -1);
  assert.equal(result.result, 0);
});

test("operation 0x000b rejects distance before evaluating angle", async () => {
  const execute = executor();
  const result = await execute(distanceAngleAction({ distance: 0.5 }));
  assert.equal(result.result, 0);
  assert.equal(result.query.angleTested, false);
});
