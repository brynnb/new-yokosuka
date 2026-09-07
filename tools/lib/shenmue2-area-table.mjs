import { createHash } from "node:crypto";

const RECORD_BYTE_LENGTH = 0x20;
const RECORDS_OFFSET = 0x10;

export function parseShenmue2AreaTable(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < RECORDS_OFFSET) throw new Error("AREATBL1 is truncated");
  const tableEnd = bytes.readUInt32LE(0x0c);
  if (tableEnd <= RECORDS_OFFSET || tableEnd > bytes.length) {
    throw new Error(`Invalid AREATBL1 end 0x${tableEnd.toString(16)}`);
  }

  const groups = [];
  let records = [];
  for (let offset = RECORDS_OFFSET; offset + RECORD_BYTE_LENGTH <= tableEnd;
    offset += RECORD_BYTE_LENGTH) {
    const id = bytes.readUInt32LE(offset);
    if (id === 0xffffffff) {
      if (records.length > 0) groups.push({ fileOffset: records[0].fileOffset, records });
      records = [];
      continue;
    }
    const destinationArea = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    records.push({
      fileOffset: offset,
      id,
      destinationArea: /^[A-Z0-9]{4}$/.test(destinationArea)
        ? destinationArea
        : null,
      destinationEntry: bytes.readUInt32LE(offset + 8),
      position: [
        bytes.readFloatLE(offset + 12),
        bytes.readFloatLE(offset + 16),
        bytes.readFloatLE(offset + 20),
      ],
      facing: bytes.readUInt16LE(offset + 24),
    });
  }
  if (records.length > 0) groups.push({ fileOffset: records[0].fileOffset, records });
  return {
    format: "shenmue2-areatbl1-v1",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    tableEnd,
    groups,
  };
}
