import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clientRoot, resolveServerRepo } from "./server-repo.mjs";

const serverRoot = resolveServerRepo();

if(process.argv.includes("--sync-vehicles")) {
  fs.writeFileSync(path.join(clientRoot,"src/data/vehicle-spawns.json"),fs.readFileSync(path.join(serverRoot,"internal/realtime/vehicle_spawns.json")));
}

// Deterministic export from the authoritative server catalogs. This updates
// only scripting contracts, never gameplay assets or unrelated configuration.
if (process.argv.includes("--sync-scripting")) {
  for (const [source, target] of [
    ["internal/scriptcontent/commands.v1.json", "play/data/server-command-registry.json"],
    ["internal/scriptevent/story_regions.json", "play/data/story-regions.json"],
    ["internal/scriptcontent/story_time.v1.json", "play/data/story-time-transitions.json"],
    ["internal/scriptcontent/story_travel.v1.json", "play/data/story-destinations.json"],
    ["internal/scriptevent/combats.json", "play/data/story-combat.json"],
    ["internal/scriptevent/challenges.json", "play/data/story-challenges.json"],
    ["internal/scriptevent/forklift_race_course.json", "src/data/forklift-race-course.json"],
    ["internal/scriptevent/navigation.json", "play/data/story-navigation.json"],
  ]) fs.writeFileSync(path.join(clientRoot, target), fs.readFileSync(path.join(serverRoot, source)));
}

function readJSON(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function withoutKeys(value, keys) {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutKeys(entry, keys));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !keys.has(key))
      .map(([key, entry]) => [key, withoutKeys(entry, keys)]));
  }
  return value;
}

assert.deepEqual(
  readJSON(clientRoot, "src/data/vehicle-spawns.json"),
  readJSON(serverRoot, "internal/realtime/vehicle_spawns.json"),
  "vehicle spawn contracts differ",
);

assert.deepEqual(
  readJSON(clientRoot, "play/data/server-command-registry.json"),
  readJSON(serverRoot, "internal/scriptcontent/commands.v1.json"),
  "script command registries differ",
);

assert.deepEqual(readJSON(clientRoot, "play/data/story-regions.json"),
  readJSON(serverRoot, "internal/scriptevent/story_regions.json"), "story region contracts differ");

assert.deepEqual(readJSON(clientRoot,"play/data/story-time-transitions.json"),
  readJSON(serverRoot,"internal/scriptcontent/story_time.v1.json"),"Story time transition catalogs differ");
assert.deepEqual(readJSON(clientRoot,"play/data/story-destinations.json"),
  readJSON(serverRoot,"internal/scriptcontent/story_travel.v1.json"),"Story destination catalogs differ");
assert.deepEqual(readJSON(clientRoot,"play/data/story-combat.json"),
  readJSON(serverRoot,"internal/scriptevent/combats.json"),"Story combat catalogs differ");
assert.deepEqual(readJSON(clientRoot,"play/data/story-challenges.json"),
  readJSON(serverRoot,"internal/scriptevent/challenges.json"),"Story challenge catalogs differ");
assert.deepEqual(readJSON(clientRoot,"src/data/forklift-race-course.json"),
  readJSON(serverRoot,"internal/scriptevent/forklift_race_course.json"),"Forklift race course contracts differ");
assert.deepEqual(readJSON(clientRoot,"play/data/story-navigation.json"),readJSON(serverRoot,"internal/scriptevent/navigation.json"),"Story navigation catalogs differ");

assert.deepEqual(
  withoutKeys(
    readJSON(clientRoot, "play/data/timed-transition-access.json"),
    new Set(["generatedFrom"]),
  ),
  withoutKeys(
    readJSON(serverRoot, "internal/travelaccess/rules.json"),
    new Set(["generatedFrom"]),
  ),
  "timed transition contracts differ",
);

assert.deepEqual(
  withoutKeys(
    readJSON(clientRoot, "play/data/vending-machines.json"),
    new Set(["source"]),
  ),
  withoutKeys(
    readJSON(serverRoot, "internal/vending/manifest.json"),
    new Set(["source"]),
  ),
  "vending contracts differ",
);

const clientAvatarIds = readJSON(
  clientRoot,
  "play/data/shenmue1-playable-avatars.generated.json",
).avatars.map(({ id }) => id).sort();
const serverAvatarIds = readJSON(
  serverRoot,
  "data/source/playable-avatars.json",
).avatars.map(({ id }) => id).sort();
assert.deepEqual(clientAvatarIds, serverAvatarIds, "playable avatar contracts differ");

assert.deepEqual(
  readJSON(clientRoot, 'play/data/shenmue2-exploration-worlds.json').worlds.map(w=>w.id).sort(),
  readJSON(serverRoot, 'internal/realtime/shenmue2_exploration_worlds.json').sort(),
  'Shenmue II exploration world allowlists differ',
);

console.log(`Client/server contracts match ${serverRoot}`);
