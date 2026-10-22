import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nativeSelectMusicBank } from "../../play/audio/StoryExplorationMusic.js";

// Reuse published viewer audio, including disc-specific banks with the same
// filename. No audio conversion or copied binary assets are needed.
const root = new URL("../../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const viewer = read("public/music/asset-viewer-manifest.json");
const assets = read("src/runtime-assets.generated.json").assets;
const manifest = read("public/music/manifest.json");
manifest.selections = {};
for (const id of Object.keys(manifest.tracks)) {
  if (id.startsWith("story-select-")) delete manifest.tracks[id];
}
for (const [disc, first, last] of [[1, 0, 10], [2, 11, 19], [3, 20, 24]]) {
  for (let bank = first; bank <= last; bank += 1) add(disc, nativeSelectMusicBank(disc, bank * 10));
}
add(2, "YKM005.SND");

function add(disc, file) {
  const matches = Object.entries(viewer.tracks).filter(([, track]) =>
    track.source.group === 0 && track.source.track === 0
    && track.source.copies?.some(copy => copy.disc === disc && copy.path.endsWith(`/${file}`)));
  if (matches.length !== 1) throw new Error(`${disc}:${file}: expected one sequence, found ${matches.length}`);
  const [key, track] = matches[0];
  const asset = assets[`public${track.ogg_url}`];
  if (!asset?.sha256) throw new Error(`${disc}:${file}: audio is absent from the runtime asset catalogue`);
  const id = `story-select-${key.slice(0, 16)}`;
  manifest.selections[`${disc}:${file}`] = id;
  manifest.tracks[id] = {
    label: track.label, url: track.ogg_url, loop: true,
    durationSeconds: track.durationSeconds, source: track.source,
    sha256: asset.sha256,
  };
}

const path = new URL("public/music/manifest.json", root);
const text = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== text) throw new Error("Story music manifest is stale; run tools/audio/build_story_music.mjs");
} else writeFileSync(path, text);
console.log(`${process.argv.includes("--check") ? "Checked" : "Updated"} ${Object.keys(manifest.selections).length} source selections in ${fileURLToPath(path)}`);
