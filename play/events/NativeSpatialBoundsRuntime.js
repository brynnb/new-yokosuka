import {
  nativeBinaryAngleFromFloatPairWords,
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";
import { exactNativeFrameOffset } from "./NativeIntegerExpression.js";

const ZERO_VECTOR_WORDS = [0, 0, 0];

function objectTag(action, readArgument, index) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(index);
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `native spatial-bounds object ${index} is unavailable`,
    );
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function vectorWords(value, name) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError(
      `native spatial-bounds ${name} requires three integer words`,
    );
  }
  return value.map(word => word >>> 0);
}

function vectorFloats(words) {
  return words.map(nativeFloat32FromWord);
}

function translatedCorner(words, translation) {
  const corner = vectorFloats(words);
  return [
    Math.fround(corner[0] + translation[0]),
    Math.fround(corner[2] + translation[2]),
  ];
}

async function vectorArgument({
  action,
  context,
  index,
  readArgument,
  readNativeVector,
  xzOnly = false,
}) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "frame-address-expression") {
    const offset = exactNativeFrameOffset(operand, context);
    if (offset === null) {
      throw new TypeError(
        "native spatial-bounds frame address expression is unavailable",
      );
    }
    const words = [0, 4, 8].map(delta => (
      context.readFrameField?.((offset + delta) >>> 0)
    ));
    if (words.some(word => !Number.isInteger(word))) {
      throw new TypeError(
        "native spatial-bounds frame address expression vector is unavailable",
      );
    }
    return {
      words: words.map(word => word >>> 0),
      source: { kind: operand.kind, offset },
    };
  }
  if (
    ["frame-address", "scene-address"].includes(operand?.kind)
    && Number.isInteger(operand.offset)
  ) {
    const read = operand.kind === "frame-address"
      ? context.readFrameField
      : context.readSceneField;
    const x = read?.(operand.offset);
    const y = read?.(operand.offset + 4);
    const z = read?.(operand.offset + 8);
    if (
      Number.isInteger(x)
      && Number.isInteger(z)
      && (xzOnly || Number.isInteger(y))
    ) {
      return {
        // Operation 0x000a reads only X and Z from each corner. Preserve a
        // zero Y component instead of requiring an unwritten stack slot.
        words: [x >>> 0, xzOnly ? 0 : y >>> 0, z >>> 0],
        source: { kind: operand.kind, offset: operand.offset },
      };
    }
    throw new TypeError(
      `native spatial-bounds ${operand.kind} vector is unavailable`,
    );
  }
  if (
    operand?.kind === "static-pointer"
    && Array.isArray(operand.staticWords)
  ) {
    return {
      words: operand.staticWords,
      source: { kind: "static-pointer", pointer: operand.value },
    };
  }
  if (typeof readNativeVector !== "function") {
    throw new TypeError("native-spatial-bounds-vector-reader-missing");
  }
  const pointer = readArgument(index);
  return {
    words: await readNativeVector(pointer),
    source: { kind: "native-pointer", pointer },
  };
}

