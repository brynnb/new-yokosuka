import * as BABYLON from "@babylonjs/core";
import {
  mt5BrowserRotation,
  rotationWithAxis,
  setSourceOrderRotation,
} from "../../src/Mt5InteractionRotation.js";
import {
  D000_DOOR_NODE_12_ENDPOINT,
  HINGED_DOOR_TURN,
  SHENMUE2_PAIRED_SLIDING_DOOR_DISTANCE,
  SLIDING_DOOR_DISTANCE,
  evaluateD000DoorNode12,
  evaluateHingedDoor,
  evaluateShenmue2PairedSlidingDoor,
  evaluatePairedGateSwing,
  evaluateSlidingDoor,
  selectD000DoorRoute,
} from "../../src/RuntimeObjectAnimation.js";

const SWING_DOOR_OPEN_ANGLE = BABYLON.Tools.ToRadians(79.909058);

export function logicalDoorScriptObject(area, selector) {
  const normalizedArea = String(area || "").trim().toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9_-]*$/.test(normalizedArea)
    || !Number.isSafeInteger(selector)
    || selector < 0
  ) return null;
  return `${normalizedArea}.door.${selector}`;
}

function hierarchyCenter(node) {
  const bounds = node.getHierarchyBoundingVectors(true);
  return bounds.min.add(bounds.max).scale(0.5);
}

export class DoorInteractions {
  constructor({
    signedRenderKey,
    getActorPosition,
    setMetadata,
    onAudioCue = () => {},
    onCollisionStatesChanged = () => {},
  }) {
    this.signedRenderKey = signedRenderKey;
    this.getActorPosition = getActorPosition;
    this.setMetadata = setMetadata;
    this.onAudioCue = onAudioCue;
    this.onCollisionStatesChanged = onCollisionStatesChanged;
    this.entries = [];
  }

  clear() {
    this.entries.length = 0;
    this.syncCollisionStates();
  }

  add(door) {
    for (const pickRoot of door.pickRoots || [door.root]) {
      this.setMetadata(pickRoot, "interactiveDoor", door);
    }
    this.entries.push(door);
    this.syncCollisionStates();
    return door;
  }

  syncCollisionStates() {
    this.onCollisionStatesChanged(this.entries);
  }

  findNode(root, renderKey) {
    return (root._mt5Nodes || []).find(
      (node) => this.signedRenderKey(node) === renderKey,
    )?.mesh;
  }

  registerSliding(root, placement) {
    const movingNode = this.findNode(root, 0x07)
      || this.findNode(root, 0x0c);
    if (!movingNode) return null;
    return this.add({
      type: "sliding",
      root,
      nodes: [movingNode],
      bindPositions: [movingNode.position.clone()],
      collisionBindPositions: [movingNode.getAbsolutePosition().clone()],
      state: "closed",
      elapsed: 0,
      objectTag: placement.runtime?.objectTag || null,
      model: placement.model || root._filename || null,
    });
  }

  registerExteriorTransition(root, placement, behavior) {
    const nodes = behavior.renderNodeKeys
      .map((renderKey) => this.findNode(root, renderKey))
      .filter(Boolean);
    if (nodes.length !== behavior.renderNodeKeys.length) return null;
    return this.add({
      type: "exterior-swing-door",
      root,
      nodes,
      bindRotations: nodes.map(mt5BrowserRotation),
      openSide: 1,
      state: "closed",
      elapsed: 0,
      objectTag: placement.runtime?.objectTag || null,
      model: placement.model || root._filename || null,
    });
  }

  registerHinged(root, placement) {
    const routedNodes = [0x08, 0x0d].map((renderKey) => ({
      renderKey,
      node: this.findNode(root, renderKey),
    })).filter((route) => route.node);
    if (routedNodes.length === 0) return null;
    return this.add({
      type: "hinged",
      root,
      nodes: routedNodes.map((route) => route.node),
      directions: routedNodes.map(
        (route) => (route.renderKey === 0x08 ? 1 : -1),
      ),
      bindRotations: routedNodes.map(
        (route) => mt5BrowserRotation(route.node),
      ),
      state: "closed",
      elapsed: 0,
      objectTag: placement.runtime?.objectTag || null,
      model: placement.model || root._filename || null,
    });
  }

