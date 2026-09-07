#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseShenmue2AreaTable } from "../lib/shenmue2-area-table.mjs";
import {
  parseShenmue2WorldCollisions,
} from "../lib/shenmue2-world-collisions.mjs";
import { parseMt7 } from "../../src/Mt7Parser.js";

const PORTAL_HALF_WIDTH = 6;
const PORTAL_EDGE_PADDING = 1.5;
const PORTAL_VERTICAL_TOLERANCE = 12;
const DOOR_PORTAL_VERTICAL_TOLERANCE = 2.5;
const PORTAL_OFFSET = 2;
const FULL_TURN = Math.PI * 2;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.resolve(
  process.env.SHENMUE2_DISC1_EXTRACTED_ROOT
    || path.join(repoRoot, ".disc-work/shenmue2-disc1-extracted"),
);
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "play/data/shenmue2-boundary-transitions.json");
const areaTablePath = path.join(sourceRoot, "data/MISC/AREATBL1.BIN");
const sceneRoot = path.join(sourceRoot, "data/SCENE/01");
const stagedModelRoot = path.resolve(
  process.env.SHENMUE2_STAGED_MODEL_ROOT
    || path.join(repoRoot, ".disc-work/shenmue2-disc1-models/models"),
);

// AREATBL groups omit their source-area name. These native group starts are
// the only association supplied externally; exit IDs, destinations, poses,
// and headings are decoded directly from FLDD and AREATBL records.
const OUTDOOR_GROUP_OFFSETS = Object.freeze({
  WK00: 0x0090,
  WS00: 0x02d0,
  WE00: 0x0650,
  WT00: 0x0950,
  WN00: 0x0b70,
  WR00: 0x0c90,
  WB00: 0x0e10,
  AK00: 0x0fd0,
  AR02: 0x1470,
  // AR02 and AR03 are two field maps inside the same Aberdeen AREATBL group.
  AR03: 0x1470,
});

const AREA_LABELS = Object.freeze({
  AKA3: "Fortune's Pier Free Stay Lodge",
  AKS0: "Fortune's Eatery",
  AKS1: "Blue Sky",
  AKT0: "Gambling Warehouse 0",
  AKT1: "Gambling Warehouse 1",
  AKT2: "Gambling Warehouse 2",
  AKT3: "Gambling Warehouse 3",
  AKY0: "Warehouse F",
  AR01: "Worker's Pier Intro Area",
  ARA0: "Bar Swing",
  ARC0: "Pigeon Cafe",
  ARM0: "Hong Kong Souvenirs",
  ARSF: "Rooftop Fight",
  ARZ0: "General Store",
  WB01: "Man Mo Temple",
  WECF: "Moon Cafe",
  WEG0: "Pine Game Arcade",
  WEM1: "S.I.C. Pool Hall",
  WES1: "Slot House W",
  WESM: "Specialty Shop",
  WET0: "Tomato Convenience Store",
  WKA0: "Yan Tin Apartments",
  WRS2: "Bar Liverpool",
  WSG1: "Guang Martial Arts School",
  WSY0: "Come Over Guest House",
  WTA0: "Da Yuan Apartments",
});

// Disc 1 door/interior route records. AREATBL does not store a source-area
// string, so retain the native record offsets that assign each record to the
// MAPINFO area which owns it. Destination IDs, poses, and headings are still
// decoded from the records themselves.
const AREA_ROUTE_RECORD_OFFSETS = Object.freeze({
  WK00: [0x0230],
  WS00: [0x04b0, 0x04d0, 0x04f0, 0x0510],
  WSY0: [0x0570],
  WSG1: [0x0610],
  WE00: [0x06d0, 0x06f0, 0x0710, 0x0730, 0x0750, 0x0770],
  WESM: [0x07b0],
  WEM1: [0x0810],
  WET0: [0x0850],
  WEG0: [0x0890],
  WES1: [0x08d0],
  WECF: [0x0910],
  WT00: [0x09f0],
  WTA0: [0x0af0],
  WR00: [0x0d90],
  WRS2: [0x0dd0],
  WB00: [0x0e50],
  WB01: [0x0f90],
  AK00: [
    0x1170, 0x1190, 0x11b0, 0x11d0,
    0x1210, 0x1230, 0x1250, 0x1270,
  ],
  AKY0: [0x12d0],
  AKS0: [0x12f0],
  AKS1: [0x1310],
  AKT0: [0x1330],
  AKT1: [0x1370],
  AKT2: [0x13b0],
  AKT3: [0x13f0],
  AKA3: [0x1430],
  AR02: [0x1550, 0x1870, 0x18d0, 0x18f0, 0x1910, 0x19b0],
  ARA0: [0x19f0],
  ARC0: [0x1a30],
  ARM0: [0x1a70],
  ARZ0: [0x1ab0],
});

