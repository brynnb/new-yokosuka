import assert from "node:assert/strict";
import test from "node:test";
import {
  shenmue2RuntimeActorBindings,
} from "../tools/lib/Shenmue2RuntimeActorBinding.js";

test("S2 native actor records bind exact HUMANS codes to controllers", () => {
  const ram = Buffer.alloc(0x400);
  const ordinaryController = 0x8c123408;
  ram.write("00B_", 0x80, "ascii");
  ram.writeUInt32LE(ordinaryController, 0x88);
  ram.writeUInt32LE(ordinaryController, 0xa4);

  const storyController = 0x8c567808;
  ram.write("CLMD", 0x180, "ascii");
  ram.writeUInt32LE(storyController, 0x1ac);
  ram.write("HOI_", 0x1cc, "ascii");

  const bindings = shenmue2RuntimeActorBindings(
    ram,
    ["00B_", "HOI_"],
  );
  assert.equal(bindings.get(ordinaryController).actorCode, "00B_");
  assert.match(bindings.get(ordinaryController).observations[0].method, /0x08/);
  assert.equal(bindings.get(storyController).actorCode, "HOI_");
  assert.match(bindings.get(storyController).observations[0].method, /CLMD/);
});

test("S2 actor binding rejects conflicting codes for one controller", () => {
  const ram = Buffer.alloc(0x200);
  const controller = 0x8c123408;
  for (const [offset, code] of [[0x40, "00A_"], [0xc0, "00B_"]]) {
    ram.write(code, offset, "ascii");
    ram.writeUInt32LE(controller, offset + 0x08);
    ram.writeUInt32LE(controller, offset + 0x24);
  }
  const bindings = shenmue2RuntimeActorBindings(
    ram,
    ["00A_", "00B_"],
  );
  assert.equal(bindings.has(controller), false);
});

test("S2 CLMD records bind the special Ryo controller by its native code", () => {
  const ram = Buffer.alloc(0x200);
  const controller = 0x8c774688;
  ram.write("CLMD", 0x80, "ascii");
  ram.writeUInt32LE(controller, 0xac);
  ram.write("RYO_", 0xcc, "ascii");
  const bindings = shenmue2RuntimeActorBindings(ram, ["RYO_"]);
  const binding = bindings.get(controller);
  assert.equal(binding.actorCode, "RYO_");
  assert.equal(binding.observations[0].actorRecordAddress, "0x8c000080");
  assert.match(binding.observations[0].method, /CLMD/);
});
