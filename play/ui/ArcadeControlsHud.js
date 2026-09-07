export class ArcadeControlsHud {
  constructor({ dom, syncMobileControls }) {
    this.dom = dom;
    this.syncMobileControls = syncMobileControls;
  }

  show(game) {
    const active = Boolean(game);
    document.body.classList.toggle("arcade-active", active);
    this.syncMobileControls(active && game?.mode === "emulator");
    this.dom.worldControlsHud.hidden = active;
    this.dom.arcadeControlsHud.hidden = !active;
    this.dom.arcadeControlsHud.replaceChildren();
    if (!game) return;
    for (const control of game.controls || []) {
      const row = document.createElement("div");
      row.className = "hud-row";
      for (const key of control.keys || []) {
        const badge = document.createElement("kbd");
        badge.textContent = key;
        row.append(badge);
      }
      const label = document.createElement("span");
      label.className = "hud-label";
      label.textContent = control.label;
      row.append(label);
      this.dom.arcadeControlsHud.append(row);
    }
  }
}
