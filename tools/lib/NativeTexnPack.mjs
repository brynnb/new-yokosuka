import { gunzipSync } from "node:zlib";

function sourceBytes(input) {
  const bytes = Buffer.from(input);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes)
    : bytes;
}

export function extractNativeTexnPack(input, label = "native TEXN archive") {
  const bytes = sourceBytes(input);
  const entries = [];
  for (let offset = 0; offset < bytes.length;) {
    const texnOffset = bytes.indexOf("TEXN", offset, "ascii");
    if (texnOffset < 0) break;
    if (texnOffset + 16 > bytes.length) {
      throw new Error(`${label} has a truncated TEXN header at 0x${texnOffset.toString(16)}`);
    }
    const byteLength = bytes.readUInt32LE(texnOffset + 4);
    const end = texnOffset + byteLength;
    const pvrOffset = bytes.indexOf("PVRT", texnOffset + 16, "ascii");
    if (byteLength <= 16 || end > bytes.length || pvrOffset < 0 || pvrOffset >= end) {
      throw new Error(`${label} has an invalid TEXN record at 0x${texnOffset.toString(16)}`);
    }
    const id = bytes.subarray(texnOffset + 8, texnOffset + 16);
    const textureLength = Buffer.alloc(4);
    textureLength.writeUInt32LE(end - pvrOffset);
    entries.push(Object.freeze({
      sourceOffset: texnOffset,
      byteLength,
      id: id.toString("hex"),
      bytes: Buffer.concat([id, textureLength, bytes.subarray(pvrOffset, end)]),
    }));
    offset = end;
  }
  if (entries.length === 0) throw new Error(`${label} has no TEXN resources`);
  return Object.freeze({
    entries: Object.freeze(entries),
    bytes: Buffer.concat(entries.map(entry => entry.bytes)),
  });
}
