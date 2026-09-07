import assert from "node:assert/strict";
import test from "node:test";
import { buildVmuImage } from "../tools/emulator/build_vmu_image_from_vmi_vms.mjs";

const BLOCK_SIZE = 512;

function blankVmu() {
  const image = Buffer.alloc(BLOCK_SIZE * 256);
  image.fill(0x55, 255 * BLOCK_SIZE, 255 * BLOCK_SIZE + 16);
  image.writeUInt16LE(254, 255 * BLOCK_SIZE + 0x46);
  image.writeUInt16LE(1, 255 * BLOCK_SIZE + 0x48);
  image.writeUInt16LE(253, 255 * BLOCK_SIZE + 0x4a);
  image.writeUInt16LE(13, 255 * BLOCK_SIZE + 0x4c);
  for (let block = 0; block < 200; block += 1) {
    image.writeUInt16LE(0xfffc, 254 * BLOCK_SIZE + block * 2);
  }
  return image;
}

test("VMI/VMS importer creates a native descending data chain", () => {
  const vmi = Buffer.alloc(108);
  vmi.writeUInt16LE(2001, 0x44);
  vmi.set([9, 13, 22, 49, 56, 4], 0x46);
  vmi.write("SHENMUE2_001", 0x58, "ascii");
  vmi.writeUInt32LE(700, 0x68);
  const vms = Buffer.alloc(700);
  vms.fill(0x41, 0, 512);
  vms.fill(0x42, 512);

  const image = buildVmuImage(blankVmu(), vmi, vms);
  const directory = 253 * BLOCK_SIZE;
  const fat = 254 * BLOCK_SIZE;
  assert.equal(image[directory], 0x33);
  assert.equal(image.readUInt16LE(directory + 2), 199);
  assert.equal(image.subarray(directory + 4, directory + 16).toString("ascii"), "SHENMUE2_001");
  assert.deepEqual([...image.subarray(directory + 0x10, directory + 0x18)], [
    0x20, 0x01, 0x09, 0x13, 0x22, 0x49, 0x56, 0x04,
  ]);
  assert.equal(image.readUInt16LE(directory + 0x18), 2);
  assert.equal(image.readUInt16LE(fat + 199 * 2), 198);
  assert.equal(image.readUInt16LE(fat + 198 * 2), 0xfffa);
  assert.ok(image.subarray(199 * BLOCK_SIZE, 200 * BLOCK_SIZE).every((value) => value === 0x41));
  assert.ok(image.subarray(198 * BLOCK_SIZE, 198 * BLOCK_SIZE + 188).every((value) => value === 0x42));
});

test("VMI/VMS importer rejects a mismatched payload size", () => {
  const vmi = Buffer.alloc(108);
  vmi.writeUInt32LE(513, 0x68);
  assert.throws(
    () => buildVmuImage(blankVmu(), vmi, Buffer.alloc(512)),
    /declares 513 bytes/,
  );
});
