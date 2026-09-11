import { GamepadInput } from "../input/GamepadInput.js";
import { BabylonInputDevice } from "../input/BabylonInputDevice.js";
import { PlayInputRuntime } from "../input/PlayInputRuntime.js";
import { audioPreferences } from "../audio/AudioPreferences.js";
import { gamepadPreferences } from "../input/GamepadPreferences.js";
import { generalPreferences } from "../settings/GeneralPreferences.js";
import { graphicsPreferences } from "../../src/rendering/GraphicsPreferences.js";
import { accountSession } from "../account/AccountSession.js";
import { DisplayOptions } from "./DisplayOptions.js";
import { PlayUiCoordinator } from "./PlayUiCoordinator.js";
import { TransientNotice } from "./TransientNotice.js";
import { bindSidebarFocusReturn } from "./SidebarFocus.js";
import { queryPlayDom } from "./dom.js";
import { closeArcadeResults, configureArcadeResultsUi, useArcadeResultsStore } from "./react/arcadeResultsStore.js";
import {
  closePlayerDirectory,
  configurePlayerDirectoryUi,
  useChatUiStore,
} from "./react/chatStore.js";
import {
  closeInventory,
  configureInventoryUi,
  openInventory,
  useInventoryStore,
} from "./react/inventoryStore.js";
import {
  closeJournal,
  configureJournalUi,
  openJournal,
  useJournalStore,
} from "./react/journalStore.js";
import {
  closeSettings,
  configureSettingsUi,
  openSettings,
  useSettingsStore,
} from "./react/settingsStore.js";

export class PlayInterfaceAssembly {
  constructor({
    localDebug,
    getController,
    getMenuSounds,
    getWorldReady,
    getArcadeGames,
    getForkliftMode,
    getPoolRuntime,
    resetAudio,
    mobileUiQuery = window.matchMedia("(max-width: 850px)"),
  }) {
    this.getArcadeGames = getArcadeGames;
    this.mobileUiQuery = mobileUiQuery;
    this.dom = queryPlayDom();
    this.dom.noClipControlRow.hidden = !localDebug;
    this.dom.mobileStuckButton.hidden = !localDebug;
    this.transientNotice = new TransientNotice({
      element: this.dom.transientNotice,
    });
    this.displayOptions = new DisplayOptions(this.dom);
    this.displayOptions.initialize({ debugEnabled: localDebug });
    this.playUi = new PlayUiCoordinator({
      canvas: this.dom.canvas,
      controlHintHud: this.dom.worldControlsHud,
      getBinding: action => generalPreferences.binding(action),
      getMenuRoot: () => this.menuRoot(),
      getMenuSounds,
      getMovementLocked: () => Boolean(getController()?.movementLocked),
      setMovementLocked: locked => getController()?.setMovementLocked(locked),
    });
    this.playInput = new PlayInputRuntime({
      getBinding: action => generalPreferences.binding(action),
    });
    this.configureDebugCopyButtons();
    bindSidebarFocusReturn(this.dom.sidebar, () => this.focusGameSurface());
    bindSidebarFocusReturn(
      this.dom.combatMoveList,
      () => this.focusGameSurface(),
    );
    this.configureMenus({ getMenuSounds, resetAudio });
    this.gamepadInput = this.playInput.attachDevice(new GamepadInput({
      preferences: gamepadPreferences,
      actions: this.playInput.actions,
      onActiveInput: device => this.playUi.setActiveControlHintDevice(device),
      getController,
      isForkliftMounted: () => getForkliftMode()?.driving === true,
      isPoolActive: () => getPoolRuntime()?.active === true,
      isPaused: () => !getWorldReady() || Boolean(getArcadeGames()?.active),
      isMenuActive: () => this.playUi.menuIsActive(),
      onMenuDirection: direction => this.playUi.moveMenuFocus(direction),
      onMenuAccept: () => document.activeElement?.click?.(),
      onMenuBack: () => this.closeTopMenu(),
      onInteract: () => this.playUi.interactAtCanvasCenter(),
      onDialogueAdvance: () => (
        this.playUi.dispatchBoundAction("dialogueAdvance")
      ),
      onOpenNotebook: () => {
        closeInventory();
        openJournal();
      },
      onOpenInventory: () => {
        closeJournal();
        openInventory();
      },
      onOpenMenu: () => {
        closeJournal();
        closeInventory();
        if (useSettingsStore.getState().open) closeSettings();
        else openSettings(this.dom.settingsButton);
      },
      onExitForklift: () => getForkliftMode()?.exit(),
      onPoolDirection: (horizontal, vertical) => {
        getPoolRuntime()?.setGamepadDirection(horizontal, vertical);
      },
      onPoolAction: action => getPoolRuntime()?.handleGamepadAction(action),
    }));
    this.gamepadInput.start();
  }

  attachEngine(engine) {
    if (this.keyboardInput) return;
    this.keyboardInput = this.playInput.attachDevice(new BabylonInputDevice({
      engine,
      actions: this.playInput.actions,
      onActiveInput: device => this.playUi.setActiveControlHintDevice(device),
    }));
  }

