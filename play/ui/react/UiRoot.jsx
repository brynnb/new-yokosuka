import { createPortal } from "react-dom";

import { AccountApp } from "../../account/react/AccountApp.jsx";
import { ChatPanel } from "./ChatPanel.jsx";
import { JournalApp } from "./JournalApp.jsx";
import { InventoryApp } from "./InventoryApp.jsx";
import { PlayerStatus } from "./PlayerStatus.jsx";
import { PoolApp } from "./PoolApp.jsx";
import { SettingsApp } from "./SettingsApp.jsx";
import { SidebarApp } from "./SidebarApp.jsx";
import { NewYokosukaTheme } from "./NewYokosukaTheme.jsx";

const PORTALS = Object.freeze([
  ["account-ui-root", AccountApp, true],
  ["settings-ui-root", SettingsApp, true],
  ["player-status-ui-root", PlayerStatus, true, true],
  ["chat-ui-root", ChatPanel, false],
  ["journal-ui-root", JournalApp, true],
  ["inventory-ui-root", InventoryApp, true],
  ["pool-ui-root", PoolApp, true],
  ["sidebar-ui-root", SidebarApp, true, true],
]);

export function UiRoot() {
  return PORTALS.map(([id, Component, themed, displayContents = false]) => {
    const target = document.getElementById(id);
    const content = themed
      ? (
        <NewYokosukaTheme displayContents={displayContents}>
          <Component />
        </NewYokosukaTheme>
      )
      : <Component />;
    return target
      ? createPortal(content, target, id)
      : null;
  });
}
