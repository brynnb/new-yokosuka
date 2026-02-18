import state from "./state.js";

const statusEl = document.getElementById("status");
const statusBar = document.getElementById("status-bar");
const canvasContainer = document.getElementById("canvas-container");
const selectModelPrompt = document.getElementById("select-model-prompt");
const modelList = document.getElementById("model-list");

export function setStatus(text, isLoading = false) {
  statusEl.innerText = text;
  if (isLoading) {
    statusBar.classList.add("loading");
    if (canvasContainer) canvasContainer.classList.add("loading-active");
    if (selectModelPrompt) selectModelPrompt.classList.add("hidden");
  } else {
    statusBar.classList.remove("loading");
    if (canvasContainer) canvasContainer.classList.remove("loading-active");
  }
}

export function getModelList() {
  return modelList;
}

// Navigation Logic
function expandParents(element) {
  let parent = element.parentElement;
  while (parent && parent !== modelList) {
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
  const items = Array.from(document.querySelectorAll(".model-item"));
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
    expandParents(target);
    target.click();
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

export function initUIHandlers() {
  document.getElementById("prev-btn").onclick = (e) => {
    e.preventDefault();
    navigateModel(-1);
  };
  document.getElementById("next-btn").onclick = (e) => {
    e.preventDefault();
    navigateModel(1);
  };

  // Handle Welcome Modal
  const welcomeModal = document.getElementById("welcome-modal");
  const closeModalBtn = document.getElementById("close-modal");
  const mobileWarningModal = document.getElementById("mobile-warning-modal");
  const closeMobileWarningBtn = document.getElementById("close-mobile-warning");

  function isMobileOrSmallScreen() {
    return (
      window.innerWidth < 1000 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      )
    );
  }

  if (closeModalBtn && welcomeModal) {
    closeModalBtn.onclick = () => {
      welcomeModal.classList.add("hidden");

      // Show mobile warning if on small screen or mobile device
      if (isMobileOrSmallScreen() && mobileWarningModal) {
        mobileWarningModal.classList.remove("hidden");
      }
    };
  }

  if (closeMobileWarningBtn && mobileWarningModal) {
    closeMobileWarningBtn.onclick = () => {
      mobileWarningModal.classList.add("hidden");
    };
  }

  window.addEventListener("keydown", (e) => {
    // If we are in FPS mode (pointer locked), do not navigate the list
    if (document.pointerLockElement === state.canvas) {
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      navigateModel(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      navigateModel(1);
    }
  });
}
