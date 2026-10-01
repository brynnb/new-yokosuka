// Native dialogs share Escape handling, focus trapping and focus restoration.
// Check the actual rectangle: backdrop clicks target the dialog, but so does
// clicking padding inside the credits panel, which must not dismiss it.
for (const dialog of document.querySelectorAll(".site-dialog")) {
  dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}

document.getElementById("credits-trigger").addEventListener("click", () => {
  document.getElementById("credits-modal").showModal();
});

const screenshotDialog = document.getElementById("screenshot-dialog");
const expandedImage = screenshotDialog.querySelector("img");
let screenshotOpener = null;
let openedWithPointer = false;
screenshotDialog.addEventListener("close", () => {
  // Escape changes the browser's focus-visible heuristic to keyboard mode.
  // Retain restored focus, but don't draw a ring for a pointer-opened image.
  if (openedWithPointer && document.activeElement === screenshotOpener) {
    screenshotOpener.setAttribute("data-pointer-return", "");
  }
});
for (const link of document.querySelectorAll(".screenshot-link")) {
  const restoreFocusIndicator = () => link.removeAttribute("data-pointer-return");
  link.addEventListener("keydown", restoreFocusIndicator);
  link.addEventListener("blur", restoreFocusIndicator);
  link.addEventListener("click", event => {
    // Keep normal open-in-new-tab/download gestures working on the image links.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    screenshotOpener = link;
    openedWithPointer = event.detail > 0;
    expandedImage.src = link.href;
    expandedImage.alt = link.querySelector("img").alt;
    screenshotDialog.showModal();
  });
}
