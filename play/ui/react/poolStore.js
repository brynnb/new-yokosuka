import { create } from "zustand";

const callbacks = {
  onChoose: () => false,
  onCancel: () => {},
  onPowerChange: () => {},
  onSpinChange: () => {},
  onShoot: () => false,
  onPrimaryAction: () => false,
  onConfirmPlacement: () => false,
  onRestart: () => false,
  onLeave: () => false,
};

export const usePoolStore = create(() => ({
  chooserOpen: false,
  active: false,
  mode: "challenge",
  power: 0.5,
  sideSpin: 0,
  topSpin: 0,
  canShoot: false,
  viewMode: "standing",
  placing: false,
  placementValid: true,
  foul: "",
  winner: "",
  currentPlayerName: "",
  targetBallNumber: null,
  players: [],
}));

export function configurePoolUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function openPoolChooser() {
  const state = usePoolStore.getState();
  if (state.active || state.chooserOpen) return false;
  usePoolStore.setState({ chooserOpen: true });
  return true;
}

export function closePoolChooser() {
  if (!usePoolStore.getState().chooserOpen) return;
  usePoolStore.setState({ chooserOpen: false });
  callbacks.onCancel();
}

export function choosePoolMode(mode) {
  if (!["practice", "rookie", "steady", "ace"].includes(mode)) {
    return false;
  }
  if (!callbacks.onChoose(mode)) return false;
  usePoolStore.setState({
    chooserOpen: false,
    active: true,
    mode: mode === "practice" ? "practice" : "challenge",
  });
  return true;
}

export function syncPoolUi(nextState) {
  usePoolStore.setState(nextState);
}

export const poolUiActions = Object.freeze({
  setPower(value) {
    callbacks.onPowerChange(value);
  },
  setSpin(value) {
    callbacks.onSpinChange(value);
  },
  setTopSpin(value) {
    callbacks.onTopSpinChange?.(value);
  },
  shoot() {
    callbacks.onShoot();
  },
  primaryAction() {
    callbacks.onPrimaryAction();
  },
  confirmPlacement() {
    callbacks.onConfirmPlacement();
  },
  restart() {
    callbacks.onRestart();
  },
  leave() {
    callbacks.onLeave();
  },
});
