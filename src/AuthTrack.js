function viewFor(input) {
  if (input instanceof DataView) return input;
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("AUTH input must be an ArrayBuffer or typed-array view.");
}

export function readAuthAscii(view, offset, length) {
  if (offset < 0 || offset + length > view.byteLength) {
    throw new Error("AUTH string extends beyond the track.");
  }
  return String.fromCharCode(
    ...Array.from(
      { length },
      (_, index) => view.getUint8(offset + index),
    ),
  );
}

export function readAuthTag(view, offset) {
  return readAuthAscii(view, offset, 4);
}

/**
 * Validate an AUTH/TRCK container and return its exact, ordered chunk table.
 *
 * Recovered AUTH resources are not searched for coincidental four-character
 * markers. Every chunk is reached through the TRCK size and the preceding
 * chunk's declared size, so malformed input fails closed.
 */
export function parseAuthTrack(input) {
  const view = viewFor(input);
  if (view.byteLength < 8 || readAuthTag(view, 0) !== "TRCK") {
    throw new Error("AUTH resource has no TRCK header.");
  }

  const byteLength = view.getUint32(4, true);
  if (byteLength !== view.byteLength) {
    throw new Error(
      `AUTH TRCK size ${byteLength} does not match input size ${view.byteLength}.`,
    );
  }

  const chunks = [];
  const byTag = new Map();
  let offset = 8;
  while (offset < byteLength) {
    if (offset + 8 > byteLength) {
      throw new Error("AUTH resource ends inside a chunk header.");
    }
    const tag = readAuthTag(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkSize < 8 || chunkSize % 4 !== 0) {
      throw new Error(`AUTH ${tag} chunk has invalid size ${chunkSize}.`);
    }
    const endOffset = offset + chunkSize;
    if (endOffset > byteLength) {
      throw new Error(`AUTH ${tag} chunk extends beyond the track.`);
    }
    if (byTag.has(tag)) {
      throw new Error(`AUTH resource contains duplicate ${tag} chunks.`);
    }
    const chunk = Object.freeze({ tag, offset, byteLength: chunkSize, endOffset });
    chunks.push(chunk);
    byTag.set(tag, chunk);
    offset = endOffset;
  }

  return {
    view,
    byteLength,
    chunks: Object.freeze(chunks),
    chunk(tag, { required = true } = {}) {
      const chunk = byTag.get(tag) || null;
      if (!chunk && required) throw new Error(`AUTH file has no ${tag} chunk.`);
      return chunk;
    },
  };
}
