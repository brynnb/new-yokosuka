import { createRoot } from "react-dom/client";
import radixThemeUrl from "@radix-ui/themes/styles.css?url";

import { AudioCatalogApp } from "./AudioCatalogApp.jsx";
import { AudioPlayerApp } from "./AudioPlayerApp.jsx";
import "./catalog.css";
import playerStyles from "./player.css?inline";

const catalogRoot = document.getElementById("audio-catalog-root");
if (catalogRoot) createRoot(catalogRoot).render(<AudioCatalogApp />);

const playerHost = document.getElementById("audio-player-root");
if (playerHost) {
  const shadowRoot = playerHost.shadowRoot || playerHost.attachShadow({ mode: "open" });
  const radixTheme = document.createElement("link");
  radixTheme.rel = "stylesheet";
  radixTheme.href = radixThemeUrl;
  const style = document.createElement("style");
  style.textContent = playerStyles;
  const mount = document.createElement("div");
  mount.className = "audio-player-mount";
  shadowRoot.replaceChildren(radixTheme, style, mount);
  createRoot(mount).render(<AudioPlayerApp />);
}
