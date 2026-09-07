function bytesOf(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("native scroll sprite bytes are required");
}

function fourcc(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function uint32(view, offset, label) {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error(`native scroll sprite ${label} is truncated`);
  }
  return view.getUint32(offset, true);
}

function asciiName(bytes, offset, length) {
  const end = offset + length;
  if (offset < 0 || end > bytes.length) {
    throw new Error("native scroll sprite texture name is truncated");
  }
  const zero = bytes.subarray(offset, end).indexOf(0);
  const used = zero < 0 ? bytes.subarray(offset, end) : bytes.subarray(offset, offset + zero);
  return String.fromCharCode(...used);
}

function slotFromSourceName(sourceName, nativeSlot) {
  if (nativeSlot !== undefined) {
    if (!Number.isInteger(nativeSlot) || nativeSlot < 0 || nativeSlot > 2) {
      throw new RangeError("native scroll sprite slot must be between 0 and 2");
    }
    return nativeSlot;
  }
  const match = String(sourceName || "").toUpperCase().match(/\.SCR([0-2])$/);
  if (!match) {
    throw new Error("native scroll sprite source must end in SCR0, SCR1, or SCR2");
  }
  return Number(match[1]);
}

function parseTexture(bytes, view, offset, tileIndex) {
  if (fourcc(bytes, offset) !== "TEXN") {
    throw new Error(`native scroll sprite tile ${tileIndex} has no TEXN token`);
  }
  const tokenSpan = uint32(view, offset + 4, "TEXN span");
  const name = asciiName(bytes, offset + 8, 8);
  const gbixOffset = offset + 16;
  if (
    fourcc(bytes, gbixOffset) !== "GBIX"
    || uint32(view, gbixOffset + 4, "GBIX size") !== 4
  ) {
    throw new Error(`native scroll sprite tile ${tileIndex} has no canonical GBIX token`);
  }
  const pvrOffset = gbixOffset + 12;
  if (fourcc(bytes, pvrOffset) !== "PVRT") {
    throw new Error(`native scroll sprite tile ${tileIndex} has no PVRT token`);
  }
  const pvrSize = uint32(view, pvrOffset + 4, "PVRT size");
  const pvrByteLength = 8 + pvrSize;
  if (pvrOffset + pvrByteLength > bytes.length || pvrSize < 8) {
    throw new Error(`native scroll sprite tile ${tileIndex} PVRT payload is truncated`);
  }
  const width = view.getUint16(pvrOffset + 12, true);
  const height = view.getUint16(pvrOffset + 14, true);
  if (width === 0 || height === 0) {
    throw new Error(`native scroll sprite tile ${tileIndex} dimensions are invalid`);
  }
  const nextOffset = pvrOffset + pvrByteLength;
  if (tokenSpan !== nextOffset - offset) {
    throw new Error(`native scroll sprite tile ${tileIndex} TEXN span changed`);
  }
  return Object.freeze({
    tileIndex,
    name,
    width,
    height,
    colorFormat: bytes[pvrOffset + 8],
    dataFormat: bytes[pvrOffset + 9],
    pvrOffset,
    pvrByteLength,
    nextOffset,
  });
}

/**
 * Parse the native SCROLLxx.SPR/SCRn resource without assigning presentation
 * meaning to its control words. SCR0 resources carry SCLn vertical texture
 * tiles; SCR1/SCR2 resources may be a single bare TEXN tile. The extension is
 * the native three-slot selector used by the executable.
 */
export function parseNativeScrollSprite(value, { sourceName, nativeSlot } = {}) {
  const bytes = bytesOf(value);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const slotIndex = slotFromSourceName(sourceName, nativeSlot);
  let offset = 0;
  let wrapped = false;
  const tiles = [];

  if (fourcc(bytes, offset) === "SCRL") {
    if (uint32(view, offset + 4, "SCRL span") !== 8) {
      throw new Error("native scroll sprite SCRL header changed");
    }
    wrapped = true;
    offset += 8;
  }

  while (offset + 8 <= bytes.length && uint32(view, offset, "terminator") !== 0) {
    const expectedTileIndex = tiles.length;
    if (wrapped) {
      const tag = fourcc(bytes, offset);
      if (tag !== `SCL${expectedTileIndex}`) {
        throw new Error(
          `native scroll sprite expected SCL${expectedTileIndex}; found ${tag || "EOF"}`,
        );
      }
      const tileSpan = uint32(view, offset + 4, `${tag} span`);
      const tileStart = offset;
      offset += 8;
      const texture = parseTexture(bytes, view, offset, expectedTileIndex);
      if (tileSpan !== texture.nextOffset - tileStart) {
        throw new Error(`native scroll sprite ${tag} span changed`);
      }
      tiles.push(texture);
      offset = texture.nextOffset;
    } else {
      if (tiles.length > 0) {
        throw new Error("bare native scroll sprite contains multiple TEXN tiles");
      }
      const texture = parseTexture(bytes, view, offset, expectedTileIndex);
      tiles.push(texture);
      offset = texture.nextOffset;
    }
  }

  if (tiles.length === 0) throw new Error("native scroll sprite has no texture tiles");
  if (offset + 8 !== bytes.length || bytes.some((byte, index) => index >= offset && byte !== 0)) {
    throw new Error("native scroll sprite terminator changed");
  }
  const width = tiles[0].width;
  if (tiles.some(tile => tile.width !== width)) {
    throw new Error("native scroll sprite vertical tile widths differ");
  }
  return Object.freeze({
    sourceName: String(sourceName),
    slotIndex,
    containerKind: wrapped ? "SCRL" : "TEXN",
    width,
    height: tiles.reduce((total, tile) => total + tile.height, 0),
    tiles: Object.freeze(tiles),
  });
}
