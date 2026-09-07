export function normalizeTextureAddressMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return ["clamp", "repeat", "mirror"].includes(normalized)
    ? normalized
    : "repeat";
}

export function normalizeTextureCoordinateMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase().replace(/_/g, "-");
  const aliases = new Map([
    ["source", "pc"],
    ["source-raw", "pc"],
    ["raw", "pc"],
    ["u-v", "pc"],
    ["uv", "pc"],
    ["source-flipu", "pc-flipu"],
    ["source-flip-u", "pc-flipu"],
    ["source-flipv", "pc-flipv"],
    ["source-flip-v", "pc-flipv"],
    ["source-flipuv", "pc-flipuv"],
    ["source-flip-u-v", "pc-flipuv"],
    ["flip-u", "pc-flipu"],
    ["flipu", "pc-flipu"],
    ["flip-v", "pc-flipv"],
    ["flipv", "pc-flipv"],
    ["flip-uv", "pc-flipuv"],
    ["flipuv", "pc-flipuv"],
    ["swap", "viewer"],
    ["v-u", "viewer"],
    ["vu", "viewer"],
    ["rotate-cw", "source-rotate-cw"],
    ["cw", "source-rotate-cw"],
    ["rotate-ccw", "source-rotate-ccw"],
    ["ccw", "source-rotate-ccw"],
    ["rotate-180", "source-rotate-180"],
    ["180", "source-rotate-180"],
  ]);
  const value = aliases.get(normalized) || normalized;
  const allowed = new Set([
    "viewer",
    "viewer-flipu",
    "viewer-flipv",
    "viewer-flipuv",
    "pc",
    "pc-flipu",
    "pc-flipv",
    "pc-flipuv",
    "source-rotate-cw",
    "source-rotate-ccw",
    "source-rotate-180",
  ]);
  return allowed.has(value) ? value : "viewer";
}

export function textureCoordinateForSource(mode, sourceU, sourceV) {
  switch (mode) {
    case "pc": return [sourceU, sourceV];
    case "pc-flipu": return [1 - sourceU, sourceV];
    case "pc-flipv": return [sourceU, 1 - sourceV];
    case "pc-flipuv": return [1 - sourceU, 1 - sourceV];
    case "source-rotate-cw": return [1 - sourceV, sourceU];
    case "source-rotate-ccw": return [sourceV, 1 - sourceU];
    case "source-rotate-180": return [1 - sourceU, 1 - sourceV];
    case "viewer-flipu": return [1 - sourceV, sourceU];
    case "viewer-flipv": return [sourceV, 1 - sourceU];
    case "viewer-flipuv": return [1 - sourceV, 1 - sourceU];
    case "viewer":
    default:
      return [sourceV, sourceU];
  }
}

export function buildTexturePackIndex(buffer) {
  if (!buffer) return null;
  const view = new DataView(buffer);
  const index = new Map();
  let position = 0;
  while (position < buffer.byteLength - 12) {
    const high = view.getUint32(position, true);
    const low = view.getUint32(position + 4, true);
    const length = view.getUint32(position + 8, true);
    if (length === 0 || length > 0x1000000) break;
    const offset = position + 12;
    const key = `${high}_${low}`;
    if (!index.has(key)) index.set(key, { offset, length });
    position = offset + length;
  }
  return index;
}

export function readFourCC(value) {
  return String.fromCharCode(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ).replace(/\0/g, "");
}

export function textureIdHex(id) {
  if (!id) return "";
  return Array.from(id)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function isPcLengthPrefixedStripType(type) {
  return (type >= 0x10 && type <= 0x14) || (type >= 0x18 && type <= 0x1c);
}
