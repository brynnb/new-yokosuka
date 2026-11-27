// Wavefront uses separate color and opacity maps. Keep the decoded color bytes
// (including RGB under zero alpha) intact when packaging the source artwork.
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Material } from "@babylonjs/core/Materials/material.js";

const crcTable = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

async function encodePng({width, height, pixels}, opacityMap) {
  const color = !opacityMap;
  // Blender's OBJ importer connects map_d's Alpha output. Other importers
  // read its grayscale channel. Carry the same opacity in both.
  const channels = color ? 4 : 2;
  const rowLength = width * channels;
  const rows = new Uint8Array((rowLength + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (rowLength + 1) + 1; // Filter type 0 precedes each row.
    const src = y * width * 4;
    if (color) {
      rows.set(pixels.subarray(src, src + rowLength), start);
    } else {
      for (let x = 0; x < width; x++) {
        const alpha = pixels[src + x * 4 + 3];
        const opacity = alpha < opacityMap.cutoff ? 0 : (opacityMap.binary ? 255 : alpha);
        rows[start + x * 2] = opacity;
        rows[start + x * 2 + 1] = opacity;
      }
    }
  }
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8; // bits per channel
  header[9] = color ? 6 : 4; // truecolor with alpha, or grayscale with alpha
  // Stream to the native deflater when available so the viewer can repaint.
  const compressed = typeof CompressionStream === "function"
    ? new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer())
    : (await import("fflate")).zlibSync(rows);
  const chunks = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk("IHDR", header), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function readImage(texture) {
  const internal = texture.getInternalTexture?.();
  const {width, height} = texture.getSize();
  const length = width * height * 4;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0
    || !Number.isSafeInteger(length) || texture.isCube || texture.is3D || texture.is2DArray) {
    throw new Error(`Unsupported OBJ texture dimensions for ${texture.name || "unnamed texture"}`);
  }
  let source = internal?._bufferView;
  // RawTexture retains pre-upload texels with their original row order. WebGL
  // readPixels instead always starts at the bottom of the uploaded texture.
  let flip = !internal?.invertY;
  if (!(source instanceof Uint8Array) || source.length !== length
    || internal.format !== Constants.TEXTUREFORMAT_RGBA || internal.type !== Constants.TEXTURETYPE_UNSIGNED_BYTE) {
    source = await texture.readPixels();
    flip = true;
    if (source instanceof Float32Array) source = Uint8ClampedArray.from(source, n => 255 * n);
    if (!(source instanceof Uint8Array || source instanceof Uint8ClampedArray) || source.length !== length) {
      throw new Error(`Could not read RGBA pixels for ${texture.name || "unnamed texture"}`);
    }
  }
  let pixels = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  if (flip) {
    pixels = new Uint8Array(length);
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      pixels.set(source.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
    }
  }
  return {width, height, pixels};
}

function opacityMapFor(material, texture) {
  const mode = material.transparencyMode;
  if (mode === Material.MATERIAL_OPAQUE || !texture.hasAlpha) return null;
  const testAndBlend = mode === Material.MATERIAL_ALPHATESTANDBLEND;
  if (testAndBlend || mode === Material.MATERIAL_ALPHATEST || material._mt5AlphaMode === "alphatest") {
    const cutoff = Math.ceil(255 * (material.alphaCutOff ?? 0.5));
    return {cutoff, binary: !testAndBlend, suffix: (testAndBlend ? "-cutout-blend-" : "-mask-") + cutoff};
  }
  return material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture
    ? {cutoff: 0, binary: false, suffix: "-opacity"} : null;
}

function colorLine(color, fallback) {
  return color ? `${color.r} ${color.g} ${color.b}` : fallback;
}

export async function createViewerObjMaterials(materials, {includeImages = true, onProgress} = {}) {
  const images = new Map();
  const byResource = new Map();
  const byName = new Map();
  const lines = [];
  let completed = 0;
  onProgress?.(completed, materials.size);

  async function imageFor(texture) {
    const resource = texture.getInternalTexture?.() || texture;
    if (byResource.has(resource)) return byResource.get(resource);
    const image = await readImage(texture);
    const hash = crc32(image.pixels).toString(16).padStart(8, "0");
    const stem = `textures/${image.width}x${image.height}-${hash}`;
    let name = stem;
    let suffix = 1;
    // CRC collisions must never substitute different artwork.
    while (byName.has(name)) {
      const other = byName.get(name);
      if (image.pixels.every((byte, i) => byte === other.pixels[i])) {
        byResource.set(resource, other);
        return other;
      }
      name = `${stem}-${++suffix}`;
    }
    image.name = name;
    byName.set(name, image);
    byResource.set(resource, image);
    return image;
  }

  for (const [material, id] of materials) {
    lines.push(`newmtl ${id}`, `Ka ${colorLine(material?.ambientColor, "0 0 0")}`,
      `Kd ${colorLine(material?.diffuseColor ?? material?.albedoColor, "1 1 1")}`,
      `Ks ${colorLine(material?.specularColor, "0 0 0")}`, `Ke ${colorLine(material?.emissiveColor, "0 0 0")}`,
      `Ns ${material?.specularPower ?? 0}`, `d ${material?.alpha ?? 1}`, "illum 2");
    const texture = material?.diffuseTexture ?? material?.albedoTexture;
    if (texture) {
      const image = await imageFor(texture);
      const colorPath = image.name + ".png";
      lines.push(`map_Kd ${colorPath}`);
      if (includeImages && !images.has(colorPath)) images.set(colorPath, await encodePng(image));
      const opacity = opacityMapFor(material, texture);
      if (opacity) {
        const alphaPath = image.name + opacity.suffix + ".png";
        lines.push(`map_d -imfchan m ${alphaPath}`);
        if (includeImages && !images.has(alphaPath)) images.set(alphaPath, await encodePng(image, opacity));
      }
    }
    lines.push("");
    onProgress?.(++completed, materials.size);
  }
  return {mtl: lines.join("\n"), images};
}
