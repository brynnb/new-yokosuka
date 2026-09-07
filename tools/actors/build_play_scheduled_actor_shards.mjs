#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  scheduledActorRenderWorldShards,
  scheduledActorWorldShardLoaderSource,
} from "../lib/scheduled_actor_render_manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(root, "play/data/scheduled-actors.json");
const outputDirectory = path.join(root, "play/data/scheduled-actors");
const loaderOutputPath = path.join(
  root,
  "src/PlayScheduledActorShardLoaders.generated.js",
);

const manifest = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const shards = scheduledActorRenderWorldShards(manifest);

await fs.mkdir(outputDirectory, { recursive: true });
const expectedFiles = new Set();
for (const [worldId, shard] of shards) {
  const filename = `${worldId}.json`;
  expectedFiles.add(filename);
  await fs.writeFile(
    path.join(outputDirectory, filename),
    `${JSON.stringify(shard)}\n`,
  );
}

for (const entry of await fs.readdir(outputDirectory)) {
  if (entry.endsWith(".json") && !expectedFiles.has(entry)) {
    await fs.unlink(path.join(outputDirectory, entry));
  }
}

await fs.writeFile(
  loaderOutputPath,
  scheduledActorWorldShardLoaderSource([...expectedFiles].map(
    (filename) => filename.slice(0, -".json".length),
  )),
);

process.stdout.write(
  `Wrote ${expectedFiles.size} scheduled-actor world shards.\n`,
);
