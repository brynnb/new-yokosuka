import nipplejs from "nipplejs";
import { nippleMovementData } from "../../src/NippleInput.js";

const SIDEBAR_STORAGE_KEY = "new-yokosuka-sidebar-collapsed";

export class MobileControls {
  constructor({
    dom,
    engine,
    mediaQuery,
    getController,
    getArcadeGames,
    exitForklift,
    exitCinemaSeat,
  }) {
    this.dom = dom;
    this.engine = engine;
    this.mediaQuery = mediaQuery;
    this.getController = getController;
    this.getArcadeGames = getArcadeGames;
    this.exitForklift = exitForklift;
    this.exitCinemaSeat = exitCinemaSeat;
    this.joystick = null;
    this.arcadeJoystick = null;
    this.arcadeDirectionCodes = new Set();
    this.forkLiftInput = 0;
    this.cinemaSeated = false;
    this.stuckDirectActivation = null;
    this.handleMediaChange = this.handleMediaChange.bind(this);
  }

  readSidebarCollapsed() {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  setSidebarCollapsed(collapsed, { persist = true } = {}) {
    const next = Boolean(collapsed);
    this.dom.app.classList.toggle("sidebar-collapsed", next);
    this.dom.sidebarToggle.setAttribute("aria-expanded", String(!next));
    this.dom.sidebarToggle.setAttribute(
      "aria-label",
      next ? "Expand sidebar" : "Collapse sidebar",
    );
    this.dom.sidebarToggle.title = next
      ? "Expand sidebar"
      : "Collapse sidebar";
    if (persist) {
      try {
        window.localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          next ? "1" : "0",
        );
      } catch {
        // Storage can be disabled without preventing sidebar use.
      }
    }
    this.engine.resize(true);
  }

  setChatOpen(open) {
    const next = this.mediaQuery.matches && Boolean(open);
    this.dom.chatPanel.classList.toggle("mobile-open", next);
    this.dom.mobileChatToggle.setAttribute("aria-expanded", String(next));
    if (!next && document.activeElement === this.dom.chatInput) {
      this.dom.chatInput.blur();
    }
  }

  destroyJoystick() {
    this.getController()?.clearTouchMovement();
    this.joystick?.destroy();
    this.joystick = null;
  }

  syncJoystick() {
    const controller = this.getController();
    if (!this.mediaQuery.matches || !controller || this.cinemaSeated) {
      this.destroyJoystick();
      return;
    }
    if (this.joystick) return;
    this.joystick = nipplejs.create({
      zone: this.dom.mobileJoystickZone,
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 112,
      threshold: 0.1,
      color: "#f2f4f5",
      restOpacity: 0.42,
    });
    this.joystick.on("move", (event, legacyData) => {
      const data = nippleMovementData(event, legacyData);
      this.getController()?.setTouchMovement(
        data?.vector?.x || 0,
        data?.vector?.y || 0,
      );
    });
    this.joystick.on(
      "end",
      () => this.getController()?.clearTouchMovement(),
    );
  }

  setCinemaSeated(active) {
    const next = Boolean(active);
    this.cinemaSeated = next;
    this.dom.app.classList.toggle("cinema-seated", next);
    if (next) this.destroyJoystick();
    else this.syncJoystick();
  }

  collapseSidebar() {
    if (this.mediaQuery.matches) {
      this.setSidebarCollapsed(true, { persist: false });
    }
  }

  toggleStuckMode() {
    const controller = this.getController();
    controller?.setNoClip(!controller.noClip);
  }

