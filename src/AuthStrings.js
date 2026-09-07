import { parseAuthTrack, readAuthAscii } from "./AuthTrack.js";

/** Parse AUTH's optional exact ASTR offset table and null-terminated strings. */
export function parseAuthStrings(input) {
  const track = parseAuthTrack(input);
  const view = track.view;
  const chunk = track.chunk("ASTR", { required: false });
  if (!chunk) {
    return {
      markerOffset: null,
      chunkSize: 0,
      strings: Object.freeze([]),
    };
  }
  const count = view.getUint32(chunk.offset + 12, true);
  const headerSize = 16 + (count + 1) * 4;
  if (headerSize > chunk.byteLength) {
    throw new Error("AUTH ASTR string table is truncated.");
  }
  const offsets = Array.from(
    { length: count + 1 },
    (_, index) => view.getUint32(chunk.offset + 16 + index * 4, true),
  );
  if (
    offsets[0] < headerSize
    || offsets.at(-1) > chunk.byteLength
    || offsets.some((offset, index) => (
      offset > chunk.byteLength || (index > 0 && offset < offsets[index - 1])
    ))
  ) {
    throw new Error("AUTH ASTR string offsets are invalid.");
  }
  const trailingByteCount = chunk.byteLength - offsets.at(-1);
  if (trailingByteCount > 3) {
    throw new Error("AUTH ASTR has excess bytes after its string table.");
  }
  for (
    let offset = chunk.offset + offsets.at(-1);
    offset < chunk.endOffset;
    offset += 1
  ) {
    if (view.getUint8(offset) !== 0) {
      throw new Error("AUTH ASTR alignment padding is nonzero.");
    }
  }

  const strings = Array.from({ length: count }, (_, index) => {
    const start = chunk.offset + offsets[index];
    const end = chunk.offset + offsets[index + 1];
    if (end <= start || view.getUint8(end - 1) !== 0) {
      throw new Error(`AUTH ASTR string ${index} is not null terminated.`);
    }
    for (let offset = start; offset < end - 1; offset += 1) {
      if (view.getUint8(offset) === 0) {
        throw new Error(`AUTH ASTR string ${index} contains an early terminator.`);
      }
    }
    return readAuthAscii(view, start, end - start - 1);
  });
  return {
    markerOffset: chunk.offset,
    chunkSize: chunk.byteLength,
    strings: Object.freeze(strings),
    trailingByteCount,
  };
}
