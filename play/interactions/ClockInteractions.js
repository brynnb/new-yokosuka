import {
  mt5BrowserRotation,
  rotationWithAxis,
  setSourceOrderRotation,
} from "../../src/Mt5InteractionRotation.js";
import { evaluateClockAlarm } from "../../src/RuntimeObjectAnimation.js";

export class ClockInteractions {
  constructor({ signedRenderKey }) {
    this.signedRenderKey = signedRenderKey;
    this.entries = [];
  }

  register(root, placement) {
    const bodyNode = (root._mt5Nodes || []).find(
      (node) => this.signedRenderKey(node) === 0x98,
    )?.mesh;
    const strikerNode = (root._mt5Nodes || []).find(
      (node) => this.signedRenderKey(node) === 0x99,
    )?.mesh;
    const clock = {
      root,
      bodyNode,
      strikerNode,
      bodyBindPosition: bodyNode?.position.clone() || null,
      strikerBindRotation: strikerNode
        ? mt5BrowserRotation(strikerNode)
        : null,
      state: "idle",
      elapsed: 0,
      taskAddress: placement.runtime?.taskAddress || null,
    };
    for (const node of [root, ...root.getDescendants(false)]) {
      node.metadata = { ...(node.metadata || {}), interactiveClock: clock };
    }
    this.entries.push(clock);
    return clock;
  }

  setPose(clock, pose) {
    if (clock.bodyNode && clock.bodyBindPosition) {
      clock.bodyNode.position.copyFrom(clock.bodyBindPosition);
      clock.bodyNode.position.z += pose.bodyOffset;
    }
    if (clock.strikerNode) {
      setSourceOrderRotation(
        clock.strikerNode,
        rotationWithAxis(
          clock.strikerBindRotation,
          1,
          clock.strikerBindRotation[1] - pose.strikerRotationY,
        ),
      );
    }
  }

  ring(clock) {
    if (!clock) return;
    clock.state = "ringing";
    clock.elapsed = 0;
    this.setPose(clock, evaluateClockAlarm(0));
  }

  update(deltaSeconds) {
    for (const clock of this.entries) {
      if (clock.state !== "ringing") continue;
      clock.elapsed += deltaSeconds;
      const pose = evaluateClockAlarm(clock.elapsed);
      this.setPose(clock, pose);
      if (pose.done) {
        clock.state = "idle";
        clock.elapsed = 0;
      }
    }
  }

  clear() {
    this.entries.length = 0;
  }
}
