import * as BABYLON from "@babylonjs/core";
import {
  validForkliftId,
  vehicleSpawnManifest,
} from "../../src/VehicleSpawns.js";

export const FORKLIFT_MODEL = vehicleSpawnManifest.defaultForkliftModel;
export const FORKLIFT_RACE_PLAYER_MODEL = (
  vehicleSpawnManifest.worlds.ma00race.forklifts[0].model
);
export const FORKLIFT_RACE_OPPONENT_MODEL = (
  vehicleSpawnManifest.worlds.ma00race.forklifts[1].model
);
export const FORKLIFT_CRATE_MODEL = "G_ITEM_GACO1KBG.MT5";
export const FORKLIFT_CRATE_SCALE = 10;
// The native ride animation owns driver height. Its root has no horizontal
// seat translation, so retain only the measured fore/aft placement here.
export const FORKLIFT_DRIVER_HORIZONTAL_OFFSET = new BABYLON.Vector3(
  0,
  0,
  -0.45,
);
export const FORKLIFT_FIRST_PERSON_CAMERA_BACK_OFFSET = 0.55;
export const FORKLIFT_INTERACTION_DISTANCE = 3;

export const FORKLIFT_ID_PATTERN = Object.freeze({
  test: validForkliftId,
});

function worldForkliftSpawns(worldId) {
  return Object.freeze(
    vehicleSpawnManifest.worlds[worldId].forklifts.map((spawn) => (
      Object.freeze({
        ...spawn,
        position: new BABYLON.Vector3(
          spawn.position.x,
          spawn.position.y,
          spawn.position.z,
        ),
      })
    )),
  );
}

function worldCargoSpawns(worldId) {
  return Object.freeze(
    vehicleSpawnManifest.worlds[worldId].cargo.map((spawn) => (
      Object.freeze({
        ...spawn,
        position: new BABYLON.Vector3(
          spawn.position.x,
          spawn.position.y,
          spawn.position.z,
        ),
      })
    )),
  );
}

export const HARBOR_FORKLIFT_CONFIG = Object.freeze({
  forkliftSpawns: worldForkliftSpawns("mfsy"),
  cargoEnabled: vehicleSpawnManifest.worlds.mfsy.cargoEnabled,
});

export const FORKLIFT_PLAYGROUND_SPAWNS = worldForkliftSpawns("ma00");
export const FORKLIFT_RACE_SPAWNS = worldForkliftSpawns("ma00race");
export const FORKLIFT_RACE_GRID_SPAWNS = Object.freeze(
  [...FORKLIFT_RACE_SPAWNS].sort(
    (left, right) => right.position.x - left.position.x,
  ),
);
export const FORKLIFT_PLAYGROUND_CARGO_SPAWNS = worldCargoSpawns("ma00");
export const FORKLIFT_PLAYGROUND_CARGO_ENABLED = (
  vehicleSpawnManifest.worlds.ma00.cargoEnabled
);
export const FORKLIFT_RACE_CARGO_ENABLED = (
  vehicleSpawnManifest.worlds.ma00race.cargoEnabled
);
export const FORKLIFT_PLAYGROUND_CARGO_SPAWN = (
  FORKLIFT_PLAYGROUND_CARGO_SPAWNS[0].position
);
export const FORKLIFT_PLAYGROUND_CARGO_ID = (
  FORKLIFT_PLAYGROUND_CARGO_SPAWNS[0].id
);
