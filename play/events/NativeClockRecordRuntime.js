const RECORD_SIZE = 7;

export function nativeClockRecordFromGameDate(gameDate) {
  if (!(gameDate instanceof Date) || !Number.isFinite(gameDate.getTime())) {
    throw new TypeError("native clock record requires a valid game date");
  }
  const year = gameDate.getUTCFullYear() - 1900;
  if (!Number.isInteger(year) || year < 0 || year > 99) {
    throw new RangeError("native clock record year is outside 1900-1999");
  }
  return [
    year,
    gameDate.getUTCMonth() + 1,
    gameDate.getUTCDate(),
    gameDate.getUTCDay(),
    gameDate.getUTCHours(),
    gameDate.getUTCMinutes(),
    gameDate.getUTCSeconds(),
  ];
}

function exactRecordBytes(value) {
  if (
    !Array.isArray(value)
    && !(value instanceof Uint8Array)
  ) {
    return null;
  }
  const bytes = Array.from(value);
  if (
    bytes.length !== RECORD_SIZE
    || bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 0xff)
  ) {
    return null;
  }
  return bytes;
}

function weekdaySundayZero(yearSince1900, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(1900 + yearSince1900, month - 1, day);
  return date.getUTCDay();
}

export function normalizeNativeClockRecord(value) {
  const bytes = exactRecordBytes(value);
  if (bytes === null) return null;
  let [year, month, day, , hour, minute, second] = bytes;
  if (second > 59) {
    second = 0;
    minute += 1;
  }
  if (minute > 59) {
    minute = 0;
    hour += 1;
  }
  if (hour > 23) {
    hour = 0;
    day += 1;
  }
  const daysInMonth = new Date(Date.UTC(2000, month, 0)).getUTCDate();
  const leapFebruary = month === 2 && year % 4 === 0;
  const maximumDay = leapFebruary ? 29 : daysInMonth;
  if (day > maximumDay) {
    day = 1;
    month += 1;
  }
  if (month > 12) {
    month = 1;
    year += 1;
  }
  if (year > 99) year = 0;
  if (
    year < 0 || month < 1 || month > 12 || day < 1
    || hour < 0 || minute < 0 || second < 0
  ) return null;
  return [
    year,
    month,
    day,
    weekdaySundayZero(year, month, day),
    hour,
    minute,
    second,
  ];
}

export function createNativeClockRecordState({
  readAuthoritativeRecord,
} = {}) {
  let override = null;
  return Object.freeze({
    read() {
      const record = override || readAuthoritativeRecord?.();
      const bytes = exactRecordBytes(record);
      return bytes === null ? null : [...bytes];
    },
    write(record) {
      const normalized = normalizeNativeClockRecord(record);
      if (normalized === null) return false;
      override = normalized;
      return true;
    },
    snapshot() {
      return override === null ? null : [...override];
    },
    restore(snapshot) {
      if (snapshot === null) {
        override = null;
        return true;
      }
      const bytes = exactRecordBytes(snapshot);
      if (bytes === null) return false;
      override = [...bytes];
      return true;
    },
  });
}

export function createNativeClockRecordSemanticHandlers({
  readNativeClockRecord,
  writeNativeClockRecord,
} = {}) {
  return {
    "native-clock-record-write": async ({ action, context }) => {
      const source = action.arguments?.[0];
      if (
        !source
        || !["frame-address", "scene-address"].includes(source.kind)
        || !Number.isInteger(source.offset)
        || source.offset < 0
      ) {
        return {
          status: "stopped",
          reason: "native-clock-record-source-unproved",
        };
      }
      const sourceReader = source.kind === "frame-address"
        ? context.readFrameField
        : context.readSceneField;
      if (typeof sourceReader !== "function") {
        return {
          status: "stopped",
          reason: `${source.kind}-reader-missing`,
        };
      }
      const readField = source.kind === "frame-address"
        ? offset => sourceReader(offset)
        : offset => sourceReader({
            offset,
            width: 1,
            signedLoad: false,
          });
      const bytes = Array.from(
        { length: RECORD_SIZE },
        (_, index) => readField(source.offset + index),
      );
      const normalized = normalizeNativeClockRecord(bytes);
      if (normalized === null) {
        return {
          status: "stopped",
          reason: "native-clock-record-source-unavailable",
        };
      }
      const writeRecord = writeNativeClockRecord
        || context.writeNativeClockRecord;
      if (typeof writeRecord !== "function") {
        return {
          status: "stopped",
          reason: "native-clock-record-writer-missing",
        };
      }
      if (await writeRecord(normalized) === false) {
        return {
          status: "stopped",
          reason: "native-clock-record-write-rejected",
        };
      }
      return {
        status: "continued",
        mutation: {
          kind: "native-clock-record-write",
          source: { kind: source.kind, offset: source.offset },
          bytes: normalized,
        },
      };
    },
    "native-clock-record-copy": async ({
      action,
      context,
    }) => {
      const readRecord = readNativeClockRecord || context.readNativeClockRecord;
      if (typeof readRecord !== "function") {
        return {
          status: "stopped",
          reason: "native-clock-record-reader-missing",
        };
      }
      const destination = action.arguments?.[0];
      if (
        !destination
        || !["frame-address", "scene-address"].includes(destination.kind)
        || !Number.isInteger(destination.offset)
        || destination.offset < 0
      ) {
        return {
          status: "stopped",
          reason: "native-clock-record-destination-unproved",
        };
      }
      const writeField = (
        destination.kind === "frame-address"
          ? context.writeFrameField
          : context.writeSceneField
      );
      if (typeof writeField !== "function") {
        return {
          status: "stopped",
          reason: `${destination.kind}-writer-missing`,
        };
      }
      const bytes = exactRecordBytes(await readRecord());
      if (bytes === null) {
        return {
          status: "stopped",
          reason: "native-clock-record-unavailable",
        };
      }
      const source = {
        functionFileOffset: context.location?.functionId,
        callFileOffset: action.callFileOffset,
      };
      for (let index = 0; index < bytes.length; index += 1) {
        writeField({
          offset: destination.offset + index,
          width: 1,
          value: bytes[index],
          source,
        });
      }
      return {
        status: "continued",
        mutation: {
          kind: "native-clock-record-copy",
          destination: {
            kind: destination.kind,
            offset: destination.offset,
          },
          bytes,
        },
      };
    },
  };
}
