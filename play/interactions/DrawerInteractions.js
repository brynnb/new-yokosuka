import * as BABYLON from "@babylonjs/core";
import { containingJomoContainer } from "../../src/JomoContainerOwnership.js";
import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";
import {
  mt5BrowserRotation,
  nodeRotationMatrix,
  rotationWithAxis,
  setSourceOrderRotation,
} from "../../src/Mt5InteractionRotation.js";
import {
  DRAWER_OPEN_DISTANCE,
  evaluateDrawerClosing,
  evaluateDrawerOpening,
} from "../../src/RuntimeObjectAnimation.js";

function hierarchyBounds(root) {
  root.computeWorldMatrix(true);
  for (const node of root.getDescendants(false)) {
    node.computeWorldMatrix?.(true);
  }
  const bounds = root.getHierarchyBoundingVectors(true);
  const values = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
  ];
  if (!values.every(Number.isFinite)) return null;
  return { min: bounds.min.asArray(), max: bounds.max.asArray() };
}

export class DrawerInteractions {
  constructor({
    signedRenderKey,
    onAudioCue = () => {},
  }) {
    this.signedRenderKey = signedRenderKey;
    this.onAudioCue = onAudioCue;
    this.entries = [];
  }

  register(root, placement, travel = DRAWER_OPEN_DISTANCE) {
    const handleNode = (root._mt5Nodes || []).find(
      (node) => this.signedRenderKey(node) === 0xfe,
    )?.mesh;
    const openDirection = BABYLON.Vector3.TransformNormal(
      BABYLON.Vector3.Forward(),
      nodeRotationMatrix(root),
    ).normalize();
    const drawer = {
      root,
      handleNode,
      handleBindRotation: handleNode ? mt5BrowserRotation(handleNode) : null,
      origin: root.position.clone(),
      openDirection,
      travel,
      state: "closed",
      elapsed: 0,
      taskAddress: placement.runtime?.taskAddress || null,
      objectTag: placement.runtime?.objectTag || null,
      contents: [],
    };
    for (const node of [root, ...root.getDescendants(false)]) {
      node.metadata = {
        ...(node.metadata || {}),
        interactiveDrawer: drawer,
      };
    }
    this.entries.push(drawer);
    return drawer;
  }

  attachContainedObjects(placedRoots) {
    const containers = this.entries.map((drawer) => {
      const bounds = hierarchyBounds(drawer.root);
      return bounds ? { drawer, bounds } : null;
    }).filter(Boolean);
    for (const root of placedRoots) {
      const placement = root._runtimePlacementRecord;
      const behavior = jomoObjectBehavior(
        root._filename,
        placement?.runtime?.objectTag,
        placement?.runtime,
      );
      if (behavior.kind !== "none" && behavior.kind !== "inspect") continue;
      const bounds = hierarchyBounds(root);
      if (!bounds) continue;
      const container = containingJomoContainer(containers, bounds);
      if (!container) continue;
      for (const node of [root, ...root.getDescendants(false)]) {
        node.unfreezeWorldMatrix?.();
      }
      root.setParent(container.drawer.root);
      root._runtimeContainerObjectTag = (
        container.drawer.objectTag
        || container.drawer.taskAddress
        || null
      );
      container.drawer.contents.push(root);
    }
  }

  setPose(drawer, pose) {
    drawer.root.position.copyFrom(drawer.origin).addInPlace(
      drawer.openDirection.scale(drawer.travel * pose.progress),
    );
    if (drawer.handleNode) {
      setSourceOrderRotation(
        drawer.handleNode,
        rotationWithAxis(
          drawer.handleBindRotation,
          0,
          drawer.handleBindRotation[0] + pose.handleRotation,
        ),
      );
    }
  }

  toggle(drawer) {
    if (!drawer || ["opening", "closing"].includes(drawer.state)) return;
    const opening = drawer.state === "closed";
    if (opening) drawer.openedByPlayer = true;
    drawer.state = opening ? "opening" : "closing";
    drawer.elapsed = 0;
    this.emitNativePhaseCue(
      drawer,
      opening ? "openingStart" : "closingStart",
    );
  }

  emitNativePhaseCue(drawer, phase) {
    const position = drawer.root.getAbsolutePosition();
    this.onAudioCue({
      type: "nativeJomoDrawerPhase",
      objectTag: drawer.objectTag,
      phase,
      position: { x: position.x, y: position.y, z: position.z },
    });
  }

  update(deltaSeconds) {
    for (const drawer of this.entries) {
      if (!["opening", "closing"].includes(drawer.state)) continue;
      drawer.elapsed += deltaSeconds;
      const pose = drawer.state === "opening"
        ? evaluateDrawerOpening(drawer.elapsed)
        : evaluateDrawerClosing(drawer.elapsed);
      this.setPose(drawer, pose);
      if (pose.done) {
        const closing = drawer.state === "closing";
        drawer.state = closing ? "closed" : "open";
        if (drawer.state === "closed") drawer.openedByPlayer = false;
        drawer.elapsed = 0;
        if (closing) this.emitNativePhaseCue(drawer, "closingImpact");
      }
    }
  }

  clear() {
    this.entries.length = 0;
  }
}
