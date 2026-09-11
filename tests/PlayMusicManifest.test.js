import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync("public/music/manifest.json", "utf8"),
);

const sidebarWorlds = [
  "interior",
  "exterior",
  "yamanose",
  "sakuragaoka",
  "dobuita",
  "mfsy",
  "mksg",
  "mfbt",
  "ma00",
  "ma00race",
];

test("assigns a rendered track to each music-enabled /play sidebar world", () => {
  for (const worldId of sidebarWorlds) {
    const assignment = manifest.worlds[worldId];
    assert.ok(assignment, `${worldId} has no music assignment`);
    assert.ok(
      manifest.tracks[assignment.track],
      `${worldId} references ${assignment.track}`,
    );
    assert.match(
      assignment.mappingKind,
      /^(native|representative|user-selected)-/,
    );
    assert.ok(assignment.evidence.length > 20);
  }
});

test("uses the native Shenmue main-menu sequence for the account flow", () => {
  assert.equal(
    manifest.worlds["account-menu"].track,
    "shenmue-main-menu",
  );
  assert.equal(
    manifest.tracks["shenmue-main-menu"].source.file,
    "SPP004.SND",
  );
});

test("Hazuki Grounds shares the Hazuki Residence Interior music", () => {
  assert.equal(
    manifest.worlds.exterior.track,
    manifest.worlds.interior.track,
  );
  assert.equal(
    manifest.worlds.exterior.gain,
    manifest.worlds.interior.gain,
  );
});

test("uses the supplied racing track only for Forklift Races", () => {
  assert.equal(manifest.worlds.ma00.track, "forklift");
  assert.equal(manifest.worlds.ma00race.track, "forklift-racing");
  assert.equal(
    manifest.tracks["forklift-racing"].url,
    "/music/forklift-racing.mp3",
  );
});

test("exploration defaults use verified FREE banks without story-specific cues", () => {
  for (const world of ["yamanose", "sakuragaoka", "dobuita"]) {
    assert.equal(manifest.worlds[world].track, "free-1");
  }
  assert.equal(manifest.worlds.mfsy.track, "free-5");
  assert.equal(manifest.worlds.mfbt.track, "free-5");
  assert.equal(manifest.worlds.mksg.track, "free-10");
  for (const [id, disc, file] of [
    ["free-1", 1, "FRE0100.SND"],
    ["free-5", 2, "FRE1400.SND"],
    ["free-10", 2, "FRE1300.SND"],
  ]) {
    assert.equal(manifest.tracks[id].source.disc, disc);
    assert.equal(manifest.tracks[id].source.file, file);
    assert.equal(manifest.tracks[id].source.track, 0);
  }
});

test("You Arcade has no background music assignment; Nightfall stays available separately", () => {
  assert.equal(manifest.worlds.arcade, undefined);
  assert.equal(manifest.tracks["old-warehouse-district"].source.file, "BGM109.SND");
});

test("music assets match their provenance manifest", () => {
  const oneShotTracks = new Set([
    "dobuita-selector-18",
    "op00-open1",
    "op00-open2",
  ]);
  for (const [trackId, track] of Object.entries(manifest.tracks)) {
    if (track.url.startsWith("/")) {
      const path = `public${track.url}`;
      assert.ok(statSync(path).size > 100_000, `${path} is unexpectedly small`);
      const digest = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      assert.equal(digest, track.sha256);
    } else {
      assert.doesNotThrow(() => new URL(track.url));
      assert.match(track.sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(track.loop, !oneShotTracks.has(trackId));
    assert.ok(track.durationSeconds > 0);
    assert.match(track.url, /\.(?:mp3|ogg)$/);
    if (track.source.kind === "provided-audio-file") {
      assert.match(track.source.file, /\.(?:mp3|ogg|webm)$/);
      assert.match(track.source.sha256, /^[a-f0-9]{64}$/);
    } else if (track.source.file.endsWith(".SND")) {
      assert.equal(track.durationSeconds, 180);
      assert.match(track.source.file, /\.SND$/);
    } else {
      assert.match(track.source.file, /\.AFS#.+\.str$/i);
    }
  }
});

test("selector 18 ships its exact one-shot BGM013 render", () => {
  const track = manifest.tracks["dobuita-selector-18"];
  assert.equal(track.source.file, "BGM013.SND");
  assert.equal(track.source.groupCommand, "A8250000");
  assert.equal(track.loop, false);
});

test("OP02 exposes its exact BGM019 owner-command sequence", () => {
  const track = manifest.tracks.bgm019;
  assert.equal(track.source.file, "BGM019.SND");
  assert.equal(track.source.groupCommand, "A82B0000");
  assert.equal(
    track.sha256,
    "8391040bbbf0f68382665410173091b36188936510500fd45e646294a3441f9d",
  );
});