export function createNativeSpatialBoundsSemanticHandlers({
  readSceneObjectBaseVector,
  readNativeVector,
} = {}) {
  return {
    "resolved-object-xz-bounds-query": async ({
      action,
      context,
      readArgument,
    }) => {
      const readObjectVector = (
        readSceneObjectBaseVector
        || context.readSceneObjectBaseVector
      );
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof readObjectVector !== "function") {
        return {
          status: "stopped",
          reason: "native-spatial-bounds-object-reader-missing",
        };
      }
      let subjectTag;
      let translationTag = null;
      let firstVector;
      let secondVector;
      try {
        subjectTag = objectTag(action, readArgument, 0);
        firstVector = await vectorArgument({
          action,
          context,
          index: 1,
          readArgument,
          readNativeVector: readVector,
          xzOnly: true,
        });
        secondVector = await vectorArgument({
          action,
          context,
          index: 2,
          readArgument,
          readNativeVector: readVector,
          xzOnly: true,
        });
        const translationOperand = readArgument(3);
        if (translationOperand !== 0) {
          translationTag = objectTag(action, readArgument, 3);
        }
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      let subjectWords;
      let translationWords;
      let firstWords;
      let secondWords;
      try {
        subjectWords = await readObjectVector({
          objectTag: subjectTag,
          associated: false,
        });
        translationWords = translationTag === null
          ? ZERO_VECTOR_WORDS
          : await readObjectVector({
              objectTag: translationTag,
              associated: false,
            });
        firstWords = vectorWords(
          firstVector.words,
          "first corner",
        );
        secondWords = vectorWords(
          secondVector.words,
          "second corner",
        );
        subjectWords = subjectWords === undefined || subjectWords === null
          ? ZERO_VECTOR_WORDS
          : vectorWords(subjectWords, "subject position");
        translationWords = (
          translationWords === undefined || translationWords === null
        )
          ? ZERO_VECTOR_WORDS
          : vectorWords(translationWords, "translation position");
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      const subject = vectorFloats(subjectWords);
      const translation = vectorFloats(translationWords);
      const first = translatedCorner(firstWords, translation);
      const second = translatedCorner(secondWords, translation);
      const minX = first[0] > second[0] ? second[0] : first[0];
      const maxX = first[0] > second[0] ? first[0] : second[0];
      const minZ = first[1] > second[1] ? second[1] : first[1];
      const maxZ = first[1] > second[1] ? first[1] : second[1];
      const matched = !(
        minX > subject[0]
        || subject[0] > maxX
        || minZ > subject[2]
        || subject[2] > maxZ
      );
      return {
        result: matched ? 1 : 0,
        query: {
          subjectTag,
          translationTag,
          firstPointer: firstVector.source.pointer ?? null,
          secondPointer: secondVector.source.pointer ?? null,
          firstSource: firstVector.source,
          secondSource: secondVector.source,
          bounds: { minX, maxX, minZ, maxZ },
        },
      };
    },
    "native-vector-distance-angle-query": async ({
      action,
      context,
      readArgument,
    }) => {
      const readVector = readNativeVector || context.readNativeVector;
      let firstVector;
      let secondVector;
      let distanceWord;
      let desiredAngle;
      let angularTolerance;
      try {
        firstVector = await vectorArgument({
          action,
          context,
          index: 0,
          readArgument,
          readNativeVector: readVector,
        });
        distanceWord = readArgument(1);
        desiredAngle = readArgument(2);
        angularTolerance = readArgument(3);
        secondVector = await vectorArgument({
          action,
          context,
          index: 4,
          readArgument,
          readNativeVector: readVector,
        });
        if (![distanceWord, desiredAngle, angularTolerance].every(
          Number.isInteger,
        )) {
          throw new TypeError(
            "native distance-angle scalar operands must be integer words",
          );
        }
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      let firstWords;
      let secondWords;
      try {
        firstWords = vectorWords(firstVector.words, "first position");
        secondWords = vectorWords(secondVector.words, "second position");
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const first = vectorFloats(firstWords);
      const second = vectorFloats(secondWords);
      const delta = first.map((value, index) => (
        Math.fround(second[index] - value)
      ));
      let squaredLength = Math.fround(0);
      for (const component of delta) {
        squaredLength = Math.fround(
          squaredLength + Math.fround(component * component),
        );
      }
      const distance = Math.fround(Math.sqrt(squaredLength));
      const distanceThreshold = nativeFloat32FromWord(distanceWord);
      const signedAngularTolerance = angularTolerance | 0;
      if (distance > distanceThreshold) {
        return {
          result: 0,
          query: {
            distance,
            distanceWord: nativeFloat32Word(distance),
            distanceThreshold,
            desiredAngle: desiredAngle & 0xffff,
            angularTolerance: signedAngularTolerance,
            angleTested: false,
            firstSource: firstVector.source,
            secondSource: secondVector.source,
          },
        };
      }

      const heading = nativeBinaryAngleFromFloatPairWords(
        nativeFloat32Word(delta[0]),
        nativeFloat32Word(delta[2]),
      );
      const wrappedDifference = ((desiredAngle - heading) & 0xffff);
      const angularDifference = wrappedDifference >= 0x8000
        ? ((-wrappedDifference) & 0xffff)
        : wrappedDifference;
      const matched = angularDifference < signedAngularTolerance;
      return {
        result: matched ? 1 : 0,
        query: {
          distance,
          distanceWord: nativeFloat32Word(distance),
          distanceThreshold,
          desiredAngle: desiredAngle & 0xffff,
          heading,
          angularDifference,
          angularTolerance: signedAngularTolerance,
          angleTested: true,
          firstSource: firstVector.source,
          secondSource: secondVector.source,
        },
      };
    },
  };
}
