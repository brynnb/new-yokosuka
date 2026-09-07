import { resolve } from "node:path";

export const EMULATORJS_VERSION = "4.2.3";

export const EMULATORJS_FILES = Object.freeze([
  ["data/loader.js", "emulatorjs/data/loader.js", "69e0903bf1e2f62ced78895e7e511fa26e11316f7eb734925c35e919ba1287b2"],
  ["data/emulator.min.js", "emulatorjs/data/emulator.min.js", "6aec3fd7bb2721255801b0a6af02e47e78b05e28a1822b1f213aacbd348abaee"],
  ["data/emulator.min.css", "emulatorjs/data/emulator.min.css", "16406c60b2dc3b04ae9b115e308613e6f567a0cc7068e21d9d0c1e5030fb395e"],
  ["data/compression/README.md", "emulatorjs/data/compression/README.md", "c01bf373463b6eac94ce2db8f6102010c104683bd70203e9b1343865693d1db5"],
  ["data/compression/extract7z.js", "emulatorjs/data/compression/extract7z.js", "4ac9933b995a516cb6b3ca4027db860278372a20c21c405d93ceb1998498853a"],
  ["data/compression/extractzip.js", "emulatorjs/data/compression/extractzip.js", "3cc825428724213acd43d30552a78008e0869b2326de17dee240dbff9ee2f629"],
  ["data/compression/libunrar.js", "emulatorjs/data/compression/libunrar.js", "bc35b98ec95020ec047f4762de3e66629741eee3826022195498d2a1e0fc102c"],
  ["data/compression/libunrar.wasm", "emulatorjs/data/compression/libunrar.wasm", "e4ea9bd0b13a9767916b424469e30205f47f267ecd9125ed56fb9ff0b9bc1b58"],
  ["data/cores/fbneo-wasm.data", "emulatorjs/data/cores/fbneo-wasm.data", "315a25e0bcd61d58ee0d9e8b1dbf3740b9e0ca4b7d0726f848ce1068de73437c"],
  ["data/cores/fbneo-legacy-wasm.data", "emulatorjs/data/cores/fbneo-legacy-wasm.data", "9dbb6242c028f4179549f324688b654353881beb552292f939bc6171a0828b5f"],
  ["data/cores/reports/fbneo.json", "emulatorjs/data/cores/reports/fbneo.json", "d2c5e07c2afc2b53937f14b721d7d025ad599d111e9627fc77e9b3fd17450e70"],
  ["data/cores/mame2003_plus-wasm.data", "emulatorjs/data/cores/mame2003_plus-wasm.data", "cb6d9c80a88b65d1579d16d02128a678f8d1cd3f51de1479e647cea27b13247b"],
  ["data/cores/mame2003_plus-legacy-wasm.data", "emulatorjs/data/cores/mame2003_plus-legacy-wasm.data", "a01286082b7b2b83cc10e702afaf730f5effedb49e583a6ca73f59bc28b0c12a"],
  ["data/cores/reports/mame2003_plus.json", "emulatorjs/data/cores/reports/mame2003_plus.json", "bda548626942b8878beb6de3487043eea80e633bd53dd69e7bae7457373a48a1"],
  ["LICENSE", "emulatorjs/data/EMULATORJS-LICENSE.txt", "a617fab6d251b3302b1cb2c1c94f52d1c584f6fcb2fc218ec1a475bc08053a61"],
].map(([sourcePath, outputPath, sha256]) => Object.freeze({
  sourcePath,
  outputPath,
  sha256,
})));

export function emulatorJsCacheRoot(projectRoot) {
  return resolve(projectRoot, ".dev/emulatorjs", EMULATORJS_VERSION);
}