  registerShenmue2Hinged(root, panels, transition, pickRoots = null) {
    if (!root || panels.length === 0) return null;
    return this.add({
      type: "shenmue2-hinged",
      root,
      nodes: panels.map(({ transform }) => transform),
      pickRoots: pickRoots || panels.map(({ transform }) => transform),
      directions: panels.map(({ sourceNode, direction }) => (
        direction ?? (sourceNode.position[0] < 0 ? 1 : -1)
      )),
      bindQuaternions: panels.map(({ transform }) => (
        transform.rotationQuaternion.clone()
      )),
      state: "closed",
      elapsed: 0,
      model: root._filename || null,
      transition,
    });
  }

  registerShenmue2PairedSliding(root, panels, transition, pickRoots = null) {
    if (!root || panels.length !== 2) return null;
    return this.add({
      type: "shenmue2-paired-sliding",
      root,
      nodes: panels.map(({ transform }) => transform),
      pickRoots: pickRoots || panels.map(({ transform }) => transform),
      directions: panels.map(({ sourceNode, direction }) => (
        direction ?? -Math.sign(sourceNode.mesh?.boundsCenter?.[0] || 1)
      )),
      bindPositions: panels.map(({ transform }) => transform.position.clone()),
      state: "closed",
      elapsed: 0,
      model: root._filename || null,
      transition,
    });
  }

  registerPairedSlidingPanel(root, placement, behavior) {
    const movingNode = this.findNode(root, behavior.renderNodeKey);
    if (!movingNode) return null;
    return this.add({
      type: "paired-sliding-panel",
      root,
      nodes: [movingNode],
      bindPositions: [movingNode.position.clone()],
      collisionBindPositions: [movingNode.getAbsolutePosition().clone()],
      slideOffsets: null,
      pairId: behavior.pairId,
      partnerTag: behavior.partnerTag,
      state: "closed",
      elapsed: 0,
      objectTag: placement.runtime?.objectTag || null,
    });
  }

  resolvePairedSlidingPanels() {
    const panelsByTag = new Map(
      this.entries
        .filter((door) => door.type === "paired-sliding-panel")
        .map((door) => [door.objectTag, door]),
    );
    for (const panel of panelsByTag.values()) {
      const partner = panelsByTag.get(panel.partnerTag);
      if (!partner) {
        throw new Error(
          `JOMO panel ${panel.objectTag} is missing ${panel.partnerTag}.`,
        );
      }
      const node = panel.nodes[0];
      const worldOffset = hierarchyCenter(partner.nodes[0]).subtract(
        hierarchyCenter(node),
      );
      const parent = node.parent;
      const localOffset = parent
        ? BABYLON.Vector3.TransformNormal(
          worldOffset,
          parent.getWorldMatrix().clone().invert(),
        )
        : worldOffset;
      panel.slideOffsets = [localOffset];
    }
  }

  registerD000(root, placement, behavior) {
    const routedNodes = new Map();
    for (const renderKey of [
      behavior.alternateRenderNodeKey,
      behavior.renderNodeKey,
    ]) {
      const movingNode = this.findNode(root, renderKey);
      if (movingNode) routedNodes.set(renderKey, movingNode);
    }
    if (routedNodes.size === 0) return null;
    const initialRoute = selectD000DoorRoute(1, routedNodes.keys());
    return this.add({
      type: "d000-door",
      root,
      routedNodes,
      bindRotations: new Map(
        [...routedNodes].map(([renderKey, node]) => (
          [renderKey, mt5BrowserRotation(node)]
        )),
      ),
      activeRenderKey: initialRoute.renderNodeKey,
      activeNode: routedNodes.get(initialRoute.renderNodeKey),
      state: "closed",
      elapsed: 0,
      openDirection: initialRoute.browserTurnDirection,
      objectTag: placement.runtime?.objectTag || null,
      doorSelector: placement.runtime?.doorSelector,
      lockedMessage: behavior.lockedMessage || null,
    });
  }

