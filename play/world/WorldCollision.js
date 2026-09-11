import * as BABYLON from "@babylonjs/core";
import {
  isHarborCollisionFile,
  isSakuragaokaCollisionFile,
  isWorldMapFile,
} from "../../src/WorldMapFiles.js";

export function prepareWorldCollision(
  currentMeshes,
  {
    interior = false,
    nativeHorizontalCollision = false,
  } = {},
) {
  for (const root of currentMeshes) {
    const filename = root._filename || "";
    const isMapGeometry = isWorldMapFile(filename);
    const isShenmue2Map = (
      root.metadata?.shenmue2SceneAssetKind === "MAPM"
      || /^S2DC_D[1-4]_[A-Z0-9]{4}_MPK\d+_MAP\d*\.MT7$/i.test(filename)
    );
    const isInteriorMap = (
      interior
      && /^S[1-3]_[A-Z0-9]{4}_MAP(?:\d+)?\.MT5$/i.test(filename)
    );
    const isPoolEquipment = Boolean(
      root._runtimePlacementRecord?.runtime?.poolEquipment,
    );
    const isCustomWorldGeometry = Boolean(
      root.metadata?.customWorldGeometry,
    );
    const isScheduledSceneObject = root._scheduledSceneObject === true;
    const isDobuitaMap = /^S1_D000_MAP(?:\d+)?\.MT5$/i.test(filename);
    const isArcadeMap = /^S3_DGCT_MAP(?:0[1-3])?\.MT5$/i.test(filename);
    const isSeventyManBattleMap = (
      /^S3_MFBT_MAP(?:0[1-3])?\.MT5$/i.test(filename)
    );
    const isYamanoseMap = /^S1_JU00_MAP(?:\d+)?\.MT5$/i.test(filename);
    const sakuragaokaCollision = isSakuragaokaCollisionFile(filename);
    const harborCollision = isHarborCollisionFile(filename);
    const isTerrain = (
      isMapGeometry
      || isShenmue2Map
      || isArcadeMap
      || isSeventyManBattleMap
      || isCustomWorldGeometry
    );
    const visualGeometryBlocksPlayer = isInteriorMap
      || isArcadeMap
      || isSeventyManBattleMap
      || isDobuitaMap
      || isYamanoseMap
      || isShenmue2Map
      || sakuragaokaCollision
      || harborCollision
      || isCustomWorldGeometry
      || root._runtimePlacement
      || [
        "S1_JHD0_MAP.MT5",
        "S1_JHD0_MAP01.MT5",
        "S1_JHD0_MAP03.MT5",
      ].includes(filename);
    const blocksPlayer = (
      visualGeometryBlocksPlayer
      && !nativeHorizontalCollision
      && !isPoolEquipment
    );
    for (const mesh of [root, ...root.getDescendants(false)]) {
      if (mesh.metadata?.arcadeSuppressedVariant) {
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        continue;
      }
      if (
        typeof mesh.getTotalVertices !== "function"
        || mesh.getTotalVertices() <= 0
      ) continue;
      if (isScheduledSceneObject) {
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        mesh.metadata = {
          ...(mesh.metadata || {}),
          terrain: false,
          cameraBlocker: false,
          sourceModel: filename,
        };
        continue;
      }
      if (mesh.metadata?.authoredWater === true) {
        // Preserve the game's visible MT7 harbor/ocean surface, but do not
        // let its large tiled quads act as ground, player collision, or a
        // camera/raycast blocker when the player is below the street mesh.
        mesh.isPickable = true;
        mesh.checkCollisions = false;
        mesh.metadata = {
          ...(mesh.metadata || {}),
          terrain: false,
          cameraBlocker: false,
          sourceModel: filename,
        };
        continue;
      }
      if (mesh.metadata?.mt5DepthOverlay) {
        mesh.isPickable = true;
        mesh.checkCollisions = false;
        mesh.metadata = {
          ...(mesh.metadata || {}),
          terrain: false,
          cameraBlocker: false,
          sourceModel: filename,
        };
        continue;
      }
      mesh.isPickable = true;
      mesh.checkCollisions = blocksPlayer;
      mesh.metadata = {
        ...(mesh.metadata || {}),
        terrain: isTerrain,
        cameraBlocker: true,
        sourceModel: filename,
      };
    }
  }
}

export function createMapTransitionInteractionAnchors({
  scene,
  currentMeshes,
  interactions,
}) {
  for (const interaction of interactions || []) {
    const anchor = BABYLON.MeshBuilder.CreateBox(
      `${interaction.id}_interaction`,
      {
        width: interaction.size[0],
        height: interaction.size[1],
        depth: interaction.size[2],
      },
      scene,
    );
    anchor.position.set(...interaction.position);
    anchor.visibility = 0.001;
    anchor.isPickable = true;
    anchor.checkCollisions = false;
    anchor.metadata = {
      interactiveMapTransition: {
        root: anchor,
        transition: interaction.transition,
      },
      sourceModel: `${interaction.id} interaction`,
    };
    currentMeshes.push(anchor);
  }
}

export function createPoolInteractionAnchor({
  scene,
  currentMeshes,
  interaction,
  activeWorldId,
}) {
  if (activeWorldId !== interaction.worldId) return null;
  const anchor = BABYLON.MeshBuilder.CreateBox(
    `${interaction.gameId}_interaction`,
    {
      width: interaction.size[0],
      height: interaction.size[1],
      depth: interaction.size[2],
    },
    scene,
  );
  anchor.position.set(...interaction.position);
  anchor.visibility = 0.001;
  anchor.isPickable = true;
  anchor.checkCollisions = false;
  anchor.metadata = {
    interactivePool: { ...interaction, root: anchor },
    sourceModel: `${interaction.label} interaction`,
  };
  currentMeshes.push(anchor);
  return anchor;
}

export function createArcadeInteractionAnchors({
  scene,
  currentMeshes,
  interactions,
  activeWorldId,
  defaultWorldId,
}) {
  for (const interaction of interactions) {
    const interactionWorldId = interaction.worldId || defaultWorldId;
    if (activeWorldId !== interactionWorldId) continue;
    const anchor = BABYLON.MeshBuilder.CreateBox(
      `arcade_${interaction.gameId}_interaction`,
      {
        width: interaction.size[0],
        height: interaction.size[1],
        depth: interaction.size[2],
      },
      scene,
    );
    anchor.position.set(...interaction.position);
    anchor.visibility = 0.001;
    // Retained as a world-owned cabinet region, not a clickable proxy. Picking
    // uses the visible surface inside it (see ArcadePicking).
    anchor.isPickable = false;
    anchor.checkCollisions = false;
    anchor.metadata = {
      interactiveArcade: { ...interaction, root: anchor },
      sourceModel: `${interaction.label} interaction`,
    };
    currentMeshes.push(anchor);
  }
}
