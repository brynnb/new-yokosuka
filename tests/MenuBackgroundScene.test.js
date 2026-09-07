import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MENU_BACKGROUND_COLOR,
  menuBackgroundLayout,
} from "../play/account/menuBackgroundLayout.js";

test("menu background uses the requested sky color", () => {
  assert.deepEqual(MENU_BACKGROUND_COLOR, {
    red: 76 / 255,
    green: 115 / 255,
    blue: 241 / 255,
  });
});

test("menu background keeps the logo inside portrait and landscape views", () => {
  const landscape = menuBackgroundLayout(1920, 1080);
  assert.equal(landscape.aspect, 1920 / 1080);
  assert.ok(landscape.logoSize <= 1.46);
  assert.ok(landscape.wordmarkWidth <= 1.72);

  const portrait = menuBackgroundLayout(390, 844);
  assert.equal(portrait.aspect, 390 / 844);
  assert.ok(portrait.logoSize < landscape.logoSize);
  assert.ok(portrait.logoSize <= portrait.aspect * 1.66);
  assert.ok(portrait.wordmarkWidth < landscape.wordmarkWidth);
});

test("menu background reveals the canvas only after Babylon is ready", async () => {
  const source = await readFile(
    new URL(
      "../play/account/MenuBackgroundScene.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /this\.scene\.whenReadyAsync\(\)/);
  assert.match(source, /classList\.add\("menu-scene-ready"\)/);
  assert.match(source, /ACCOUNT_MENU_VISIBILITY_EVENT/);
  assert.match(source, /0\.9 \/ ACCOUNT_MENU_FADE_SECONDS/);
});

test("menu background ambient motion is independent of reduced UI motion", async () => {
  const source = await readFile(
    new URL(
      "../play/account/MenuBackgroundScene.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /this\.elapsedSeconds \+= frameSeconds/);
  assert.doesNotMatch(
    source,
    /if \(!this\.reducedInterfaceMotion\)[\s\S]{0,100}elapsedSeconds/,
  );
  assert.match(source, /const alphaStep = this\.reducedInterfaceMotion/);
});