function hex(offset) {
  return `0x${offset.toString(16).padStart(4, "0")}`;
}

function browserPosition([x, y, z]) {
  return [-x, y, z];
}

function controllerYaw(facing) {
  const value = -(facing & 0xffff) * FULL_TURN / 0x10000 + Math.PI;
  return ((value + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
}

function sourceShape(control, verticalTolerance = PORTAL_VERTICAL_TOLERANCE) {
  const approach = browserPosition(control.position);
  const nativeAngle = (control.facing & 0xffff) * FULL_TURN / 0x10000;
  const directionX = -Math.sin(nativeAngle);
  const directionZ = Math.cos(nativeAngle);
  const center = [
    approach[0] + directionX * PORTAL_OFFSET,
    approach[1],
    approach[2] + directionZ * PORTAL_OFFSET,
  ];
  const tangentX = -directionZ * PORTAL_HALF_WIDTH;
  const tangentZ = directionX * PORTAL_HALF_WIDTH;
  return {
    kind: "directional-portal",
    left: [center[0] - tangentX, center[1], center[2] - tangentZ],
    right: [center[0] + tangentX, center[1], center[2] + tangentZ],
    approach,
    edgePadding: PORTAL_EDGE_PADDING,
    verticalTolerance,
  };
}

if (!existsSync(areaTablePath)) {
  throw new Error(`Shenmue II AREATBL1 extraction not found: ${areaTablePath}`);
}
const areaTable = parseShenmue2AreaTable(readFileSync(areaTablePath));
const groups = new Map(areaTable.groups.map((group) => [group.fileOffset, group]));
const supportedAreas = new Set(Object.keys(OUTDOOR_GROUP_OFFSETS));
const outdoorGroups = new Map(Object.entries(OUTDOOR_GROUP_OFFSETS).map(
  ([area, offset]) => [area, groups.get(offset)],
));
const transitions = [];
const collisionByArea = new Map();
const allAreaTableRecords = new Map(
  areaTable.groups.flatMap((group) => group.records)
    .map((record) => [record.fileOffset, record]),
);

for (const [sourceArea, groupOffset] of Object.entries(OUTDOOR_GROUP_OFFSETS)) {
  const group = groups.get(groupOffset);
  if (!group) throw new Error(`Missing AREATBL1 group ${sourceArea} at ${hex(groupOffset)}`);
  const records = new Map(group.records.map((record) => [record.id, record]));
  const mapinfoPath = path.join(sceneRoot, sourceArea, "MAPINFO.BIN");
  const collision = parseShenmue2WorldCollisions(readFileSync(mapinfoPath));
  collisionByArea.set(sourceArea, collision);
  const field = collision.fields.find(({ id }) => id === "0000") || collision.fields[0];
  for (const control of field.controls) {
    if (control.type !== -2 || control.value !== 29 || !control.position) continue;
    const routeRecord = records.get(control.id);
    if (
      !routeRecord
      || !supportedAreas.has(routeRecord.destinationArea)
      || routeRecord.destinationArea === sourceArea
    ) continue;
    const destinationGroup = outdoorGroups.get(routeRecord.destinationArea);
    const destination = destinationGroup?.records.find(
      (record) => record.id === routeRecord.destinationEntry,
    );
    if (!destination) {
      throw new Error(
        `Missing ${routeRecord.destinationArea}/${routeRecord.destinationEntry}`
        + ` destination pose for ${sourceArea} FLDD exit ${control.id}`,
      );
    }
    transitions.push({
      id: `s2-${sourceArea.toLowerCase()}-fldd-exit-${control.id}`
        + `-to-${routeRecord.destinationArea.toLowerCase()}`
        + `-entry-${routeRecord.destinationEntry}`,
      activation: "crossing",
      source: {
        worldId: `s2${sourceArea.toLowerCase()}`,
        entry: control.id,
        shape: sourceShape(control),
      },
      destination: {
        worldId: `s2${routeRecord.destinationArea.toLowerCase()}`,
        area: routeRecord.destinationArea,
        entry: routeRecord.destinationEntry,
        browserSpawn: {
          position: browserPosition(destination.position),
          yaw: controllerYaw(destination.facing),
        },
      },
      evidence: {
        kind: "shenmue2-fldd-exit-areatbl-destination",
        source: `data/SCENE/01/${sourceArea}/MAPINFO.BIN FLDD`,
        sourceMapinfoSha256: collision.sha256,
        sourceControlType: control.type,
        sourceControlValue: control.value,
        sourceControlFileOffset: hex(control.fileOffset),
        sourceControlPointerFileOffset: hex(control.pointerFileOffset),
        destinationSource: "data/MISC/AREATBL1.BIN",
        destinationTableSha256: areaTable.sha256,
        routeRecordFileOffset: hex(routeRecord.fileOffset),
        destinationRecordFileOffset: hex(destination.fileOffset),
      },
    });
  }
}

function collisionForArea(area) {
  if (!collisionByArea.has(area)) {
    const mapinfoPath = path.join(sceneRoot, area, "MAPINFO.BIN");
    collisionByArea.set(
      area,
      parseShenmue2WorldCollisions(readFileSync(mapinfoPath)),
    );
  }
  return collisionByArea.get(area);
}

function descendants(node) {
  const result = [];
  const visit = (candidate) => {
    if (!candidate) return;
    result.push(candidate);
    visit(candidate.child);
    visit(candidate.sibling);
  };
  visit(node.child);
  return result;
}

function directChildren(node) {
  const result = [];
  let child = node.child;
  while (child) {
    result.push(child);
    child = child.sibling;
  }
  return result;
}

function isStandardDoorPanel(node) {
  if (!node.mesh) return false;
  const [x, y, z] = node.mesh.boundsCenter;
  return (
    Math.abs(Math.abs(x) - 0.45) < 0.06
    && Math.abs(y - 1.05) < 0.06
    && Math.abs(z) < 0.06
    && node.mesh.boundsRadius > 1.1
    && node.mesh.boundsRadius < 1.2
    // Glass/inset children share the leaf bounds, but the authored moving
    // node is their higher-detail parent and carries them during rotation.
    && node.mesh.totalVertexCount > 4
  );
}

function averagePosition(positions) {
  return [0, 1, 2].map((axis) => (
    positions.reduce((sum, position) => sum + position[axis], 0)
    / positions.length
  ));
}

function panelPosition(group, panel) {
  if (panel === group) return panel.position;
  if (panel.parentOffset !== group.offset) return group.position;
  const yaw = group.rotationRaw[1] * FULL_TURN / 65536;
  const [x, y, z] = panel.position;
  return [
    group.position[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
    group.position[1] + y,
    group.position[2] - x * Math.sin(yaw) + z * Math.cos(yaw),
  ];
}

function doorCandidate(node, panels, filename, looseSiblings = false) {
  return {
    node,
    panels,
    filename,
    position: averagePosition(panels.map((panel) => (
      looseSiblings ? panel.position : panelPosition(node, panel)
    ))),
    panelDirections: panels.map((panel, index) => {
      if (panel !== node && Math.abs(panel.position[0]) > 0.1) {
        return panel.position[0] < 0 ? 1 : -1;
      }
      return index === 0 ? 1 : -1;
    }),
    pickPanels: panels,
  };
}

function nativeDoorMotion(candidate) {
  const leaves = candidate.pickPanels;
  const sharedCenterPivot = (
    leaves.length === 2
    && leaves.every((leaf) => leaf.parentOffset === candidate.node.offset)
    && Math.hypot(
      leaves[0].position[0] - leaves[1].position[0],
      leaves[0].position[1] - leaves[1].position[1],
      leaves[0].position[2] - leaves[1].position[2],
    ) < 0.1
  );
  const leafCenters = leaves.map((leaf) => leaf.mesh?.boundsCenter?.[0]);
  const occupiesOppositeHalves = (
    leafCenters.every(Number.isFinite)
    && Math.min(...leafCenters) < -0.1
    && Math.max(...leafCenters) > 0.1
  );
  if (sharedCenterPivot && occupiesOppositeHalves) {
    return {
      type: "paired-sliding",
      sourceAxis: "x",
      // MT7 local-space signs are preserved in the catalog. The browser
      // reflects source X when it instantiates MT7 nodes.
      sourceDirections: leafCenters.map((center) => Math.sign(center)),
    };
  }
  return {
    type: "hinged",
    sourceAxis: "y-rotation",
    sourceDirections: [...candidate.panelDirections],
  };
}

function nativeNodePosition(node, nodesByOffset) {
  let position = [...node.position];
  let parent = nodesByOffset.get(node.parentOffset);
  while (parent) {
    const yaw = parent.rotationRaw[1] * FULL_TURN / 65536;
    const x = position[0] * parent.scale[0];
    const y = position[1] * parent.scale[1];
    const z = position[2] * parent.scale[2];
    position = [
      parent.position[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
      parent.position[1] + y,
      parent.position[2] - x * Math.sin(yaw) + z * Math.cos(yaw),
    ];
    parent = nodesByOffset.get(parent.parentOffset);
  }
  return position;
}

function nativeDoorGroups(area) {
  const filename = `S2DC_D1_${area}_MPK00_PROP.MT7`;
  const modelPath = path.join(stagedModelRoot, filename);
  if (!existsSync(modelPath)) return [];
  const model = parseMt7(readFileSync(modelPath));
  const nodesByOffset = new Map(model.nodes.map((node) => [node.offset, node]));
  const topLevelNodes = model.nodes.filter(
    (node) => node.parentOffset === model.root.offset,
  );
  const candidates = topLevelNodes
    .map((node) => doorCandidate(
      node,
      descendants(node).filter(isStandardDoorPanel),
      filename,
    ))
    .filter(({ panels }) => panels.length > 0);

  // A single native DOOR object may own a compound rendered leaf: one empty
  // animation pivot with separate opaque and inset/panel children. Animate
  // the pivot once while exposing only its visible panel children to picks.
  for (const pivot of model.nodes) {
    if (pivot.mesh) continue;
    const pickPanels = directChildren(pivot).filter(isStandardDoorPanel);
    if (pickPanels.length !== 2) continue;
    const centers = pickPanels.map((panel) => panel.mesh.boundsCenter[0]);
    if (!(centers.some((x) => x < 0) && centers.some((x) => x > 0))) {
      continue;
    }
    candidates.push({
      node: pivot,
      panels: [pivot],
      pickPanels,
      filename,
      position: nativeNodePosition(pivot, nodesByOffset),
      panelDirections: [1],
    });
  }

  // Some interiors author the two moving leaves as adjacent siblings under
  // the PROP root instead of wrapping them in a shared transform. Preserve
  // that native topology as one logical door when their edge pivots form the
  // standard 1.8-metre pair.
  const loosePanels = topLevelNodes.filter(isStandardDoorPanel);
  for (let left = 0; left < loosePanels.length; left += 1) {
    for (let right = left + 1; right < loosePanels.length; right += 1) {
      const first = loosePanels[left];
      const second = loosePanels[right];
      const separation = Math.hypot(
        first.position[0] - second.position[0],
        first.position[1] - second.position[1],
        first.position[2] - second.position[2],
      );
      if (Math.abs(separation - 1.8) > 0.1) continue;
      candidates.push(doorCandidate(
        first,
        [first, second],
        filename,
        true,
      ));
    }
  }
  return candidates;
}

function attachNativeDoorBindings() {
  const routesByArea = new Map();
  for (const transition of transitions) {
    if (transition.activation !== "interaction") continue;
    const area = transition.source.worldId.slice(2).toUpperCase();
    const routes = routesByArea.get(area) || [];
    routes.push(transition);
    routesByArea.set(area, routes);
  }

  for (const [area, routes] of routesByArea) {
    const groups = nativeDoorGroups(area);
    if (groups.length === 0) continue;
    const field = collisionForArea(area).fields.find(({ id }) => id === "0000")
      || collisionForArea(area).fields[0];
    for (const transition of routes) {
      const control = field?.controls.find((candidate) => (
        candidate.type === -2
        && candidate.value === 29
        && candidate.id === transition.source.entry
        && candidate.position
      ));
      // Prefer the native FLDD entrance controller. Story-gated doors may not
      // expose one in the default field state; those require matching DOOR
      // node IDs on both maps before the AREATBL threshold can participate.
      const destinationArea = transition.destination.area;
      const destinationField = destinationArea
        ? collisionForArea(destinationArea).fields.find(({ id }) => id === "0000")
          || collisionForArea(destinationArea).fields[0]
        : null;
      const destinationDoorNodeIds = new Set((destinationField?.controls || [])
        .filter(({ type }) => type === -7)
        .map(({ doorNodeId }) => doorNodeId));
      const doorNodePairs = field.controls
        .filter(({ type }) => type === -7)
        .map(({ doorNodeId, doorParentNodeId, fileOffset }) => ({
          nodeId: doorNodeId,
          parentNodeId: doorParentNodeId,
          sourceFileOffset: `0x${fileOffset.toString(16)}`,
        }))
        .filter(({ nodeId, parentNodeId }) => (
          destinationDoorNodeIds.has(nodeId)
        ));
      // The same native DOOR node hierarchy must exist on both sides of the
      // route. This distinguishes a real shared door object from unrelated
      // PROP geometry near an entrance controller.
      if (doorNodePairs.length === 0) continue;
      if (!control && doorNodePairs.length > 2) continue;
      const shape = transition.source.shape;
      const pose = control?.position || [
        -(shape.left[0] + shape.right[0]) / 2,
        (shape.left[1] + shape.right[1]) / 2,
        (shape.left[2] + shape.right[2]) / 2,
      ];
      const exactLeafCount = groups.filter(
        ({ panels }) => panels.length === doorNodePairs.length,
      );
      if (!control && exactLeafCount.length === 0) continue;
      const eligibleGroups = exactLeafCount.length > 0
        ? exactLeafCount
        : groups;
      const ranked = eligibleGroups.map((group) => ({
        ...group,
        distance: Math.hypot(
          group.position[0] - pose[0],
          group.position[1] - pose[1],
          group.position[2] - pose[2],
        ),
      })).sort((left, right) => left.distance - right.distance);
      const match = ranked[0];
      const runnerUpDistance = ranked[1]?.distance ?? Number.POSITIVE_INFINITY;
      const maximumMatchDistance = control ? 1 : 2.25;
      if (
        !match
        // The FLDD controller overlaps its door group. A story-gated AREATBL
        // threshold receives the width of one two-metre doorway, but only
        // after the cross-map DOOR-node and leaf-count checks above.
        || match.distance > maximumMatchDistance
        || runnerUpDistance <= maximumMatchDistance
      ) continue;
      transition.source.nativeDoor = {
        model: match.filename,
        groupNodeOffset: `0x${match.node.offset.toString(16)}`,
        panelNodeOffsets: match.panels.map(
          (panel) => `0x${panel.offset.toString(16)}`,
        ),
        pickNodeOffsets: match.pickPanels.map(
          (panel) => `0x${panel.offset.toString(16)}`,
        ),
        panelDirections: match.panelDirections,
        motion: nativeDoorMotion(match),
        binding: control
          ? "fldd-entry-to-prop-door"
          : "areatbl-door-nodes-to-prop-door",
        poseSourceFileOffset: control
          ? `0x${control.fileOffset.toString(16)}`
          : transition.evidence.routeRecordFileOffset,
        controllerNodePairs: doorNodePairs,
        matchDistance: match.distance,
        runnerUpDistance: Number.isFinite(runnerUpDistance)
          ? runnerUpDistance
          : null,
      };
    }
  }
}

const recordFor = (area, offset) => {
  const record = allAreaTableRecords.get(offset);
  if (!record) throw new Error(`Missing ${area} AREATBL record ${hex(offset)}`);
  return record;
};
const routeRecords = new Map(Object.entries(AREA_ROUTE_RECORD_OFFSETS).map(
  ([area, offsets]) => [area, offsets.map((offset) => recordFor(area, offset))],
));

function appendAreaTableRoute(sourceArea, sourceRecord, destinationRecord, {
  suffix = "",
  evidenceKind = "shenmue2-areatbl-door-pair",
} = {}) {
  if (!AREA_LABELS[sourceArea] && !supportedAreas.has(sourceArea)) return;
  const destinationArea = sourceRecord.destinationArea;
  if (!AREA_LABELS[destinationArea] && !supportedAreas.has(destinationArea)) return;
  const id = `s2-${sourceArea.toLowerCase()}-areatbl-${sourceRecord.id}`
    + `-to-${destinationArea.toLowerCase()}-${sourceRecord.destinationEntry}${suffix}`;
  if (transitions.some((transition) => transition.id === id)) return;
  transitions.push({
    id,
    activation: "interaction",
    source: {
      worldId: `s2${sourceArea.toLowerCase()}`,
      entry: sourceRecord.id,
      shape: sourceShape(
        {
          position: sourceRecord.position,
          facing: sourceRecord.facing,
        },
        DOOR_PORTAL_VERTICAL_TOLERANCE,
      ),
    },
    destination: {
      worldId: `s2${destinationArea.toLowerCase()}`,
      area: destinationArea,
      entry: sourceRecord.destinationEntry,
      browserSpawn: {
        position: browserPosition(destinationRecord.position),
        yaw: controllerYaw(destinationRecord.facing),
      },
    },
    evidence: {
      kind: evidenceKind,
      source: "data/MISC/AREATBL1.BIN",
      destinationTableSha256: areaTable.sha256,
      routeRecordFileOffset: hex(sourceRecord.fileOffset),
      destinationRecordFileOffset: hex(destinationRecord.fileOffset),
      storyStateBypassed: true,
    },
  });
}

// Add every reciprocal door/interior pair. These require an explicit click;
// their story/event conditions can be layered back on without changing the
// native routing catalog.
for (const [sourceArea, records] of routeRecords) {
  for (const sourceRecord of records) {
    const destinationArea = sourceRecord.destinationArea;
    const reciprocal = routeRecords.get(destinationArea)?.find((candidate) => (
      candidate.id === sourceRecord.destinationEntry
      && candidate.destinationArea === sourceArea
      && candidate.destinationEntry === sourceRecord.id
    ));
    if (reciprocal) appendAreaTableRoute(sourceArea, sourceRecord, reciprocal);
  }
}

// Some one-way/event entrances have no reciprocal AREATBL record. Preserve
// traversability with a return portal built from the same authored pose, not a
// measured browser coordinate.
for (const [sourceArea, records] of routeRecords) {
  for (const sourceRecord of records) {
    const destinationArea = sourceRecord.destinationArea;
    if (!AREA_LABELS[destinationArea]) continue;
    if (destinationArea === "ARSF") continue;
    const alreadyGenerated = transitions.some((transition) => (
      transition.source.worldId === `s2${sourceArea.toLowerCase()}`
      && transition.evidence.routeRecordFileOffset === hex(sourceRecord.fileOffset)
      && transition.destination.worldId === `s2${destinationArea.toLowerCase()}`
    ));
    if (alreadyGenerated) continue;
    appendAreaTableRoute(sourceArea, sourceRecord, sourceRecord, {
      suffix: "-one-way",
      evidenceKind: "shenmue2-areatbl-event-entrance",
    });
    const reverseRecord = {
      ...sourceRecord,
      id: sourceRecord.destinationEntry,
      destinationArea: sourceArea,
      destinationEntry: sourceRecord.id,
      facing: (sourceRecord.facing + 0x8000) & 0xffff,
    };
    appendAreaTableRoute(destinationArea, reverseRecord, sourceRecord, {
      suffix: "-generated-return",
      evidenceKind: "shenmue2-areatbl-event-return",
    });
  }
}

// ARSF's rooftop-fight seam is authored in paired FLDD controls instead of a
// reciprocal AREATBL record. Match both controls to the native AR02 entry 83.
const rooftopRecord = recordFor("AR02", 0x1870);
const parsedFields = new Map();
for (const area of ["AR02", "ARSF"]) {
  const mapinfoPath = path.join(sceneRoot, area, "MAPINFO.BIN");
  const parsed = parseShenmue2WorldCollisions(readFileSync(mapinfoPath));
  parsedFields.set(area, parsed.fields.find(({ id }) => id === "0000") || parsed.fields[0]);
}
const rooftopControls = new Map([...parsedFields].map(([area, field]) => [
  area,
  field.controls.find((control) => control.type === -2 && control.value === 29 && control.id === 82),
]));
if ([...rooftopControls.values()].every(Boolean)) {
  const [outdoorControl, rooftopControl] = [
    rooftopControls.get("AR02"),
    rooftopControls.get("ARSF"),
  ];
  const controlRoute = (sourceArea, destinationArea, sourceControl, destinationControl) => {
    const destinationEntry = destinationArea === "ARSF" ? 1 : 83;
    return ({
      id: `s2-${sourceArea.toLowerCase()}-fldd-exit-82-to-${destinationArea.toLowerCase()}`
        + `-entry-${destinationEntry}`,
      activation: "crossing",
      source: {
        worldId: `s2${sourceArea.toLowerCase()}`,
        entry: 82,
        shape: sourceShape(sourceControl),
      },
      destination: {
        worldId: `s2${destinationArea.toLowerCase()}`,
        area: destinationArea,
        entry: destinationEntry,
        browserSpawn: {
          position: browserPosition(destinationControl.position),
          yaw: controllerYaw(destinationControl.facing),
        },
      },
      evidence: {
        kind: "shenmue2-paired-fldd-event-seam",
        source: `data/SCENE/01/${sourceArea}/MAPINFO.BIN FLDD`,
        sourceControlFileOffset: hex(sourceControl.fileOffset),
        destinationControlFileOffset: hex(destinationControl.fileOffset),
        routeRecordFileOffset: hex(rooftopRecord.fileOffset),
        storyStateBypassed: true,
      },
    });
  };
  transitions.push(
    controlRoute("AR02", "ARSF", outdoorControl, rooftopControl),
    controlRoute("ARSF", "AR02", rooftopControl, outdoorControl),
  );
}

attachNativeDoorBindings();
transitions.sort((left, right) => left.id.localeCompare(right.id));
const worlds = Object.entries(AREA_LABELS).map(([area, label]) => {
  const inbound = transitions.find((transition) => transition.destination.area === area);
  if (!inbound) throw new Error(`No generated inbound transition for ${area}`);
  return {
    id: `s2${area.toLowerCase()}`,
    area,
    label,
    interior: true,
    prefix: `S2DC_D1_${area}_MPK00`,
    spawn: inbound.destination.browserSpawn,
  };
});
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  format: "new-yokosuka-shenmue2-boundary-transitions-v1",
  generatedFrom: [
    "Shenmue II MAPINFO.BIN/FLDD type -2 value 29 exit controls",
    "Shenmue II MISC/AREATBL1.BIN destination records",
    "Shenmue II MPK00/PROP.PROP MT7 physical door hierarchies",
  ],
  worlds,
  transitions,
}, null, 2)}\n`);
console.log(`Wrote ${transitions.length} Shenmue II boundary transitions to ${outputPath}`);