  registerSwing(root, placement, behavior = {}) {
    const currentRotation = (placement.rotationDegrees || [0, 0, 0]).map(
      BABYLON.Tools.ToRadians,
    );
    const currentYaw = currentRotation[1];
    const canCarryCapturedPose = /^dor\d$/i.test(
      placement.runtime?.objectTag || "",
    );
    const capturedOpen = canCarryCapturedPose && (
      Math.abs(currentYaw - SWING_DOOR_OPEN_ANGLE) < Math.abs(currentYaw)
    );
    const hasAuthoredEndpoints = (
      Number.isFinite(behavior.closedYawDegrees)
      && Number.isFinite(behavior.openYawDegrees)
    );
    const closedYaw = hasAuthoredEndpoints
      ? BABYLON.Tools.ToRadians(behavior.closedYawDegrees)
      : (capturedOpen ? currentYaw - SWING_DOOR_OPEN_ANGLE : currentYaw);
    const openYaw = hasAuthoredEndpoints
      ? BABYLON.Tools.ToRadians(behavior.openYawDegrees)
      : (capturedOpen ? currentYaw : currentYaw + SWING_DOOR_OPEN_ANGLE);
    const initiallyOpen = hasAuthoredEndpoints
      ? behavior.initialState === "open"
      : capturedOpen;
    const closedRotation = rotationWithAxis(currentRotation, 1, closedYaw);
    const openRotation = rotationWithAxis(currentRotation, 1, openYaw);
    setSourceOrderRotation(
      root,
      initiallyOpen ? openRotation : closedRotation,
    );
    return this.add({
      type: "swing",
      root,
      closedRotation,
      openRotation,
      state: initiallyOpen ? "open" : "closed",
      elapsed: 0,
      objectTag: placement.runtime?.objectTag || null,
      model: placement.model || root._filename || null,
    });
  }

