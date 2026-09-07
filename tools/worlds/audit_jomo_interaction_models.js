#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";
import {
  CLOCK_ALARM_BODY_TRAVEL,
  CLOCK_ALARM_STRIKER_TURN,
  D000_DOOR_NODE_12_ENDPOINT,
  HINGED_DOOR_TURN,
  SLIDING_DOOR_DISTANCE,
} from "../../src/RuntimeObjectAnimation.js";

const args = process.argv.slice(2);
const manifestPath = path.resolve(
  args.shift() || "play/data/jomo-runtime-placements.json",
);
let outputPath = "";
let assetBase = (
  "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue"
);
while (args.length > 0) {
  const argument = args.shift();
  if (argument === "--out") outputPath = path.resolve(args.shift());
  else if (argument === "--asset-base") assetBase = args.shift();
  else {
    console.error(`Unknown argument: ${argument}`);
    process.exit(2);
  }
}

function signedRenderKey(node) {
  const key = node.flag & 0xffff;
  return key >= 0x8000 ? key - 0x10000 : key;
}

function requiredRouteCheck(behavior, keys) {
  const { kind } = behavior;
  if (kind === "hinged-door") {
    return {
      required: "render key 8 or 13",
      present: keys.includes(8) || keys.includes(13),
    };
  }
  if (kind === "sliding-door") {
    return {
      required: "render key 7 or 12",
      present: keys.includes(7) || keys.includes(12),
    };
  }
  if (kind === "paired-sliding-panel") {
    return {
      required: `render key ${behavior.renderNodeKey}`,
      present: keys.includes(behavior.renderNodeKey),
    };
  }
  if (kind === "d000-door") {
    return {
      required: `render key ${behavior.renderNodeKey}`,
      present: keys.includes(behavior.renderNodeKey),
    };
  }
  if (kind === "alarm-clock") {
    return {
      required: "render keys 152 and 153",
      present: keys.includes(0x98) && keys.includes(0x99),
    };
  }
  if (behavior.ambientAnimation) {
    return {
      required: `render key ${behavior.ambientAnimation.renderNodeKey}`,
      present: keys.includes(behavior.ambientAnimation.renderNodeKey),
    };
  }
  return { required: "renderable root", present: true };
}

function hierarchyVertexSnapshot(root) {
  const snapshot = new Map();
  root.computeWorldMatrix(true);
  for (const node of root.getDescendants(false)) {
    node.computeWorldMatrix?.(true);
    if (typeof node.getVerticesData !== "function") continue;
    const positions = node.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    );
    if (!positions?.length) continue;
    const world = node.getWorldMatrix();
    const worldPositions = [];
    for (let offset = 0; offset < positions.length; offset += 3) {
      const transformed = BABYLON.Vector3.TransformCoordinates(
        new BABYLON.Vector3(
          positions[offset],
          positions[offset + 1],
          positions[offset + 2],
        ),
        world,
      );
      worldPositions.push(transformed.x, transformed.y, transformed.z);
    }
    snapshot.set(node, worldPositions);
  }
  return snapshot;
}

function nodeForKey(root, renderKey) {
  return (root._mt5Nodes || []).find(
    (node) => signedRenderKey(node) === renderKey,
  )?.mesh;
}

function applyBehaviorEndpoint(root, behavior, renderKeyOverride = null) {
  if (behavior.kind === "drawer") {
    root.position.z += behavior.travel;
  } else if (behavior.kind === "hinged-door") {
    for (const renderKey of [8, 13]) {
      const node = nodeForKey(root, renderKey);
      if (node) {
        node.rotation.y += (
          renderKey === 8 ? HINGED_DOOR_TURN : -HINGED_DOOR_TURN
        );
      }
    }
  } else if (behavior.kind === "sliding-door") {
    const node = nodeForKey(root, 7) || nodeForKey(root, 12);
    if (node) node.position.x -= SLIDING_DOOR_DISTANCE;
  } else if (behavior.kind === "paired-sliding-panel") {
    const node = nodeForKey(root, behavior.renderNodeKey);
    // The production loader derives the exact endpoint from the paired
    // placement. This isolated-model audit only needs to prove that the
    // decoded render route moves visible geometry.
    if (node) node.position.x += 0.6;
  } else if (behavior.kind === "d000-door") {
    const node = nodeForKey(
      root,
      renderKeyOverride ?? behavior.renderNodeKey,
    );
    if (node) node.rotation.y += D000_DOOR_NODE_12_ENDPOINT;
  } else if (behavior.kind === "swing-door") {
    const closed = Number.isFinite(behavior.closedYawDegrees)
      ? BABYLON.Tools.ToRadians(behavior.closedYawDegrees)
      : root.rotation.y;
    const open = Number.isFinite(behavior.openYawDegrees)
      ? BABYLON.Tools.ToRadians(behavior.openYawDegrees)
      : closed + BABYLON.Tools.ToRadians(79.909058);
    root.rotation.y = open;
  } else if (behavior.kind === "alarm-clock") {
    const body = nodeForKey(root, 0x98);
    const striker = nodeForKey(root, 0x99);
    if (body) body.position.y += CLOCK_ALARM_BODY_TRAVEL;
    if (striker) striker.rotation.z += CLOCK_ALARM_STRIKER_TURN;
  }
  if (behavior.ambientAnimation?.kind === "d000-tko-node-spin") {
    const node = nodeForKey(
      root,
      behavior.ambientAnimation.renderNodeKey,
    );
    if (node) node.rotation.y += 910 * Math.PI * 2 / 65536;
  }
}

