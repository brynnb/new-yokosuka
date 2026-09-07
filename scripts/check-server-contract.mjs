import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clientRoot, resolveServerRepo } from "./server-repo.mjs";

const serverRoot = resolveServerRepo();

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
