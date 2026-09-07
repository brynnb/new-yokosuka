import { R2_URL } from "./constants.js";

const arcadeRomUrl = (filename) => (
  `${R2_URL.replace(/\/+$/, "")}/arcade/roms/${filename}`
);

export const ARCADE_ROM_URLS = Object.freeze({
  hangon: arcadeRomUrl("hangon.zip"),
  harrier: arcadeRomUrl("sharrier.zip"),
  astrob: arcadeRomUrl("astrob2.zip"),
  pacman: arcadeRomUrl("pacman.zip"),
  invaders: arcadeRomUrl("invaders.zip"),
});
