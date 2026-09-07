#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const VRAM_MASK = 0x7fffff;
const VRAM_BANK_BIT = 0x400000;

function mappedVramOffset(address) {
  const masked = address & VRAM_MASK;
  const bank = (masked & VRAM_BANK_BIT) !== 0 ? 1 : 0;
  return (
    (masked & 3)
    | ((masked & 0x3ffffc) * 2)
    | (bank * 4)
  ) >>> 0;
}

function read32BitBus(vram, address, byteCount) {
  const offset = mappedVramOffset(address) & ~(byteCount - 1);
  if (offset + byteCount > vram.length) {
    throw new Error(`Framebuffer address 0x${address.toString(16)} exceeds VRAM`);
  }
  return byteCount === 2
    ? vram.readUInt16LE(offset)
    : vram.readUInt32LE(offset);
}

export function decodePvrFramebuffer(registers, vram) {
  if (!Buffer.isBuffer(registers) || registers.length < 0x110) {
    throw new Error("PVR register image is missing required framebuffer state");
  }
  if (!Buffer.isBuffer(vram) || vram.length !== 0x800000) {
    throw new Error("Expected an 8 MiB Dreamcast VRAM image");
  }
  const control = registers.readUInt32LE(0x44);
  const sof1 = registers.readUInt32LE(0x50) & VRAM_MASK;
  const sof2 = registers.readUInt32LE(0x54) & VRAM_MASK;
  const size = registers.readUInt32LE(0x5c);
  const spgControl = registers.readUInt32LE(0xd0);
  const spgStatus = registers.readUInt32LE(0x10c);
  const depth = (control >>> 2) & 3;
  const concat = (control >>> 4) & 7;
  let width = ((size & 0x3ff) + 1) * 2;
  let height = ((size >>> 10) & 0x3ff) + 1;
  let modulus = (((size >>> 20) & 0x3ff) - 1) * 2;
  let bytesPerPixel;
  if (depth <= 1) bytesPerPixel = 2;
  else if (depth === 2) {
    bytesPerPixel = 3;
    width = Math.floor(width * 2 / 3);
    modulus = Math.floor(modulus * 2 / 3);
  } else {
    bytesPerPixel = 4;
    width = Math.floor(width / 2);
    modulus = Math.floor(modulus / 2);
  }
  const interlaced = (spgControl & 0x10) !== 0;
  let address = sof1;
  if (interlaced && width === modulus && sof2 === sof1 + width * bytesPerPixel) {
    modulus = 0;
    height *= 2;
  } else if (interlaced) {
    address = (spgStatus & 0x400) !== 0 ? sof2 : sof1;
  } else if ((control & 0x800000) === 0) {
    height = Math.min(height, 240);
  }

  const rgb = Buffer.alloc(width * height * 3);
  let output = 0;
  const writePixel = (red, green, blue) => {
    rgb[output++] = red & 0xff;
    rgb[output++] = green & 0xff;
    rgb[output++] = blue & 0xff;
  };
  for (let y = 0; y < height; y += 1) {
    if (depth === 0 || depth === 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = read32BitBus(vram, address, 2);
        if (depth === 0) {
          writePixel(
            (((pixel >>> 10) & 0x1f) << 3) | concat,
            (((pixel >>> 5) & 0x1f) << 3) | concat,
            ((pixel & 0x1f) << 3) | concat,
          );
        } else {
          writePixel(
            (((pixel >>> 11) & 0x1f) << 3) | concat,
            (((pixel >>> 5) & 0x3f) << 2) | (concat & 3),
            ((pixel & 0x1f) << 3) | concat,
          );
        }
        address += 2;
      }
    } else if (depth === 2) {
      for (let x = 0; x < width; x += 4) {
        const a = read32BitBus(vram, address, 4); address += 4;
        writePixel(a >>> 16, a >>> 8, a);
        if (x + 1 >= width) break;
        const b = read32BitBus(vram, address, 4); address += 4;
        writePixel(b >>> 8, b, a >>> 24);
        if (x + 2 >= width) break;
        const c = read32BitBus(vram, address, 4); address += 4;
        writePixel(c, b >>> 24, b >>> 16);
        if (x + 3 >= width) break;
        writePixel(c >>> 24, c >>> 16, c >>> 8);
      }
    } else {
      for (let x = 0; x < width; x += 1) {
        const pixel = read32BitBus(vram, address, 4);
        writePixel(pixel >>> 16, pixel >>> 8, pixel);
        address += 4;
      }
    }
    address += modulus * bytesPerPixel;
  }
  return { width, height, depth, rgb };
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const body = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(zlib.crc32(body), 8 + data.length);
  return chunk;
}

export function encodeRgbPng({ width, height, rgb }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    rgb.copy(scanlines, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function main() {
  const [capturePath, outputArg] = process.argv.slice(2);
  if (!capturePath) {
    console.error("Usage: node tools/emulator/extract_pvr_framebuffer.mjs CAPTURE_DIR [OUTPUT.png]");
    process.exitCode = 2;
    return;
  }
  const directory = path.resolve(capturePath);
  const output = path.resolve(outputArg || path.join(directory, "framebuffer.png"));
  const decoded = decodePvrFramebuffer(
    fs.readFileSync(path.join(directory, "pvr-registers.bin")),
    fs.readFileSync(path.join(directory, "vram.bin")),
  );
  fs.writeFileSync(output, encodeRgbPng(decoded));
  console.log(`Decoded ${decoded.width}x${decoded.height} depth-${decoded.depth} framebuffer to ${output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
