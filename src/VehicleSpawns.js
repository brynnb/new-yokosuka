import manifest from "./data/vehicle-spawns.json" with {
  type: "json",
};

const configuredForkliftIds = new Set(
  Object.values(manifest.worlds).flatMap(
    (world) => world.forklifts.map(({ id }) => id),
  ),
);
const dynamicForkliftPattern = /^forklift-[a-f0-9]{12}$/;

export const vehicleSpawnManifest = manifest;

export function validForkliftId(value) {
  return configuredForkliftIds.has(value)
    || dynamicForkliftPattern.test(value);
}
