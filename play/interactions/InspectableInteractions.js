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
    resolvePose = () => null,
    approach = null,
    setMovementLocked = () => {},
    purchase = null,
    inspection = null,
  }) {
    this.dom = dom;
    this.signedRenderKey = signedRenderKey;
    this.runtimeEmotes = runtimeEmotes;
    this.fallbackEmotes = fallbackEmotes;
    this.playEmote = playEmote;
    this.setMetadata = setMetadata;
    this.showNotice = showNotice;
    this.clearNotice = clearNotice;
    this.resolvePose = resolvePose;
    this.approach = approach;
    this.setMovementLocked = setMovementLocked;
    this.purchase = purchase;
    this.inspection = inspection;
    this.active = null;
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
    this.inspection?.update(deltaSeconds);
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

  get busy() {
    return this.active !== null;
  }

  async inspect(inspectable) {
    if (!inspectable || this.busy) return false;
    this.showHint(
      inspectable.label === "Examine" && inspectable.objectTag
        ? `Examine · ${inspectable.objectTag}`
        : inspectable.label,
    );
    const emote = this.runtimeEmotes.find(
      (candidate) => candidate.id === inspectable.interactionEmoteId,
    ) || this.fallbackEmotes.find((candidate) => candidate.id === "thinking");
    if (!emote) return false;
    let interaction = null;
    try {
      const pose = this.resolvePose(inspectable);
      if (!pose) return this.playEmote(emote, null, { inspectable });
      if (emote.id !== inspectable.interactionEmoteId) {
        throw new Error("This interaction's animation is unavailable.");
      }
      interaction = { emote, abort: new AbortController(), phase: "approaching" };
      this.active = interaction;
      this.setMovementLocked(true);
      this.inspection?.begin(interaction.abort.signal, inspectable);
      await this.approach(pose, interaction.abort.signal);
      // A world change can dispose this interaction while its approach is
      // awaiting cancellation. It must not start a clip or unlock a new owner.
      if (this.active !== interaction) return false;
      if (this.purchase) {
        interaction.phase = 'purchasing';
        interaction.purchase = await this.purchase(inspectable);
        if (this.active !== interaction) return false;
        if (interaction.purchase) this.inspection?.prepare(interaction.purchase);
      }
      interaction.phase = "animating";
      if (!this.playEmote(emote, null, { inspectable })) {
        throw new Error("This interaction's animation is unavailable.");
      }
      return true;
    } catch (error) {
      if (interaction && this.active !== interaction) return false;
      if (interaction) this.release();
      this.showHint(error.message || "Could not start this interaction.");
      return false;
    }
  }

  finishAnimation(emote) {
    if (this.active?.phase === "animating" && this.active.emote.id === emote?.id) {
      const purchase = this.active.purchase;
      if (purchase && this.inspection) {
        const interaction = this.active;
        interaction.phase = 'inspecting';
        void this.inspection.show(purchase).catch(error => {
          if (this.active === interaction && !interaction.abort.signal.aborted) {
            this.showHint(`Collected: ${purchase.itemName}. Could not show the toy: ${error.message}`);
          }
        }).finally(() => {
          if (this.active === interaction) this.release();
        });
        return;
      }
      this.release();
      if (purchase?.itemName) this.showHint(`Collected: ${purchase.itemName} — see Collection`);
    }
  }

  release() {
    const interaction = this.active;
    if (!interaction) return;
    this.active = null;
    interaction.abort.abort();
    this.inspection?.close();
    this.setMovementLocked(false);
  }

  clear() {
    this.release();
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
