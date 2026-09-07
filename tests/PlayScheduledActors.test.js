import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  scheduledActorRenderWorldShards,
  scheduledActorWorldShardLoaderSource,
} from "../tools/lib/scheduled_actor_render_manifest.js";
import {
  composeScheduledActorDefinitions,
  createScheduledActorDefinitionCollection,
} from "../src/ScheduledActorDefinitionCollection.js";
import {
  scheduledActorMotionRequirements,
} from "../src/ScheduledActorMotionRequirements.js";
import {
  SCHEDULED_ACTOR_WORLD_SHARD_LOADERS,
} from "../src/PlayScheduledActorShardLoaders.generated.js";
import { scheduledActorsForWorld } from "../src/PlayScheduledActors.js";

const source = JSON.parse(fs.readFileSync(
  new URL("../play/data/scheduled-actors.json", import.meta.url),
));
const expectedShards = scheduledActorRenderWorldShards(source);
const ACTOR_RENDER_FIELDS = [
  "actorCode",
  "authoritative",
  "instanceId",
  "label",
  "modelCode",
  "modelOverrides",
  "routes",
  "textureFile",
];

for (const worldId of expectedShards.keys()) {
  test(`${worldId} scheduled-actor shard is a compact source projection`, () => {
    const shard = JSON.parse(fs.readFileSync(
      new URL(
        `../play/data/scheduled-actors/${worldId}.json`,
        import.meta.url,
      ),
    ));
    assert.deepEqual(shard, expectedShards.get(worldId));
    for (const actor of shard.actors) {
      const fields = Object.keys(actor).sort();
      const expectedFields = actor.secondaryObject
        ? [...ACTOR_RENDER_FIELDS, "secondaryObject"].sort()
        : ACTOR_RENDER_FIELDS;
      assert.deepEqual(fields, expectedFields);
      assert.equal("journeys" in actor, false);
      assert.equal("scheduleSelector" in actor, false);
      assert.equal("sourceFiles" in actor, false);
    }
  });
}

test("tracked scheduled-actor shards and their loader match the source", () => {
  const expectedFiles = [...expectedShards.keys()]
    .map((worldId) => `${worldId}.json`)
    .sort();
  const actualFiles = fs.readdirSync(new URL(
    "../play/data/scheduled-actors/",
    import.meta.url,
  )).filter((filename) => filename.endsWith(".json")).sort();
  assert.deepEqual(actualFiles, expectedFiles);
  assert.deepEqual(
    Object.keys(SCHEDULED_ACTOR_WORLD_SHARD_LOADERS).sort(),
    [...expectedShards.keys()].sort(),
  );
  assert.equal(
    fs.readFileSync(new URL(
      "../src/PlayScheduledActorShardLoaders.generated.js",
      import.meta.url,
    ), "utf8"),
    scheduledActorWorldShardLoaderSource(expectedShards.keys()),
  );
});

test("scheduled-actor loaders leave JSON transformation to Vite", () => {
  const loaderSource = scheduledActorWorldShardLoaderSource(
    expectedShards.keys(),
  );
  // Vite transforms JSON imports into JavaScript modules. A native JSON import
  // attribute makes Firefox expect application/json and reject Vite's module.
  assert.equal(loaderSource.includes("type: \"json\""), false);
});

test("DURN includes its native room-owned fortune teller", async () => {
  const actors = await scheduledActorsForWorld("durn");
  assert.equal(actors.length, 1);
  assert.deepEqual(actors[0], {
    actorCode: "NAMS",
    instanceId: "NAMS:durn",
    label: "Lapis Fortune Teller",
    modelCode: "NAT_L",
    position: [2.0999999046325684, 0, -3.4000000953674316],
    rotationDegrees: [0, 180, 0],
    evidence: actors[0].evidence,
  });
  assert.equal(actors[0].evidence.positionOperation, "0x0018 at 0x24d3c");
});

test("scheduled-actor shards stay compact when loaded one world at a time", () => {
  for (const worldId of expectedShards.keys()) {
    const bytes = fs.statSync(new URL(
      `../play/data/scheduled-actors/${worldId}.json`,
      import.meta.url,
    )).size;
    assert.ok(bytes < 3_000_000, `${worldId}: ${bytes} compact shard bytes`);
  }
});

test("Dobuita cutscene fallbacks preserve unique residents and motion dependencies", () => {
  const shard = expectedShards.get("dobuita");
  const activityManifest = JSON.parse(fs.readFileSync(
    new URL("../play/data/events/nativeActivityActors.json", import.meta.url),
  ));
  const residents = createScheduledActorDefinitionCollection(shard.actors, {
    localObjectModels: shard.localObjectModels,
    motionRequirements: shard.motionRequirements,
  });
  const combined = composeScheduledActorDefinitions([
    residents,
    activityManifest.worlds.dobuita,
  ]);

  const residentActorCodes = new Set(residents.map(actor => actor.actorCode));
  const uniqueFallbacks = activityManifest.worlds.dobuita.filter(
    actor => !residentActorCodes.has(actor.actorCode),
  );
  assert.equal(combined.length, residents.length + uniqueFallbacks.length);
  for (const actorCode of ["HRSK", "YKHI", "YAMA"]) {
    assert.equal(
      combined.filter(actor => actor.actorCode === actorCode).length,
      residents.filter(actor => actor.actorCode === actorCode).length,
    );
    assert.equal(
      combined.some(
        actor => actor.actorCode === actorCode && actor.activityOnly === true,
      ),
      false,
    );
  }
  assert.deepEqual(
    scheduledActorMotionRequirements(combined),
    shard.motionRequirements,
  );
  assert.deepEqual(combined.localObjectModels, shard.localObjectModels);
  assert.equal(Object.isFrozen(combined), true);
});

test("supplemental scheduled actors contribute their own dependencies", () => {
  const residents = createScheduledActorDefinitionCollection([], {
    localObjectModels: ["RESIDENT.MT5"],
    motionRequirements: { free: ["AKI_AKI_WALK_LP"] },
  });
  const supplemental = [{
    actorCode: "TEST",
    nativeDefaultMotionStateId: 633,
  }];
  const combined = composeScheduledActorDefinitions(
    [residents, supplemental],
    {
      worldId: "test",
      localObjectModelRequirements: definitions => (
        definitions === supplemental ? ["SUPPLEMENTAL.MT5"] : definitions.localObjectModels
      ),
    },
  );

  assert.deepEqual(scheduledActorMotionRequirements(combined), {
    free: ["AKI_AKI_WALK_LP", "AKI_AKI_OJIGI_LIGHT_EN"],
    mbas: [],
    mobj: [],
  });
  assert.deepEqual(combined.localObjectModels, [
    "RESIDENT.MT5",
    "SUPPLEMENTAL.MT5",
  ]);
});
