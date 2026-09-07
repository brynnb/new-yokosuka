import {
  mt5BrowserRotation,
  rotationWithAxis,
  setSourceOrderRotation,
} from "../../src/Mt5InteractionRotation.js";
import { evaluateD000TkoSpin } from "../../src/RuntimeObjectAnimation.js";

export class InspectableInteractions {
  constructor({
    dom,
    signedRenderKey,
    runtimeEmotes,
    fallbackEmotes,
    playEmote,
    setMetadata,
    showNotice = null,
    clearNotice = null,
  }) {
    this.dom = dom;
    this.signedRenderKey = signedRenderKey;
    this.runtimeEmotes = runtimeEmotes;
    this.fallbackEmotes = fallbackEmotes;
    this.playEmote = playEmote;
    this.setMetadata = setMetadata;
    this.showNotice = showNotice;
    this.clearNotice = clearNotice;
    this.entries = [];
    this.ambientAnimations = [];
    this.hintTimeout = null;
  }

  register(root, placement, label, interactionEmoteId = null) {
    const inspectable = {
      root,
      label,
      objectTag: placement.runtime?.objectTag || null,
      parentObjectTag: placement.runtime?.parentObjectTag || null,
      interactionEmoteId,
    };
    this.setMetadata(root, "interactiveInspectable", inspectable);
    this.entries.push(inspectable);
    return inspectable;
  }

  registerAmbient(root, behavior) {
    const animation = behavior.ambientAnimation;
    if (!animation || animation.autoPlay === false) return null;
    const node = (root._mt5Nodes || []).find(
      (candidate) => (
        this.signedRenderKey(candidate) === animation.renderNodeKey
      ),
    )?.mesh;
    if (!node) {
      throw new Error(
        `${root._filename} is missing ambient render node `
        + `${animation.renderNodeKey}.`,
      );
    }
    const runtimeAnimation = {
      kind: animation.kind,
      node,
      bindRotation: mt5BrowserRotation(node),
      elapsed: 0,
    };
    this.ambientAnimations.push(runtimeAnimation);
    return runtimeAnimation;
  }

  update(deltaSeconds) {
    for (const animation of this.ambientAnimations) {
      animation.elapsed += deltaSeconds;
      if (animation.kind === "d000-tko-node-spin") {
        setSourceOrderRotation(
          animation.node,
          rotationWithAxis(
            animation.bindRotation,
            1,
            animation.bindRotation[1]
              + evaluateD000TkoSpin(animation.elapsed),
          ),
        );
      }
    }
  }

  showHint(text) {
    if (this.showNotice) {
      this.showNotice(text, 1800);
      return;
    }
    this.dom.inspectHint.textContent = text;
    this.dom.inspectHint.hidden = false;
    if (this.hintTimeout !== null) window.clearTimeout(this.hintTimeout);
    this.hintTimeout = window.setTimeout(() => {
      this.dom.inspectHint.hidden = true;
      this.hintTimeout = null;
    }, 1800);
  }

  inspect(inspectable) {
    if (!inspectable) return;
    this.showHint(
      inspectable.label === "Examine" && inspectable.objectTag
        ? `Examine · ${inspectable.objectTag}`
        : inspectable.label,
    );
    const emote = this.runtimeEmotes.find(
      (candidate) => candidate.id === inspectable.interactionEmoteId,
    ) || this.fallbackEmotes.find((candidate) => candidate.id === "thinking");
    if (emote) this.playEmote(emote, null, { inspectable });
  }

  clear() {
    this.entries.length = 0;
    this.ambientAnimations.length = 0;
    if (this.hintTimeout !== null) {
      window.clearTimeout(this.hintTimeout);
      this.hintTimeout = null;
    }
    this.dom.inspectHint.hidden = true;
    this.clearNotice?.();
  }
}
