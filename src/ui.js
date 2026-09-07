import { installBrowserSearch } from "./AssetBrowser.js";

const statusEl = document.getElementById("status");
const statusBar = document.getElementById("status-bar");
const canvasContainer = document.getElementById("canvas-container");
const selectModelPrompt = document.getElementById("select-model-prompt");
const modelList = document.getElementById("model-list");
const sidebarToggle = document.getElementById("sidebar-toggle");
const mobileSidebarQuery = window.matchMedia("(max-width: 850px)");

export function setAssetViewerSidebarCollapsed(collapsed) {
  const next = mobileSidebarQuery.matches && Boolean(collapsed);
  document.body.classList.toggle("asset-sidebar-collapsed", next);
  if (sidebarToggle) {
    sidebarToggle.textContent = next ? "☰" : "‹";
    sidebarToggle.setAttribute("aria-expanded", String(!next));
    sidebarToggle.setAttribute(
      "aria-label",
      next ? "Open asset browser" : "Collapse asset browser",
    );
    sidebarToggle.title = next
      ? "Open asset browser"
      : "Collapse asset browser";
  }
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

export function collapseAssetViewerSidebarOnMobile() {
  if (mobileSidebarQuery.matches) {
    setAssetViewerSidebarCollapsed(true);
  }
}

export function setStatus(text, isLoading = false) {
  if (statusEl) statusEl.innerText = text;
  if (isLoading) {
    statusBar?.classList.add("loading");
    if (canvasContainer) canvasContainer.classList.add("loading-active");
    if (selectModelPrompt) selectModelPrompt.classList.add("hidden");
  } else {
    statusBar?.classList.remove("loading");
    if (canvasContainer) canvasContainer.classList.remove("loading-active");
  }
}

export function getModelList() {
  return modelList;
}

// Navigation Logic
export function expandAssetParents(element) {
  let parent = element.parentElement;
  while (parent && parent !== modelList) {
    if (parent.tagName === "DETAILS") parent.open = true;
    if (
      parent.classList.contains("category-content") ||
      parent.classList.contains("group-items")
    ) {
      if (parent.classList.contains("hidden")) {
        parent.classList.remove("hidden");
        const header = parent.previousElementSibling;
        if (header) header.classList.add("expanded");
      }
    }
    parent = parent.parentElement;
  }
}

export function navigateModel(dir) {
  const items = Array.from(document.querySelectorAll(".model-item:not([data-search-hidden])"));
  if (items.length === 0) return;

  let nextIndex = 0;
  const currentActive = document.querySelector(".model-item.active");

  if (currentActive) {
    const currentIndex = items.indexOf(currentActive);
    nextIndex = currentIndex + dir;
  } else {
    nextIndex = dir > 0 ? 0 : items.length - 1;
  }

  // Wrap around
  if (nextIndex < 0) nextIndex = items.length - 1;
  if (nextIndex >= items.length) nextIndex = 0;

  const target = items[nextIndex];
  if (target) {
    expandAssetParents(target);
    target.click();
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

export function initUIHandlers() {
  installBrowserSearch(modelList);
  setAssetViewerSidebarCollapsed(mobileSidebarQuery.matches);
  sidebarToggle?.addEventListener("click", () => {
    setAssetViewerSidebarCollapsed(
      !document.body.classList.contains("asset-sidebar-collapsed"),
    );
  });
  const handleMobileSidebarChange = (event) => {
    setAssetViewerSidebarCollapsed(event.matches);
  };
  if (typeof mobileSidebarQuery.addEventListener === "function") {
    mobileSidebarQuery.addEventListener("change", handleMobileSidebarChange);
  } else {
    mobileSidebarQuery.addListener(handleMobileSidebarChange);
  }

  document.getElementById("prev-btn").onclick = (e) => {
    e.preventDefault();
    navigateModel(-1);
  };
  document.getElementById("next-btn").onclick = (e) => {
    e.preventDefault();
    navigateModel(1);
  };

  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select, button, summary, [contenteditable=true]")) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      navigateModel(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      navigateModel(1);
    }
  });
}
