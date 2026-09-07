import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

import { WORLDS } from "../play/config/worlds.js";
import {
  ARCADE_CABINET_VIEWS,
  GODZILLA_VS_BIOLLANTE_HLS_URL,
} from "../play/config/arcadeFixtures.js";

test("cinema is a GLB interior with reciprocal Dobuita door interactions", () => {
  const cinema = WORLDS.cinema;
  assert.equal(cinema.interior, true);
  assert.equal(cinema.assetFormat, "GLB");
  assert.equal(cinema.assetUrl, "/assets/cinema/cinema-v6.glb");
  assert.equal(cinema.assetScale, 1.5);
  assert.equal(existsSync("public/assets/cinema/cinema-v6.glb"), true);

  const outbound = WORLDS.dobuita.transitionInteractions[0].transition;
  const inbound = cinema.transitionInteractions[0].transition;
  assert.equal(outbound.destination.worldId, "cinema");
  assert.equal(inbound.destination.worldId, "dobuita");
  assert.deepEqual(outbound.destination.browserSpawn.position, [
    6.675,
    0.750597,
    -9.705,
  ]);
  assert.equal(outbound.destination.browserSpawn.yaw, -Math.PI / 2);
  assert.deepEqual(inbound.destination.browserSpawn.position, [
    40.19,
    0.07,
    44.94,
  ]);
  assert.deepEqual(cinema.transitionInteractions[0].position, [
    8.67,
    1.89,
    -9.705,
  ]);
});

test("cinema screen carries the synchronized Godzilla movie", () => {
  const screen = ARCADE_CABINET_VIEWS.cinemaScreen;
  assert.equal(screen.worldId, "cinema");
  assert.equal(screen.audioChannel, "tv");
  assert.equal(screen.attractUrl, GODZILLA_VS_BIOLLANTE_HLS_URL);
  assert.deepEqual(screen.bottomLeft, [
    6.77651276,
    1.95702201,
    -11.8559823,
  ]);
  assert.deepEqual(screen.topRight, [
    -6.87302576,
    7.88041347,
    -11.8559823,
  ]);
  assert.deepEqual(screen.frontNormal, [0, 0, 1]);
});
