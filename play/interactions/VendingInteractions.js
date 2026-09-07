import { Vector3 } from "@babylonjs/core";
import {
  VENDING_MANIFEST,
  VENDING_PRODUCTS,
  vendingDisplayProduct,
  vendingMachineForPlacement,
} from "../../src/VendingCatalog.js";

// Shared staging for the JIHS5 family and M_DJUC motions. The cabinet's front
// is local +Z, about 0.30 m from its origin; the reaching hand extends about
// 0.50 m forward. This is model/motion-derived browser staging, not a recovered
// native VEND controller constant. Keep it local so every placed yaw works.
const INTERACTION_ORIGIN = new Vector3(0, 0, 0.8);
export function vendingInteractionPose(root) {
  const world = root.computeWorldMatrix(true);
  const position = Vector3.TransformCoordinates(INTERACTION_ORIGIN, world);
  const facing = Vector3.TransformNormal(new Vector3(0, 0, -1), world);
  return { position, yaw: Math.atan2(facing.x, facing.z) };
}

export function vendingBinForMachine(machine, root, placedRoots) {
  // The GT cabinet includes the bin in its mesh. The KR cabinet uses the
  // separately placed GMK02LCG object (VM_0 -> VMG0 in native JD00 data).
  // Both meshes have the same 0.7256 m rim; only its local X origin differs.
  if (machine.model.endsWith("JIHS5GTG.MT5")) {
    return {root, opening: new Vector3(-0.6966, 0.7256, 0)};
  }
  const binTag = machine.objectTag?.replace(/^VM_(\d+)$/, "VMG$1");
  const bin = placedRoots.find(candidate => {
    const placement = candidate._runtimePlacementRecord;
    return placement?.runtime?.objectTag === binTag && placement.model.endsWith("GMK02LCG.MT5");
  });
  if (!bin) throw new Error(`Missing authored vending bin ${binTag} for ${machine.id}.`);
  return {root: bin, opening: new Vector3(0, 0.7256, 0)};
}

export class VendingInteractions {
  constructor({
    dom,
    setMetadata,
    setMovementLocked,
    showHint,
    purchase,
    approach,
    playEmote,
    runtimeEmotes,
    drinkProp,
    documentRef = document,
  }) {
    this.dom = dom;
    this.setMetadata = setMetadata;
    this.setMovementLocked = setMovementLocked;
    this.showHint = showHint;
    this.purchase = purchase;
    this.approach = approach;
    this.playEmote = playEmote;
    this.runtimeEmotes = runtimeEmotes;
    this.drinkProp = drinkProp;
    this.document = documentRef;
    this.entries = [];
    this.active = null;
    this.pending = false;
    this.animating = false;
    this.generation = 0;
    this.initializePanel();
  }

