import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(
  new URL("../play/index.html", import.meta.url),
  "utf8",
);
const poolRuntimeSource = readFileSync(
  new URL("../play/pool/MjqPoolRuntime.js", import.meta.url),
  "utf8",
);
const poolAppSource = readFileSync(
  new URL("../play/ui/react/PoolApp.jsx", import.meta.url),
  "utf8",
);

test("pool controls use the shared HUD format and match runtime inputs", () => {
  const panel = indexHtml.match(
    /<div\s+class="hud"\s+id="pool-controls-hud"[\s\S]*?<\/div>\s*<\/div>/,
  )?.[0];

  assert.ok(panel);
  for (const label of [
    "Move Camera / Aim",
    "Power",
    "Line Up / Shoot / Confirm",
    "Leave Table",
  ]) {
    assert.match(panel, new RegExp(`>${label}<`));
  }
  for (const key of ["A", "D", "W", "S", "Wheel", "Drag", "Space"]) {
    assert.match(panel, new RegExp(`<kbd>${key}</kbd>`));
  }
  assert.match(panel, /<kbd data-control-binding="cancel">X<\/kbd>/);
});

test("pool controls are shown and hidden with active pool play", () => {
  assert.match(
    poolRuntimeSource,
    /poolControlsHud\) this\.dom\.poolControlsHud\.hidden = false/,
  );
  assert.match(
    poolRuntimeSource,
    /poolControlsHud\) this\.dom\.poolControlsHud\.hidden = true/,
  );
});

test("pool uses a Radix UI root and X/cancel to leave the table", () => {
  assert.match(indexHtml, /<div id="pool-ui-root"><\/div>/);
  assert.match(poolRuntimeSource, /event\.code === this\.getLeaveBinding\(\)/);
});

test("pool separates scores from its compact action panel", () => {
  assert.match(poolAppSource, /className="pool-score-hud"/);
  assert.match(poolAppSource, /className="pool-action-hud"/);
  assert.match(poolAppSource, /className="pool-target-ball"/);
  assert.match(poolAppSource, /state\.targetBallNumber/);
  assert.doesNotMatch(poolAppSource, /<Slider/);
  assert.doesNotMatch(poolAppSource, /state\.(?:turn|status)/);
  assert.match(poolRuntimeSource, /targetBallNumber: snapshot\.winnerIndex/);
});
