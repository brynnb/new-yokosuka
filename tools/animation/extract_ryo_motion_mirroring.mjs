import fs from "node:fs";
import crypto from "node:crypto";

// Retail Shenmue 1 executable, not reconstructed code. See the address chain
// in docs/implementation/native-turn-mirroring.md.
const executable = process.argv[2] || ".disc-work/exact/1ST_READ.BIN";
const output = process.argv[3] || "src/data/native-motion-mirroring.json";
const bytes = fs.readFileSync(executable);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
if (sha256 !== "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c") {
  throw new Error("Unexpected executable revision; verify addresses before extracting");
}
const base = 0x0c010000;
const u32 = address => bytes.readUInt32LE(address - base);
const u8 = address => bytes[address - base];
const descriptor = u32(0x0c293ea4 + 4);
const count = u8(u32(0x0c293ea4));
if (count !== 37 || u32(0x0c29f5e4 + 0x13 * 4) !== 0x0c1adc72) {
  throw new Error("Native mirror dispatch/rig mismatch");
}
const data = {
  schema: "new-yokosuka-native-motion-mirroring-v1",
  executableSha256: sha256,
  metadataSizesAddress: "0x0c29423c",
  // This is the bounded prefix used by the native setup scan. Unknown
  // commands are reported, never searched bytewise for a spurious 0x13.
  setupRecordSizes: Array.from({ length: 32 }, (_, i) => u8(0x0c29423c + i)),
  descriptorAddress: `0x${descriptor.toString(16)}`,
  controls: Array.from({ length: count }, (_, i) => ({
    type: u8(descriptor + i * 0x24),
    swapWith: u8(descriptor + i * 0x24 + 6),
    rotationProfile: u8(descriptor + i * 0x24 + 7),
  })),
  rotationProfiles: Array.from({ length: 4 }, (_, i) => ({
    scale: Array.from({ length: 3 }, (_, j) => bytes.readFloatLE(0x0c2940cc - base + i * 24 + j * 4)),
    offset: Array.from({ length: 3 }, (_, j) => bytes.readFloatLE(0x0c2940cc - base + i * 24 + 12 + j * 4)),
  })),
};
fs.mkdirSync(new URL("../../src/data/", import.meta.url), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Extracted ${count} native mirror routes to ${output}`);
