import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const inventory = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/d000-scripted-store-state.json",
      import.meta.url,
    ),
  ),
);

test("Dobuita clock geometry does not invent physical door dispatch", () => {
  assert.equal(inventory.summary.standaloneClockOverlays, 2);
  assert.equal(inventory.summary.overlaysWithContainedDoorSources, 2);
  assert.equal(inventory.summary.containedDoorSources, 2);

  const byLayer = new Map(
    inventory.overlays.map((overlay) => [overlay.layer, overlay]),
  );
  assert.equal(byLayer.get(13).openWindow.startMinute, 8 * 60);
  assert.equal(byLayer.get(13).openWindow.endMinute, 17 * 60 + 30);
  assert.equal(
    byLayer.get(13).exactHorizontalContainmentBindings[0]
      .containedDoorSources[0].dispatchKind,
    "unresolved",
  );

  assert.equal(byLayer.get(14).openWindow.startMinute, 8 * 60);
  assert.equal(byLayer.get(14).openWindow.endMinute, 19 * 60 + 30);
  const transition = byLayer.get(14).exactHorizontalContainmentBindings[0]
    .containedDoorSources[0];
  assert.equal(transition.selector, 30);
  assert.equal(transition.dispatchKind, "unresolved");
  assert.equal(transition.destination, null);
});