  initializePanel() {
    this.dom.vendingPrice.textContent = `¥${VENDING_MANIFEST.unitPrice}`;
    this.dom.vendingOptions.replaceChildren();
    for (const product of VENDING_PRODUCTS) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "vending-option";
      button.dataset.vendingProduct = product.key;
      const temperature = product.temperature === "hot" ? "Hot" : "Cold";
      button.innerHTML = `
        <span class="vending-option-name"></span>
        <span class="vending-option-meta">${temperature} · ¥${
          VENDING_MANIFEST.unitPrice
        }</span>`;
      button.querySelector(".vending-option-name").textContent = product.name;
      button.onclick = () => void this.buy(product);
      this.dom.vendingOptions.append(button);
    }
    this.dom.vendingClose.onclick = () => this.close();
    this.dom.vendingOverlay.addEventListener("click", (event) => {
      if (event.target === this.dom.vendingOverlay) this.close();
    });
    this.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.dom.vendingOverlay.hidden) {
        event.preventDefault();
        this.close();
      }
    });
  }

  register(root, placement, worldId) {
    const machine = vendingMachineForPlacement(worldId, placement);
    if (!machine) {
      throw new Error(
        `No vending manifest entry for ${worldId} ${placement.model}.`,
      );
    }
    const entry = { root, placement, machine };
    this.setMetadata(root, "interactiveVendingMachine", entry);
    this.entries.push(entry);
    return entry;
  }

  open(entry) {
    if (!entry || this.pending || this.animating) return false;
    this.active = entry;
    this.dom.vendingStatus.textContent = "Choose a drink.";
    this.setButtonsDisabled(false);
    this.dom.vendingOverlay.hidden = false;
    this.dom.vendingOverlay.setAttribute("aria-hidden", "false");
    this.setMovementLocked(true);
    this.dom.vendingOptions.querySelector("button")?.focus();
    return true;
  }

  bindBins(placedRoots) {
    for (const entry of this.entries) {
      entry.bin = vendingBinForMachine(entry.machine, entry.root, placedRoots);
    }
  }

  close({ unlock = true } = {}) {
    if (this.pending) return false;
    this.dom.vendingOverlay.hidden = true;
    this.dom.vendingOverlay.setAttribute("aria-hidden", "true");
    this.active = null;
    if (unlock && !this.animating) this.setMovementLocked(false);
    return true;
  }

  setButtonsDisabled(disabled) {
    for (const button of this.dom.vendingOptions.querySelectorAll("button")) {
      button.disabled = disabled;
    }
    this.dom.vendingClose.disabled = disabled;
  }

  async buy(product) {
    const entry = this.active;
    if (!entry || this.pending) return;
    const generation = this.generation;
    const abort = new AbortController();
    this.pendingAbort = abort;
    this.pending = true;
    this.setButtonsDisabled(true);
    this.dom.vendingStatus.textContent = `Buying ${product.name}…`;
    this.dom.vendingOverlay.hidden = true;
    this.dom.vendingOverlay.setAttribute("aria-hidden", "true");
    try {
      // Walk before sending the transaction: obstructed/cancelled approaches
      // must never charge the player or retry a successful purchase.
      await this.approach(entry, abort.signal);
      if (generation !== this.generation || entry !== this.active) return;
      const result = await this.purchase(entry.machine.id, product.key);
      if (generation !== this.generation || entry !== this.active) return;
      const displayed = vendingDisplayProduct(result);
      await this.drinkProp.prepare(displayed.resourceCode, {
        signal: abort.signal, bin: entry.bin,
      });
      if (generation !== this.generation || entry !== this.active) return;
      this.pending = false;
      this.animating = true;
      this.close({ unlock: false });
      this.showHint(result.message || displayed.name);
      const emoteId = (
        !result.winningCan && product.temperature === "hot"
          ? "vendingCoffee"
          : "vendingDrink"
      );
      const emote = this.runtimeEmotes.find(
        (candidate) => candidate.id === emoteId,
      );
      if (!emote || !this.playEmote(emote, null, {
        vendingMachine: entry,
        product,
        result,
      })) {
        this.finishAnimation();
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.pending = false;
      this.animating = false;
      this.drinkProp.hide();
      this.setButtonsDisabled(false);
      this.close();
      this.showHint(error.message || "The vending purchase failed.");
      if (error.outcome === "insufficient_funds") {
        const emote = this.runtimeEmotes.find(
          (candidate) => candidate.id === "dobuitaNoMoney",
        );
        if (emote) this.playEmote(emote, null, { vendingMachine: entry });
      }
    } finally {
      if (this.pendingAbort === abort) this.pendingAbort = null;
    }
  }

  updateProp(frame, nextFrame, amount, animationState) {
    this.drinkProp.update(
      frame,
      nextFrame,
      amount,
      animationState,
    );
  }

  finishAnimation() {
    if (!this.animating) return;
    this.animating = false;
    this.drinkProp.hide();
    this.setMovementLocked(false);
  }

  clear() {
    const ownedMovement = Boolean(this.active || this.pending || this.animating);
    this.generation += 1;
    this.pendingAbort?.abort();
    this.pendingAbort = null;
    this.pending = false;
    this.animating = false;
    this.active = null;
    this.entries.length = 0;
    this.setButtonsDisabled(false);
    this.dom.vendingOverlay.hidden = true;
    this.dom.vendingOverlay.setAttribute("aria-hidden", "true");
    this.drinkProp.clear();
    if (ownedMovement) this.setMovementLocked(false);
  }
}