  bindForkliftButton(button, direction) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture?.(event.pointerId);
      this.forkLiftInput = direction;
    });
    const release = (event) => {
      if (this.forkLiftInput === direction) this.forkLiftInput = 0;
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  }

  setArcadeDirections(nextCodes) {
    const arcadeGames = this.getArcadeGames();
    for (const code of this.arcadeDirectionCodes) {
      if (!nextCodes.has(code)) arcadeGames?.sendEmulatorInput(code, false);
    }
    for (const code of nextCodes) {
      if (!this.arcadeDirectionCodes.has(code)) {
        arcadeGames?.sendEmulatorInput(code, true);
      }
    }
    this.arcadeDirectionCodes.clear();
    for (const code of nextCodes) this.arcadeDirectionCodes.add(code);
  }

  destroyArcadeJoystick() {
    this.setArcadeDirections(new Set());
    this.arcadeJoystick?.destroy();
    this.arcadeJoystick = null;
  }

  syncArcadeJoystick(active) {
    if (!active || !this.mediaQuery.matches) {
      this.destroyArcadeJoystick();
      return;
    }
    if (this.arcadeJoystick) return;
    this.arcadeJoystick = nipplejs.create({
      zone: this.dom.mobileArcadeStick,
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 112,
      threshold: 0.1,
      color: "#f2f4f5",
      restOpacity: 0.42,
    });
    this.arcadeJoystick.on("move", (event, legacyData) => {
      const vector = nippleMovementData(event, legacyData)?.vector || {};
      const nextCodes = new Set();
      if ((vector.y || 0) > 0.28) nextCodes.add("KeyW");
      if ((vector.y || 0) < -0.28) nextCodes.add("KeyS");
      if ((vector.x || 0) > 0.28) nextCodes.add("KeyD");
      if ((vector.x || 0) < -0.28) nextCodes.add("KeyA");
      this.setArcadeDirections(nextCodes);
    });
    this.arcadeJoystick.on(
      "end",
      () => this.setArcadeDirections(new Set()),
    );
  }

  arcadeInputCode(control) {
    const arcadeGames = this.getArcadeGames();
    if (control === "coin") return "KeyV";
    if (control === "start") return "Enter";
    if (control === "primary") {
      return arcadeGames?.game?.id === "hangon" ? "KeyW" : "Space";
    }
    if (control === "secondary") {
      return arcadeGames?.game?.id === "hangon" ? "KeyS" : "KeyC";
    }
    return null;
  }

  bindArcadeButton(button) {
    const release = (event) => {
      const code = button.dataset.activeArcadeCode;
      if (code) this.getArcadeGames()?.sendEmulatorInput(code, false);
      delete button.dataset.activeArcadeCode;
      button.classList.remove("active");
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };
    button.addEventListener("pointerdown", (event) => {
      if (button.dataset.arcadeControl === "exit") {
        event.preventDefault();
        event.stopPropagation();
        this.getArcadeGames()?.close();
        return;
      }
      const code = this.arcadeInputCode(button.dataset.arcadeControl);
      if (!code || !this.getArcadeGames()?.sendEmulatorInput(code, true)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture?.(event.pointerId);
      button.dataset.activeArcadeCode = code;
      button.classList.add("active");
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  handleMediaChange(event) {
    this.dom.lookControlKey.textContent = event.matches
      ? "Touch"
      : "Right Click";
    this.setChatOpen(false);
    this.setSidebarCollapsed(
      event.matches ? true : this.readSidebarCollapsed(),
      { persist: false },
    );
    this.syncJoystick();
    this.syncArcadeJoystick(Boolean(this.getArcadeGames()?.active));
  }

  initialize() {
    this.setSidebarCollapsed(
      this.mediaQuery.matches ? true : this.readSidebarCollapsed(),
      { persist: false },
    );
    document.documentElement.classList.remove("mobile-sidebar-pending");
    this.dom.lookControlKey.textContent = this.mediaQuery.matches
      ? "Touch"
      : "Right Click";
    this.setChatOpen(false);
    this.dom.sidebarToggle.addEventListener("click", () => {
      const collapse = !this.dom.app.classList.contains("sidebar-collapsed");
      if (this.mediaQuery.matches && !collapse) this.setChatOpen(false);
      this.setSidebarCollapsed(collapse, {
        persist: !this.mediaQuery.matches,
      });
    });
    this.dom.mobileChatToggle.addEventListener(
      "click",
      () => this.setChatOpen(
        !this.dom.chatPanel.classList.contains("mobile-open"),
      ),
    );
    this.dom.mobileStuckButton.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      this.stuckDirectActivation = {
        pointerId: event.pointerId,
        timeStamp: event.timeStamp,
      };
      event.preventDefault();
      event.stopPropagation();
      this.toggleStuckMode();
    });
    this.dom.mobileStuckButton.addEventListener("click", (event) => {
      const direct = this.stuckDirectActivation;
      this.stuckDirectActivation = null;
      const elapsed = direct
        ? event.timeStamp - direct.timeStamp
        : Number.POSITIVE_INFINITY;
      const matchingPointer = (
        !Number.isFinite(event.pointerId)
        || !Number.isFinite(direct?.pointerId)
        || event.pointerId === direct.pointerId
      );
      if (
        direct
        && event.pointerType !== "mouse"
        && event.detail !== 0
        && matchingPointer
        && elapsed >= 0
        && elapsed < 1500
      ) return;
      this.toggleStuckMode();
    });
    this.bindForkliftButton(this.dom.mobileForkDown, -1);
    this.bindForkliftButton(this.dom.mobileForkUp, 1);
    this.dom.mobileForkliftExit.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.exitForklift();
    });
    this.dom.mobileCinemaStand.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.exitCinemaSeat?.();
    });
    for (const button of this.dom.mobileArcadeButtons) {
      this.bindArcadeButton(button);
    }
    if (typeof this.mediaQuery.addEventListener === "function") {
      this.mediaQuery.addEventListener("change", this.handleMediaChange);
    } else {
      this.mediaQuery.addListener(this.handleMediaChange);
    }
  }

  dispose() {
    this.destroyJoystick();
    this.destroyArcadeJoystick();
    if (typeof this.mediaQuery.removeEventListener === "function") {
      this.mediaQuery.removeEventListener("change", this.handleMediaChange);
    } else {
      this.mediaQuery.removeListener(this.handleMediaChange);
    }
  }
}
