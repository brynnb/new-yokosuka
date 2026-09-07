const SIDEBAR_CONTROL_SELECTOR = "button,input,select,textarea,summary";

export function bindSidebarFocusReturn(sidebar, returnFocus) {
  let queued = false;
  let activeControl = null;
  const scheduleReturn = (event) => {
    const control = event.target?.closest?.(SIDEBAR_CONTROL_SELECTOR);
    if (!control || queued) return;
    // A select needs to retain focus while its native menu is open. Its
    // subsequent change event returns focus after the choice is committed.
    if (
      event.type === "click"
      && (
        control.matches?.("select")
        || control.matches?.('[role="combobox"]')
      )
    ) return;
    queued = true;
    activeControl = control;
    queueMicrotask(() => {
      queued = false;
      activeControl?.blur?.();
      activeControl = null;
      returnFocus();
    });
  };
  sidebar.addEventListener("click", scheduleReturn);
  sidebar.addEventListener("change", scheduleReturn);
}
