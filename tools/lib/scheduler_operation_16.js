import { OPERATION_16_RECORD_WORD_LENGTHS } from "./scheduler_descriptor_layout.js";

function asciiWord(data, offset) {
  const value = data.subarray(offset, offset + 4).toString("ascii");
  return /^[\x20-\x7e]{4}$/.test(value) ? value : null;
}

export function decodeLocalTransformRecord(
  data,
  cursor,
  addressAt,
  recordIndex = null,
) {
  const runtimePosition = [
    data.readFloatLE(cursor + 24),
    data.readFloatLE(cursor + 28),
    data.readFloatLE(cursor + 32),
  ];
  return {
    ...(recordIndex === null ? {} : { recordIndex }),
    operation: data.readUInt32LE(cursor),
    address: addressAt(cursor),
    byteLength: 48,
    rawOperands: data.subarray(cursor + 4, cursor + 48).toString("hex"),
    objectCode: asciiWord(data, cursor + 4),
    locationCode: asciiWord(data, cursor + 8),
    controlWord: data.readUInt32LE(cursor + 12),
    placementMode: data.readUInt32LE(cursor + 16),
    auxiliaryControlWord: data.readUInt32LE(cursor + 20),
    runtimePosition,
    browserPosition: [
      -runtimePosition[0],
      runtimePosition[1],
      runtimePosition[2],
    ],
    transformControlWords: [
      data.readUInt32LE(cursor + 36),
      data.readUInt32LE(cursor + 40),
      data.readUInt32LE(cursor + 44),
    ],
    semanticStatus: "engine-proven subordinate object/local-transform record",
  };
}

export function decodeOperation16Records(
  data,
  operationOffset,
  encodedWordLength,
  recordCount,
  addressAt,
) {
  const operationEnd = operationOffset + encodedWordLength * 4;
  const records = [];
  let cursor = operationOffset + 20;
  let error = null;

  for (let recordIndex = 0; recordIndex < recordCount; recordIndex++) {
    if (cursor + 4 > operationEnd) {
      error = "record count exceeds encoded operation length";
      break;
    }
    const operation = data.readUInt32LE(cursor);
    const wordLength = OPERATION_16_RECORD_WORD_LENGTHS.get(operation);
    if (!wordLength || operation === 0x27) {
      error = `unsupported nested operation 0x${operation.toString(16)}`;
      break;
    }
    const byteLength = wordLength * 4;
    if (cursor + byteLength > operationEnd) {
      error = "nested operation exceeds encoded operation length";
      break;
    }
    let record = {
      recordIndex,
      operation,
      address: addressAt(cursor),
      byteLength,
      rawOperands: data.subarray(cursor + 4, cursor + byteLength)
        .toString("hex"),
    };
    if (operation === 0x07) {
      record.durationSeconds = data.readInt32LE(cursor + 4);
      record.requiredControllerState = 5;
      record.deadlineRule = "schedulerSecond + durationSeconds";
      record.semanticStatus = (
        "engine-proven subordinate scheduler wait; state 5 stores the "
        + "absolute deadline at actor +0x78"
      );
    } else if (operation === 0x10 || operation === 0x2d) {
      record = decodeLocalTransformRecord(
        data,
        cursor,
        addressAt,
        recordIndex,
      );
      record.requiredControllerState = operation === 0x10 ? 5 : 4;
      record.handlerAddress = "0x0c11d1de";
      record.semanticStatus = (
        "engine-proven subordinate object/local-transform registration; "
        + `operation 0x${operation.toString(16)} executes in controller `
        + `state ${record.requiredControllerState} through 0x0c11d1de`
      );
    } else if (operation === 0x11 || operation === 0x2e) {
      record.objectCode = asciiWord(data, cursor + 4);
      record.requiredControllerState = operation === 0x11 ? 5 : 6;
      record.handlerAddress = "0x0c11d2b6";
      record.semanticStatus = (
        "engine-proven subordinate registered-object transition; "
        + `operation 0x${operation.toString(16)} executes in controller `
        + `state ${record.requiredControllerState} through 0x0c11d2b6`
      );
    } else if (operation === 0x02) {
      record.motionStateId = data.readInt16LE(cursor + 4);
      record.controlValue = data.readUInt32LE(cursor + 4);
      record.motionUpdateFlag = 0;
      record.requiredControllerState = 5;
      record.handlerAddress = "0x0c11f7a0";
      record.semanticStatus = (
        "engine-proven subordinate actor motion-state selection in "
        + "controller state 5 through 0x0c11f7a0"
      );
    } else if (operation === 0x1a) {
      record.controlValues = [
        data.readUInt32LE(cursor + 4),
        data.readUInt32LE(cursor + 8),
        data.readUInt32LE(cursor + 12),
      ];
      record.motionStateId = data.readInt16LE(cursor + 4);
      record.motionControlValue = data.readUInt32LE(cursor + 8);
      record.motionTailValue = data.readUInt32LE(cursor + 12);
      record.requiredControllerState = 5;
      record.handlerAddress = "0x0c11f8dc";
      record.semanticStatus = (
        "engine-proven subordinate actor motion/control selection in "
        + "controller state 5 through 0x0c11f8dc; final motion meaning "
        + "remains numeric"
      );
    }
    records.push(record);
    cursor += byteLength;
  }

  let terminator = null;
  if (!error) {
    if (cursor + 4 > operationEnd || data.readUInt32LE(cursor) !== 0x27) {
      error = "subordinate record stream lacks operation-0x27 terminator";
    } else {
      terminator = {
        operation: 0x27,
        address: addressAt(cursor),
        byteLength: 4,
      };
      cursor += 4;
      if (cursor !== operationEnd) {
        error = "encoded length does not end after subordinate terminator";
      }
    }
  }

  return {
    records,
    terminator,
    exactBoundary: error === null,
    decodeError: error,
    decodingEvidence: {
      stateMachineAddress: "0x0c1264e4",
      iteratorAddress: "0x0c126494",
      initializationHandlerAddress: "0x0c126cca",
      positionHandlerAddress: "0x0c126ec2",
      controllerStateOffset: "0x110",
      subordinateCursorOffset: "0x1dc",
      waitDeadlineOffset: "0x78",
      motionStateHandlerAddress: "0x0c11f7a0",
      motionControlHandlerAddress: "0x0c11f8dc",
      localTransformHandlerAddress: "0x0c11d1de",
      objectTransitionHandlerAddress: "0x0c11d2b6",
    },
  };
}