  setPose(door, pose) {
    if (door.type === "shenmue2-paired-sliding") {
      for (const [index, node] of door.nodes.entries()) {
        node.position.copyFrom(door.bindPositions[index]);
        node.position.x += door.directions[index]
          * SHENMUE2_PAIRED_SLIDING_DOOR_DISTANCE
          * pose.progress;
      }
      return;
    }
    if (door.type === "shenmue2-hinged") {
      for (const [index, node] of door.nodes.entries()) {
        const turn = -door.directions[index]
          * HINGED_DOOR_TURN
          * pose.progress;
        node.rotationQuaternion.copyFrom(
          door.bindQuaternions[index].multiply(
            BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, turn),
          ),
        );
      }
      return;
    }
    if (door.type === "paired-sliding-panel") {
      for (const [index, node] of door.nodes.entries()) {
        node.position.copyFrom(door.bindPositions[index]);
        node.position.addInPlace(
          door.slideOffsets[index].scale(pose.progress),
        );
      }
      return;
    }
    if (door.type === "exterior-swing-door") {
      const turns = evaluatePairedGateSwing(pose.progress, door.openSide);
      for (const [index, node] of door.nodes.entries()) {
        setSourceOrderRotation(
          node,
          rotationWithAxis(
            door.bindRotations[index],
            1,
            door.bindRotations[index][1] + turns[index],
          ),
        );
      }
      return;
    }
    if (door.type === "sliding") {
      for (const [index, node] of door.nodes.entries()) {
        node.position.copyFrom(door.bindPositions[index]);
        node.position.x -= SLIDING_DOOR_DISTANCE * pose.progress;
      }
      return;
    }
    if (door.type === "swing") {
      setSourceOrderRotation(
        door.root,
        rotationWithAxis(
          door.closedRotation,
          1,
          BABYLON.Scalar.Lerp(
            door.closedRotation[1],
            door.openRotation[1],
            pose.progress,
          ),
        ),
      );
      return;
    }
    if (door.type === "d000-door") {
      const bindRotation = door.bindRotations.get(door.activeRenderKey);
      setSourceOrderRotation(
        door.activeNode,
        rotationWithAxis(
          bindRotation,
          1,
          bindRotation[1]
            + door.openDirection
              * Math.abs(D000_DOOR_NODE_12_ENDPOINT)
              * pose.progress,
        ),
      );
      return;
    }
    for (const [index, node] of door.nodes.entries()) {
      const sourceDirection = door.directions[index];
      setSourceOrderRotation(
        node,
        rotationWithAxis(
          door.bindRotations[index],
          1,
          door.bindRotations[index][1]
            - sourceDirection * HINGED_DOOR_TURN * pose.progress,
        ),
      );
    }
  }

  toggle(door) {
    if (!door || door.state === "opening" || door.state === "closing") {
      return;
    }
    const opening = door.state === "closed";
    if (opening) door.openedByPlayer = true;
    if (door.type === "d000-door" && door.state === "closed") {
      const inverseRoot = door.root.getWorldMatrix().clone().invert();
      const playerLocal = BABYLON.Vector3.TransformCoordinates(
        this.getActorPosition(),
        inverseRoot,
      );
      const route = selectD000DoorRoute(
        playerLocal.z,
        door.routedNodes.keys(),
      );
      door.activeRenderKey = route.renderNodeKey;
      door.activeNode = door.routedNodes.get(route.renderNodeKey);
      door.openDirection = route.browserTurnDirection;
    }
    if (door.type === "exterior-swing-door" && door.state === "closed") {
      const inverseRoot = door.root.getWorldMatrix().clone().invert();
      const playerLocal = BABYLON.Vector3.TransformCoordinates(
        this.getActorPosition(),
        inverseRoot,
      );
      door.openSide = playerLocal.z <= 0 ? 1 : -1;
    }
    door.state = door.state === "open" ? "closing" : "opening";
    door.elapsed = 0;
    this.syncCollisionStates();
    if (door.model) {
      const position = door.root.getAbsolutePosition();
      this.onAudioCue({
        type: "nativeJomoDoorPhase",
        model: door.model,
        phase: opening ? "openingStart" : "closingStart",
        position: { x: position.x, y: position.y, z: position.z },
      });
    }
    if (opening && door.type === "d000-door") {
      const position = door.root.getAbsolutePosition();
      this.onAudioCue({
        type: "nativeD000DoorOpening",
        doorSelector: door.doorSelector,
        position: { x: position.x, y: position.y, z: position.z },
      });
    }
  }

  update(deltaSeconds) {
    for (const door of this.entries) {
      if (door.state !== "opening" && door.state !== "closing") continue;
      door.elapsed += deltaSeconds;
      const closing = door.state === "closing";
      const pose = (
        door.type === "sliding"
        || door.type === "paired-sliding-panel"
      )
        ? evaluateSlidingDoor(door.elapsed, closing)
        : door.type === "shenmue2-paired-sliding"
          ? evaluateShenmue2PairedSlidingDoor(door.elapsed, closing)
          : door.type === "d000-door"
            ? evaluateD000DoorNode12(door.elapsed, closing)
            : evaluateHingedDoor(door.elapsed, closing);
      this.setPose(door, pose);
      if (pose.done) {
        door.state = closing ? "closed" : "open";
        if (door.state === "closed") door.openedByPlayer = false;
        door.elapsed = 0;
      }
    }
    // Reapply after world collision meshes are instantiated during loading.
    this.syncCollisionStates();
  }
}
