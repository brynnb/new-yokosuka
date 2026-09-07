import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../../../src/fonts.css";
import "@radix-ui/themes/styles.css";
import "../../styles/radix-theme.css";
import "../../audio/UserActivation.js";

import { queryPlayDom } from "../../ui/dom.js";
import {
  initializeSharedMusicControls,
} from "../../ui/SharedMusicControls.js";
import { UiRoot } from "./UiRoot.jsx";

const root = document.getElementById("react-ui-root");
async function initializeUi() {
  if (!root) return;
  const accountRoot = document.getElementById("account-ui-root");
  accountRoot?.replaceChildren();
  flushSync(() => {
    createRoot(root).render(<UiRoot />);
  });
  await initializeSharedMusicControls(queryPlayDom());
  accountRoot?.classList.remove("account-ui-booting");
}

void initializeUi();
