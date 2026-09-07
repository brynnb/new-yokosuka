// Browser-space portal measurements copied from Shenmue Online.rar:
// modules/archive-ui/path-threshold-transitions.js (version 1.2.0),
// SHA-256 16e8397b8bf737eeb3a7a9000c8086d713cd9d06ff37f6316f1498a7759f0325.
//
// These are manually recorded browser coordinates, not decoded MAPINFO data.
export default Object.freeze([
  {
    id: "yamanose-to-sakuragaoka",
    fromWorldId: "yamanose",
    toWorldId: "sakuragaoka",
    portal: {
      left: [12.7528, 0.9415, 40.3013],
      right: [10.2517, 0.9756, 42.2797],
      approach: [12.7029, 1.031, 42.0572],
      edgePadding: 1,
      verticalTolerance: 4,
    },
    browserSpawn: {
      position: [16.7431, 1.2604, 42.6733],
      yaw: 4.480273,
    },
  },
  {
    id: "sakuragaoka-to-yamanose",
    fromWorldId: "sakuragaoka",
    toWorldId: "yamanose",
    nativeEntry: 0,
    portal: {
      left: [20.2223, 1.3967, 44.7009],
      right: [20.3928, 1.3943, 41.2725],
      approach: [18.4754, 1.3207, 42.7303],
      edgePadding: 1,
      verticalTolerance: 4,
    },
    browserSpawn: {
      position: [14.059, 1.0687, 42.0908],
      yaw: -4.850232,
    },
  },
  {
    id: "sakuragaoka-to-dobuita-road",
    fromWorldId: "sakuragaoka",
    toWorldId: "dobuita",
    nativeEntry: 1,
    portal: {
      left: [-29.1131, 0, 2.437],
      right: [-30.0995, -0.0147, 6.349],
      approach: [-24.2273, 0, 4.799],
      edgePadding: 1.25,
      verticalTolerance: 4,
    },
    browserSpawn: {
      position: [-14.3603, 0, 95.4466],
      yaw: 2.222778,
    },
  },
  {
    id: "dobuita-to-sakuragaoka-road",
    fromWorldId: "dobuita",
    toWorldId: "sakuragaoka",
    portal: {
      left: [-12.143, 0.3917, 107.4472],
      right: [-5.8053, 0.5009, 105.1558],
      approach: [-12.6641, 0, 99.3069],
      edgePadding: 1.25,
      verticalTolerance: 4,
    },
    browserSpawn: {
      position: [-24.6159, 0, 4.5209],
      yaw: 1.543009,
    },
  },
  {
    id: "sakuragaoka-to-dobuita-dirt-path",
    fromWorldId: "sakuragaoka",
    toWorldId: "dobuita",
    nativeEntry: 11,
    portal: {
      left: [-29.3522, 0, 43.6816],
      right: [-30.3318, 0, 47.7733],
      approach: [-25.1924, 0, 43.3146],
      edgePadding: 1.75,
      verticalTolerance: 4,
    },
    browserSpawn: {
      position: [-29.3072, 5.3124, 88.7597],
      yaw: 10.249782,
    },
  },
  {
    id: "dobuita-to-sakuragaoka-dirt-path",
    fromWorldId: "dobuita",
    toWorldId: "sakuragaoka",
    portal: {
      left: [-30.5985, 5.3124, 93.9186],
      right: [-26.1997, 5.3124, 98.8395],
      approach: [-27.6588, 5.3124, 92.2022],
      edgePadding: 1.75,
      verticalTolerance: 4,
    },
    browserSpawn: {
      position: [-21.0498, 0, 38.7365],
      yaw: 2.409571,
    },
  },
]);
