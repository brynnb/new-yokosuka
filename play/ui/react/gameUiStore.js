import { create } from "zustand";

export const useGameUiStore = create(() => ({
  playerName: "Player",
  level: 1,
  location: "Hazuki Residence Grounds",
  gameTime: "8:30 am · Jun. 9",
  hp: "HP 100 / 100",
  yen: "$0",
}));

export function updateGameUi(values) {
  useGameUiStore.setState(values);
}
