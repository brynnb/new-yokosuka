import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function decodedDTPKSample(directory, sampleId, bankName) {
  const marker = `_Sample_${sampleId.toString(16).padStart(2, "0")}_`;
  const filename = readdirSync(directory).find((candidate) => (
    candidate.toLowerCase().includes(marker.toLowerCase())
    && candidate.toLowerCase().endsWith(".wav")
  ));
  if (!filename) {
    throw new Error(`Decoded ${bankName} sample ${marker} was not found`);
  }
  return filename;
}

export function normalizeDTPKDumpWav(input, filename) {
  if (
    input.subarray(0, 4).toString("ascii") !== "RIFF"
    || input.subarray(12, 16).toString("ascii") !== "WAVE"
    || input.subarray(16, 20).toString("ascii") !== "fmt "
    || input.subarray(44, 48).toString("ascii") !== "data"
  ) {
    throw new Error(`${filename} does not have the known 64-bit WAV layout`);
  }
  const output = Buffer.concat([
    input.subarray(0, 8),
    input.subarray(12, 24),
    input.subarray(28, 52),
    input.subarray(56),
  ]);
  const channels = output.readUInt16LE(22);
  const bitsPerSample = output.readUInt16LE(34);
  const blockAlign = channels * bitsPerSample / 8;
  const dataLength = output.readUInt32LE(40);
  if (
    output.subarray(8, 12).toString("ascii") !== "WAVE"
    || output.subarray(36, 40).toString("ascii") !== "data"
    || output.length !== 44 + dataLength
    || !Number.isInteger(blockAlign)
  ) {
    throw new Error(`${filename} could not be normalized to PCM WAV`);
  }
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt16LE(blockAlign, 32);
  return output;
}

export function setPcmSampleRate(input, sampleRate) {
  const output = Buffer.from(input);
  const blockAlign = output.readUInt16LE(32);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
  return output;
}

export function encodeDeterministicWebMOpus(input, stableKey) {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "new-yokosuka-native-audio-"),
  );
  const basename = createHash("sha256").update(stableKey).digest("hex");
  const inputPath = path.join(temporaryDirectory, `${basename}.wav`);
  const outputPath = path.join(temporaryDirectory, `${basename}.webm`);
  try {
    writeFileSync(inputPath, input);
    const result = spawnSync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-fflags", "+bitexact",
      "-i", inputPath,
      "-map_metadata", "-1",
      "-c:a", "libopus",
      "-flags:a", "+bitexact",
      "-b:a", "48k",
      "-vbr", "on",
      "-application", "lowdelay",
      "-write_crc32", "0",
      outputPath,
    ], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        `FFmpeg failed for ${stableKey}: ${
          result.stderr.trim() || `exit ${result.status}`
        }`,
      );
    }
    const output = readFileSync(outputPath);
    const uid = createHash("sha256").update(stableKey).digest().subarray(0, 8);
    for (const marker of [
      Buffer.from([0x73, 0xc5, 0x88]),
      Buffer.from([0x63, 0xc5, 0x88]),
    ]) {
      const offset = output.indexOf(marker);
      if (offset < 0 || output.indexOf(marker, offset + 1) >= 0) {
        throw new Error(
          `${stableKey} does not contain one ${marker.toString("hex")} UID`,
        );
      }
      uid.copy(output, offset + marker.length);
    }
    return output;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
