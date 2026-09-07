import assert from "node:assert/strict";
import test from "node:test";

import { parseChrtSceneObjectBindings } from "../tools/lib/chrt_scene_object_bindings.js";

function chrtFixture(imageProperty) {
  const strings = [
    "DefImage",
    "BOX_IMAGE",
    imageProperty,
    "BOX_MODEL.MT5",
    "Character",
    "Image",
  ];
  const stringOffsets = new Map();
  const encodedStrings = [];
  let cursor = 0x60;
  for (const value of strings) {
    stringOffsets.set(value, cursor);
    const encoded = Buffer.from(`${value}\0`, "ascii");
    encodedStrings.push(encoded);
    cursor += encoded.length;
  }
  const bytes = Buffer.alloc(cursor);
  bytes.write("CHRS", 0, "ascii");
  bytes.writeUInt32LE(0x58, 4);
  bytes.write("STRG", 0x58, "ascii");
  bytes.writeUInt32LE(cursor - 0x58, 0x5c);
  Buffer.concat(encodedStrings).copy(bytes, 0x60);

  const relative = (offset, value) => {
    bytes.writeUInt32LE(stringOffsets.get(value) - offset, offset);
  };
  relative(0x08, "DefImage");
  bytes.writeUInt32LE(0x23, 0x0c);
  relative(0x10, "BOX_IMAGE");
  bytes.writeUInt32LE(0x04, 0x14);
  relative(0x18, imageProperty);
  bytes.writeUInt32LE(0x19, 0x1c);
  bytes.writeUInt32LE(0x3f800000, 0x20);
  relative(0x24, "BOX_MODEL.MT5");

  relative(0x28, "Character");
  bytes.writeUInt32LE(0x22, 0x2c);
  bytes.write("TBOX", 0x30, "ascii");
  relative(0x38, "Image");
  bytes.writeUInt32LE(0x03, 0x3c);
  relative(0x40, "BOX_IMAGE");
  return bytes;
}

for (const imageProperty of ["Image", "IMAGE"]) {
  test(`CHRT DefImage accepts native ${imageProperty} property spelling`, () => {
    assert.deepEqual(parseChrtSceneObjectBindings(chrtFixture(imageProperty)), [{
      actorTag: "TBOX",
      image: "BOX_IMAGE",
      model: "BOX_MODEL",
      characterRecordOffset: 0x30,
      imagePropertyOffset: 0x38,
      defImageRecordOffset: 0x08,
      presentation: null,
    }]);
  });
}
