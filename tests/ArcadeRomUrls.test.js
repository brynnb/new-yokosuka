import assert from "node:assert/strict";
import test from "node:test";

import { ARCADE_ROM_URLS } from "../src/ArcadeRomUrls.js";

const R2_BASE = "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev";

test("arcade ROMs always resolve from the New Yokosuka R2 bucket", () => {
  assert.deepEqual(ARCADE_ROM_URLS, {
    hangon: `${R2_BASE}/arcade/roms/hangon.zip`,
    harrier: `${R2_BASE}/arcade/roms/sharrier.zip`,
    astrob: `${R2_BASE}/arcade/roms/astrob2.zip`,
    pacman: `${R2_BASE}/arcade/roms/pacman.zip`,
    invaders: `${R2_BASE}/arcade/roms/invaders.zip`,
  });
});