function endpointVertexDisplacement(
  root,
  behavior,
  renderKeyOverride = null,
) {
  const before = hierarchyVertexSnapshot(root);
  applyBehaviorEndpoint(root, behavior, renderKeyOverride);
  const after = hierarchyVertexSnapshot(root);
  let maximum = 0;
  for (const [mesh, beforePositions] of before) {
    const afterPositions = after.get(mesh);
    if (!afterPositions || afterPositions.length !== beforePositions.length) {
      continue;
    }
    for (let offset = 0; offset < beforePositions.length; offset += 3) {
      maximum = Math.max(
        maximum,
        Math.hypot(
          afterPositions[offset] - beforePositions[offset],
          afterPositions[offset + 1] - beforePositions[offset + 1],
          afterPositions[offset + 2] - beforePositions[offset + 2],
        ),
      );
    }
  }
  return maximum;
}

async function fetchModel(model, placement) {
  if (placement.assetFile) {
    const file = path.resolve(
      path.dirname(manifestPath),
      "../assets/dobuita",
      placement.assetFile,
    );
    const bytes = fs.readFileSync(file);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }
  if (/^https?:\/\//i.test(assetBase)) {
    const response = await fetch(`${assetBase.replace(/\/$/, "")}/${model}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.arrayBuffer();
  }
  const file = path.join(path.resolve(assetBase), model);
  const bytes = fs.readFileSync(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const representativeByModel = new Map();
for (const placement of manifest.placements) {
  const behavior = jomoObjectBehavior(
    placement.model,
    placement.runtime?.objectTag,
    placement.runtime,
  );
  if (
    behavior.kind !== "none"
    && !representativeByModel.has(placement.model)
  ) {
    representativeByModel.set(placement.model, { placement, behavior });
  }
}

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const models = [];
for (const [model, { placement, behavior }] of representativeByModel) {
  try {
    const loader = new Mt5Loader(scene);
    const roots = await loader.load(await fetchModel(model, placement), null);
    const keys = [...new Set(roots.flatMap((root) => (
      (root._mt5Nodes || []).map(signedRenderKey)
    )))].sort((left, right) => left - right);
    const route = requiredRouteCheck(behavior, keys);
    const renderable = roots.some((root) => (
      root.getDescendants(false).some((node) => (
        typeof node.getTotalVertices === "function"
        && node.getTotalVertices() > 0
      ))
    ));
    const motionRequired = (
      ![
        "inspect",
        "passive-anchor",
        "passive-scenery",
        "state-dependent-cutscene-prop",
      ].includes(behavior.kind)
      || Boolean(behavior.ambientAnimation)
    );
    const maxEndpointVertexDisplacement = roots.length
      ? endpointVertexDisplacement(roots[0], behavior)
      : 0;
    const alternateRoutePresent = (
      behavior.kind === "d000-door"
      && Number.isInteger(behavior.alternateRenderNodeKey)
      && keys.includes(behavior.alternateRenderNodeKey)
    );
    const alternateEndpointVertexDisplacement = (
      alternateRoutePresent && roots.length
        ? endpointVertexDisplacement(
          roots[0],
          behavior,
          behavior.alternateRenderNodeKey,
        )
        : null
    );
    const alternateMotionPresent = (
      !alternateRoutePresent
      || alternateEndpointVertexDisplacement > 1e-5
    );
    const motionPresent = (
      !motionRequired || maxEndpointVertexDisplacement > 1e-5
    );
    models.push({
      model,
      behavior: behavior.kind,
      rootCount: roots.length,
      renderKeys: keys,
      requiredRoute: route.required,
      routePresent: route.present,
      renderable,
      motionRequired,
      maxEndpointVertexDisplacement,
      motionPresent,
      alternateRenderNodeKey: (
        behavior.alternateRenderNodeKey ?? null
      ),
      alternateRoutePresent,
      alternateEndpointVertexDisplacement,
      alternateMotionPresent,
      status: (
        route.present
        && renderable
        && motionPresent
        && alternateMotionPresent
      )
        ? "verified"
        : "missing-route-or-motion",
    });
    roots.forEach((root) => root.dispose());
  } catch (error) {
    models.push({
      model,
      behavior: behavior.kind,
      status: "load-error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
engine.dispose();

const failures = models.filter((model) => model.status !== "verified");
const report = {
  schema: "new-yokosuka-jomo-interaction-model-audit-v1",
  source: {
    manifest: path.relative(process.cwd(), manifestPath),
    assetBase,
  },
  method: (
    "Load every distinct model assigned a browser interaction through the "
    + "production MT5 loader and verify its behavior's required render route."
  ),
  summary: {
    interactionModelCount: models.length,
    verifiedModelCount: models.length - failures.length,
    failureCount: failures.length,
  },
  failures,
  models,
};
const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encoded);
  console.log(`Wrote ${outputPath} (${failures.length} failures)`);
} else {
  process.stdout.write(encoded);
}
process.exitCode = failures.length === 0 ? 0 : 1;
