import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/d000-map-layer-geometry.json",
    import.meta.url,
  ),
));

test("D000 native clock layers have exact geometry evidence", () => {
  assert.equal(report.layers.length, 12);
  assert.ok(report.summary.componentCount > 0);
  assert.ok(report.summary.triangleCount > 0);
  for (const layer of report.layers) {
    assert.match(layer.sha256, /^[0-9a-f]{64}$/);
    assert.ok(layer.componentCount > 0);
    for (const component of layer.components) {
      assert.equal(component.minimum.length, 3);
      assert.equal(component.maximum.length, 3);
      assert.ok(component.nearestStaticDoors.length > 0);
    }
  }
  assert.match(report.evidenceBoundary, /never names a store/);
});
