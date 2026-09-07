import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  scheduledActorAreaWorlds,
} from "../tools/lib/scheduled_actor_world_mapping.js";
import {
  supportedDobuitaInteriorTransitions,
} from "../src/DobuitaInteriorTransitions.js";

const nativeMapTransitions = JSON.parse(fs.readFileSync(new URL(
  "../play/data/native-map-transitions.json",
  import.meta.url,
)));
const scheduledActors = JSON.parse(fs.readFileSync(new URL(
  "../play/data/scheduled-actors.json",
  import.meta.url,
)));
const EXPECTED_INTERIOR_AREA_WORLDS = Object.freeze({
  DAZA: "daza",
  DBHB: "dbhb",
  DBYO: "dbyo",
  DCBN: "dcbn",
  DCHA: "dcha",
  DGCT: "arcade",
  DJAZ: "djaz",
  DKPA: "dkpa",
  DKTY: "dkty",
  DPIZ: "dpiz",
  DRHT: "drht",
  DRME: "drme",
  DRSA: "drsa",
  DSBA: "dsba",
  DSKI: "dski",
  DSLI: "dsli",
  DSLT: "dslt",
  DSUS: "dsus",
  DTKY: "dtky",
  DURN: "durn",
  DYKZ: "dykz",
  TATQ: "tatq",
});

function actorAuthoredAreas(actor) {
  return new Set([
    ...(actor.playbackAreas || []),
    ...actor.scheduleVariants.flatMap((variant) => (
      variant.journeys.flatMap((journey) => journey.areas || [])
    )),
  ]);
}

test("scheduled actors use the supported Dobuita interior world mapping", () => {
  const areaWorlds = scheduledActorAreaWorlds(nativeMapTransitions);
  assert.deepEqual(scheduledActors.areaWorlds, areaWorlds);
  assert.equal(areaWorlds.DMAJ, undefined);
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED_INTERIOR_AREA_WORLDS).map(
      (area) => [area, areaWorlds[area]],
    )),
    EXPECTED_INTERIOR_AREA_WORLDS,
  );

  for (const transition of supportedDobuitaInteriorTransitions(
    nativeMapTransitions,
  )) {
    assert.equal(
      areaWorlds[transition.destination.area],
      transition.destination.worldId,
      transition.id,
    );
  }
});

test("every supported interior with authored residents gets a playback shard", () => {
  const areaWorlds = scheduledActorAreaWorlds(nativeMapTransitions);
  const playbackWorlds = new Set(scheduledActors.actors.flatMap(
    (actor) => actor.playbackWorldIds,
  ));

  for (const transition of supportedDobuitaInteriorTransitions(
    nativeMapTransitions,
  )) {
    const area = transition.destination.area;
    const hasAuthoredResident = scheduledActors.actors.some(
      (actor) => actorAuthoredAreas(actor).has(area),
    );
    if (!hasAuthoredResident) continue;
    assert.ok(playbackWorlds.has(areaWorlds[area]), transition.id);
  }
});
