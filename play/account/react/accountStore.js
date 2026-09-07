import { create } from "zustand";

export const useAccountStore = create(() => ({
  controller: null,
  screen: "entry",
  connectionStatus: {
    state: "checking",
    text: "Checking Server...",
  },
  error: "",
  characters: [],
  selectedCharacter: null,
  deleteTarget: null,
  credentialMode: "login",
}));

export function resetAccountStore() {
  useAccountStore.setState({
    screen: "entry",
    error: "",
    characters: [],
    selectedCharacter: null,
    deleteTarget: null,
    credentialMode: "login",
  });
}
