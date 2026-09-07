#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCK_SIZE = 512;
const BLOCK_COUNT = 256;
const IMAGE_SIZE = BLOCK_SIZE * BLOCK_COUNT;
const ROOT_BLOCK = 255;
const FAT_BLOCK = 254;
const DATA_LAST_BLOCK = 199;
const UNALLOCATED = 0xfffc;
const LAST_BLOCK = 0xfffa;
const VMI_SIZE = 108;

function bcd(value) {
  return (Math.floor(value / 10) << 4) | (value % 10);
}

function vmiTimestampAsDirectoryTimestamp(vmi) {
  const year = vmi.readUInt16LE(0x44);
  const values = [
    Math.floor(year / 100),
    year % 100,
    vmi[0x46],
    vmi[0x47],
    vmi[0x48],
    vmi[0x49],
    vmi[0x4a],
    vmi[0x4b],
  ];
  return Buffer.from(values.map(bcd));
}

export function buildVmuImage(baseImage, vmi, vms) {
  if (!Buffer.isBuffer(baseImage) || baseImage.length !== IMAGE_SIZE) {
    throw new Error(`Base VMU image must be exactly ${IMAGE_SIZE} bytes`);
  }
  if (!Buffer.isBuffer(vmi) || vmi.length !== VMI_SIZE) {
    throw new Error(`VMI header must be exactly ${VMI_SIZE} bytes`);
  }
  if (!Buffer.isBuffer(vms) || !vms.length) {
    throw new Error("VMS payload must not be empty");
  }
  if (!baseImage.subarray(ROOT_BLOCK * BLOCK_SIZE, ROOT_BLOCK * BLOCK_SIZE + 16)
    .every((value) => value === 0x55)) {
    throw new Error("Base image does not contain a formatted VMU root block");
  }
  const declaredSize = vmi.readUInt32LE(0x68);
  if (declaredSize !== vms.length) {
    throw new Error(
      `VMI declares ${declaredSize} bytes but VMS contains ${vms.length}`,
    );
  }
  const fileMode = vmi.readUInt16LE(0x64);
  if ((fileMode & 0x02) !== 0) {
    throw new Error("Executable VMU games are not supported by this importer");
  }
  const blockCount = Math.ceil(vms.length / BLOCK_SIZE);
  if (blockCount > 200) {
    throw new Error(`VMS needs ${blockCount} blocks; a VMU has only 200`);
  }

  const image = Buffer.from(baseImage);
  const rootOffset = ROOT_BLOCK * BLOCK_SIZE;
  const fatBlock = image.readUInt16LE(rootOffset + 0x46);
  const directoryBlock = image.readUInt16LE(rootOffset + 0x4a);
  const directoryBlockCount = image.readUInt16LE(rootOffset + 0x4c);
  if (fatBlock !== FAT_BLOCK || directoryBlockCount < 1) {
    throw new Error("Unsupported VMU management-area layout");
  }

  const directoryOffsets = [];
  for (let block = directoryBlock; block > directoryBlock - directoryBlockCount; block -= 1) {
    for (let offset = block * BLOCK_SIZE; offset < (block + 1) * BLOCK_SIZE; offset += 32) {
      directoryOffsets.push(offset);
    }
  }
  const directoryOffset = directoryOffsets.find((offset) => (
    image.subarray(offset, offset + 32).every((value) => value === 0)
  ));
  if (directoryOffset === undefined) {
    throw new Error("VMU directory has no free entry");
  }

  const fatOffset = fatBlock * BLOCK_SIZE;
  const blocks = Array.from({ length: blockCount }, (_, index) => (
    DATA_LAST_BLOCK - index
  ));
  for (const block of blocks) {
    if (image.readUInt16LE(fatOffset + block * 2) !== UNALLOCATED) {
      throw new Error(`VMU data block ${block} is already allocated`);
    }
  }
  blocks.forEach((block, index) => {
    image.writeUInt16LE(
      index + 1 < blocks.length ? blocks[index + 1] : LAST_BLOCK,
      fatOffset + block * 2,
    );
    const source = vms.subarray(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE);
    image.fill(0, block * BLOCK_SIZE, (block + 1) * BLOCK_SIZE);
    source.copy(image, block * BLOCK_SIZE);
  });

  image.fill(0, directoryOffset, directoryOffset + 32);
  image[directoryOffset] = 0x33;
  image[directoryOffset + 1] = (fileMode & 0x01) !== 0 ? 0xff : 0x00;
  image.writeUInt16LE(blocks[0], directoryOffset + 0x02);
  vmi.subarray(0x58, 0x64).copy(image, directoryOffset + 0x04);
  vmiTimestampAsDirectoryTimestamp(vmi).copy(image, directoryOffset + 0x10);
  image.writeUInt16LE(blockCount, directoryOffset + 0x18);
  image.writeUInt16LE(0, directoryOffset + 0x1a);
  return image;
}

function usage() {
  console.error(
    "Usage: node tools/emulator/build_vmu_image_from_vmi_vms.mjs BASE.bin SAVE.vmi SAVE.VMS OUT.bin",
  );
}

function main() {
  const [basePath, vmiPath, vmsPath, outputPath] = process.argv.slice(2);
  if (!basePath || !vmiPath || !vmsPath || !outputPath) {
    usage();
    process.exitCode = 2;
    return;
  }
  const image = buildVmuImage(
    fs.readFileSync(basePath),
    fs.readFileSync(vmiPath),
    fs.readFileSync(vmsPath),
  );
  fs.writeFileSync(outputPath, image);
  console.log(`Wrote ${image.length}-byte VMU image to ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
