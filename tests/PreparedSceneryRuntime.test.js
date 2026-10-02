import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {PreparedSceneryRuntime} from "../play/world/PreparedSceneryRuntime.js";
import {SCENERY_BUNDLE_SCHEMA} from "../src/rendering/PreparedSceneryBundle.js";
import {WORLDS} from "../play/config/worlds.js";
import {ScheduledSceneObjectCatalog} from "../play/world/ScheduledSceneObjectCatalog.js";
import {auditFixedSceneryPlacements} from "../tools/assets/scenery-placement-policy.js";

test("prepared gameplay removes only approved fixed placements and rejects stale inputs", async () => {
  const files = ["play/data/d000-runtime-placements.json",
    "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"];
  const bytes = await Promise.all(files.map(file => readFile(new URL(`../${file}`, import.meta.url))));
  const world = WORLDS.dobuita;
  const audit = auditFixedSceneryPlacements(world.placements,
    new ScheduledSceneObjectCatalog(JSON.parse(bytes[1])).definitions(world.id), JSON.parse(bytes[2]));
  const manifest = {schema: SCENERY_BUNDLE_SCHEMA, provenance: {area: "D000", placements: audit,
    sources: files.map((file, i) => ({file, hash: createHash("sha256").update(bytes[i]).digest("hex")}))}};
  const runtime = new PreparedSceneryRuntime({});
  runtime.read = async path => path.endsWith("world.json")
    ? new TextEncoder().encode(JSON.stringify(manifest)) : bytes[files.indexOf(path.slice(1))];
  const plan = await runtime.plan(world);
  assert.equal(plan.placements.length, 98);
  assert.ok(plan.placements.every(row => world.placements.includes(row)));
  assert.equal(runtime.supports(world), true);
  assert.equal(runtime.supports({...world, id: "yamanose"}), false);
  manifest.provenance.sources[0].hash = "stale";
  await assert.rejects(runtime.plan(world), /input changed/);
});