  menuRoot() {
    if (useArcadeResultsStore.getState().open) {
      return document.getElementById("arcade-results-overlay");
    }
    if (useChatUiStore.getState().playerDirectoryOpen) {
      return document.getElementById("online-players-overlay");
    }
    if (useSettingsStore.getState().open) {
      return document.getElementById("settings-overlay");
    }
    if (useJournalStore.getState().open) {
      return document.getElementById("journal-overlay");
    }
    if (useInventoryStore.getState().open) {
      return document.getElementById("inventory-overlay");
    }
    if (document.body.classList.contains("account-menu-visible")) {
      return document.getElementById("account-ui-root");
    }
    return null;
  }

  configureDebugCopyButtons() {
    this.bindCopyButton(
      this.dom.copyWorldCoordinates,
      () => this.dom.worldCoordinates.textContent.trim(),
      "Copy coordinates",
    );
    this.bindCopyButton(
      this.dom.copyWorldFacing,
      () => this.dom.worldFacing.dataset.pose || "",
      "Copy facing and camera pose",
    );
  }

  bindCopyButton(button, value, resetTitle) {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value());
        button.title = "Copied!";
      } catch {
        button.title = "Copy failed";
      }
      window.setTimeout(() => { button.title = resetTitle; }, 1200);
    });
  }

  configureMenus({ getMenuSounds, resetAudio }) {
    configureArcadeResultsUi({
      onOpen: () => this.playUi.openModal("arcade-results"),
      onClose: () => {
        this.playUi.closeModal("arcade-results");
      },
      onAfterClose: () => {
        if (!this.playUi.menuIsActive()) this.focusGameSurface();
      },
    });
    configureSettingsUi({
      onOpen: () => this.playUi.openModal("settings"),
      onClose: () => {
        this.playUi.closeModal("settings");
        this.focusGameSurface();
      },
      onReset: tab => {
        if (tab === "general") {
          generalPreferences.resetGeneral();
          this.displayOptions.reset();
        } else if (tab === "controls") {
          generalPreferences.resetControls();
        } else if (tab === "gamepad") {
          gamepadPreferences.reset();
        } else if (tab === "graphics") {
          graphicsPreferences.reset();
        } else if (tab === "audio") {
          audioPreferences.reset();
          resetAudio();
        }
      },
      onCheckboxChange: () => getMenuSounds().changeValueQuiet(),
    });
    this.dom.settingsButton.addEventListener("click", event => {
      event.stopPropagation();
      openSettings(this.dom.settingsButton);
    });
    accountSession.setSettingsOpener(openSettings);
    this.onLogoutClick = async event => {
      event.stopPropagation();
      if (this.dom.logoutButton.disabled) return;
      this.dom.logoutButton.disabled = true;
      getMenuSounds().move();
      try {
        await accountSession.logout();
      } catch (error) {
        console.error("[Account] logout failed", error);
        this.dom.logoutButton.disabled = false;
      }
    };
    this.dom.logoutButton.addEventListener("click", this.onLogoutClick);
    configureJournalUi({
      onOpen: () => {
        this.playUi.openModal("journal");
        getMenuSounds().move();
      },
      onClose: () => {
        this.playUi.closeModal("journal");
        getMenuSounds().move();
        this.focusGameSurface();
      },
      onBlocked: () => getMenuSounds().blocked(),
      onPageBack: () => getMenuSounds().pageBack(),
      onPageForward: () => getMenuSounds().pageForward(),
    });
    this.dom.journalButton.addEventListener("click", event => {
      event.stopPropagation();
      closeInventory();
      openJournal();
    });
    this.dom.inventoryButton.addEventListener("click", event => {
      event.stopPropagation();
      closeJournal();
      openInventory();
    });
    configureInventoryUi({
      onOpen: () => {
        this.playUi.openModal("inventory");
        getMenuSounds().move();
      },
      onClose: () => {
        this.playUi.closeModal("inventory");
        getMenuSounds().move();
        this.focusGameSurface();
      },
    });
    configurePlayerDirectoryUi({
      onOpen: () => {
        this.playUi.openModal("player-directory");
        getMenuSounds().move();
      },
      onClose: () => {
        this.playUi.closeModal("player-directory");
        getMenuSounds().move();
        this.focusGameSurface();
      },
    });
  }

  closeTopMenu() {
    if (useArcadeResultsStore.getState().open) closeArcadeResults();
    else if (useChatUiStore.getState().playerDirectoryOpen) closePlayerDirectory();
    else if (useSettingsStore.getState().open) closeSettings();
    else if (useJournalStore.getState().open) closeJournal();
    else if (useInventoryStore.getState().open) closeInventory();
    else document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }));
  }

  focusGameSurface() {
    if (this.getArcadeGames()?.active || this.mobileUiQuery.matches) return false;
    const focused = document.activeElement;
    if (focused?.matches?.("input, textarea, select, [contenteditable='true']")) {
      return false;
    }
    try {
      this.dom.canvas.focus({ preventScroll: true });
      return document.activeElement === this.dom.canvas;
    } catch {
      return false;
    }
  }

  dispose() {
    closeArcadeResults();
    configureArcadeResultsUi({});
    this.dom.logoutButton.removeEventListener("click", this.onLogoutClick);
    this.playInput.dispose();
    this.playUi.dispose();
  }
}
