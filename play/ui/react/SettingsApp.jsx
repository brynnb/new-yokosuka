import {
  AlertDialog,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  ScrollArea,
  Select,
  Separator,
  Tabs,
} from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";

import { useAccountStore } from "../../account/react/accountStore.js";
import { generalPreferences } from "../../settings/GeneralPreferences.js";
import {
  AudioSettings,
  ControlsSettings,
  GamepadSettings,
  GeneralSettings,
  GraphicsSettings,
} from "./SettingsPanels.jsx";
import {
  closeSettings,
  resetSettings,
  settingsCheckboxChanged,
  settingsValueChanged,
  useSettingsStore,
} from "./settingsStore.js";

const TABS = ["general", "controls", "gamepad", "graphics", "audio"];

function tabLabel(tab) {
  return tab[0].toUpperCase() + tab.slice(1);
}

export function SettingsApp() {
  const open = useSettingsStore((state) => state.open);
  const activeTab = useSettingsStore((state) => state.activeTab);
  const inGame = useAccountStore((state) => state.screen === "closed");
  const resetCancelRef = useRef(null);
  const [generalState, setGeneralState] = useState(
    () => generalPreferences.getState(),
  );
  const [capturingBinding, setCapturingBinding] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(
    () => generalPreferences.subscribe(setGeneralState),
    [],
  );

  useEffect(() => {
    const hideAccountMenu = open && !inGame;
    document.body.classList.toggle(
      "account-settings-open",
      hideAccountMenu,
    );
    return () => {
      document.body.classList.remove("account-settings-open");
    };
  }, [inGame, open]);

  useEffect(() => {
    if (!open) {
      setCapturingBinding(null);
      setConfirmingReset(false);
      return;
    }
    requestAnimationFrame(() => {
      const desktopTab = document.getElementById(
        `settings-${activeTab}-tab`,
      );
      const focusTarget = desktopTab?.getClientRects().length
        ? desktopTab
        : document.getElementById("settings-section-select");
      focusTarget?.focus();
    });
  }, [open]);

  const changeTab = (tab) => {
    if (tab !== activeTab) settingsValueChanged();
    useSettingsStore.setState({ activeTab: tab });
  };

  const captureKey = (event, action) => {
    if (capturingBinding !== action) return;
    if (event.code === "Escape" || event.code === "Tab") {
      if (event.code === "Escape") event.preventDefault();
      setCapturingBinding(null);
      return;
    }
    if (
      event.code.startsWith("Control")
      || event.code.startsWith("Alt")
      || event.code.startsWith("Meta")
    ) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    generalPreferences.setBinding(action, event.code);
    setCapturingBinding(null);
    settingsCheckboxChanged();
  };

  const closeFromEscape = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (confirmingReset) {
      setConfirmingReset(false);
    } else if (capturingBinding) {
      setCapturingBinding(null);
    } else {
      closeSettings();
    }
  };

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeSettings();
        }}
      >
        <Dialog.Content
          id="settings-overlay"
          forceMount
          className={[
            "settings-dialog-frame",
            inGame
              ? "settings-dialog-frame-dark"
              : "settings-dialog-frame-light",
          ].join(" ")}
          maxWidth="620px"
          aria-describedby="settings-description"
          style={{
            width: "min(620px, calc(100vw - 44px))",
            height: "min(920px, calc(100dvh - 44px))",
            padding: 0,
            overflow: "visible",
            background: "transparent",
            boxShadow: "none",
          }}
          onEscapeKeyDown={closeFromEscape}
          onPointerDownOutside={(event) => {
            const target = event.detail.originalEvent.target;
            if (target?.closest?.("[data-settings-trigger]")) {
              event.preventDefault();
            }
          }}
        >
          <Card
            size="4"
            variant="surface"
        className={[
          "settings-dialog-card",
          inGame ? "" : "settings-dialog-card-light",
          inGame ? "" : "account-shell-radix",
        ].filter(Boolean).join(" ")}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          boxShadow: inGame
            ? "0 24px 80px rgb(0 0 0 / 0.42)"
            : "0 28px 90px rgb(17 55 75 / 0.28)",
        }}
      >
        <Flex
          direction="column"
          gap="4"
          style={{ height: "100%", minHeight: 0 }}
        >
          <Box>
            <Dialog.Title
              id="settings-title"
              as="h2"
              size="5"
              trim="normal"
              mb="0"
            >
              Settings
            </Dialog.Title>
            <Dialog.Description
              id="settings-description"
              size="2"
              color="gray"
              mt="1"
            >
              Adjust controls, graphics, audio, and display options.
            </Dialog.Description>
          </Box>
          <Tabs.Root
            value={activeTab}
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              minHeight: 0,
            }}
            onValueChange={changeTab}
          >
            <Box display={{ initial: "block", sm: "none" }}>
              <Select.Root value={activeTab} onValueChange={changeTab}>
                <Select.Trigger
                  id="settings-section-select"
                  aria-label="Settings section"
                  style={{ width: "100%" }}
                />
                <Select.Content position="popper">
                  {TABS.map((tab) => (
                    <Select.Item value={tab} key={tab}>
                      {tabLabel(tab)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
            <Box display={{ initial: "none", sm: "block" }}>
              <Tabs.List aria-label="Settings sections" size="2">
                {TABS.map((tab) => (
                  <Tabs.Trigger
                    id={`settings-${tab}-tab`}
                    value={tab}
                    key={tab}
                  >
                    {tabLabel(tab)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Box>
            <ScrollArea
              type="auto"
              scrollbars="vertical"
              style={{ flex: 1, minHeight: 0 }}
            >
              <Box pt="4" pr="3">
                <Tabs.Content value="general" forceMount>
                  <Box
                    style={{
                      display: activeTab === "general" ? "block" : "none",
                    }}
                  >
                    <GeneralSettings generalState={generalState} />
                  </Box>
                </Tabs.Content>
                <Tabs.Content value="controls" forceMount>
                  <Box
                    style={{
                      display: activeTab === "controls" ? "block" : "none",
                    }}
                  >
                    <ControlsSettings
                      capturingBinding={capturingBinding}
                      generalState={generalState}
                      setCapturingBinding={setCapturingBinding}
                      captureKey={captureKey}
                    />
                  </Box>
                </Tabs.Content>
                <Tabs.Content value="audio" forceMount>
                  <Box
                    style={{
                      display: activeTab === "audio" ? "block" : "none",
                    }}
                  >
                    <AudioSettings />
                  </Box>
                </Tabs.Content>
                <Tabs.Content value="graphics" forceMount>
                  <Box
                    style={{
                      display: activeTab === "graphics" ? "block" : "none",
                    }}
                  >
                    <GraphicsSettings />
                  </Box>
                </Tabs.Content>
                <Tabs.Content value="gamepad" forceMount>
                  <Box
                    style={{
                      display: activeTab === "gamepad" ? "block" : "none",
                    }}
                  >
                    <GamepadSettings />
                  </Box>
                </Tabs.Content>
              </Box>
            </ScrollArea>
          </Tabs.Root>
          <Separator size="4" />
          <Flex gap="3" align="center" justify="end" wrap="wrap">
            <Button
              id="settings-reset"
              className="ny-button-light"
              type="button"
              variant="classic"
              onClick={() => setConfirmingReset(true)}
            >
              Reset {tabLabel(activeTab)} Defaults
            </Button>
            <Button
              id="settings-done"
              className="ny-button-primary"
              type="button"
              variant="classic"
              onClick={closeSettings}
            >
              Done
            </Button>
          </Flex>
        </Flex>
          </Card>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
      >
        <AlertDialog.Content
          className={[
            "settings-reset-dialog",
            inGame ? "" : "settings-reset-dialog-light",
          ].filter(Boolean).join(" ")}
          maxWidth="420px"
        >
          <AlertDialog.Title>
            Reset {tabLabel(activeTab)} settings?
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            This restores only the settings in the {tabLabel(activeTab)} tab
            to their defaults. Settings in the other tabs won’t change.
          </AlertDialog.Description>
          <Flex gap="3" mt="5" justify="end">
            <AlertDialog.Cancel>
              <Button
                ref={resetCancelRef}
                className="ny-button-light"
                type="button"
                variant="classic"
              >
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                type="button"
                color="teal"
                variant="classic"
                onClick={() => {
                  resetSettings(activeTab);
                  setConfirmingReset(false);
                }}
              >
                Reset {tabLabel(activeTab)}
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}
