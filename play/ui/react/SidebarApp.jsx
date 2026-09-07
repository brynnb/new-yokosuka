import { useState } from "react";
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Select,
  Text,
  Tooltip,
} from "@radix-ui/themes";

import { AvatarBrowserDialog } from "../../account/react/AvatarBrowserDialog.jsx";
import {
  TRAVEL_DESTINATION_GROUPS,
} from "./SidebarData.js";
import {
  chatViewState,
  openPlayerDirectory,
  useChatUiStore,
} from "./chatStore.js";
import { OnlinePlayersDialog } from "./OnlinePlayersDialog.jsx";
import {
  DEFAULT_APPEARANCE_VALUE,
  focusGameAfterSidebarSelect,
  selectSidebarCharacter,
  selectSidebarEmote,
  selectSidebarTravel,
  setSidebarPickerOpen,
  useSidebarStore,
} from "./sidebarStore.js";

function SidebarSelect({
  id,
  placeholder,
  picker,
  disabled = false,
  disabledReason = null,
  value = "",
  children,
  onValueChange,
}) {
  const openPicker = useSidebarStore((state) => state.openPicker);
  const select = (
    <Select.Root
      value={value}
      open={openPicker === picker}
      disabled={disabled}
      onOpenChange={(open) => setSidebarPickerOpen(picker, open)}
      onValueChange={onValueChange}
    >
      <Select.Trigger
        id={id}
        className="sidebar-select-trigger"
        color="gray"
        variant="soft"
        style={{ width: "100%" }}
        aria-label={placeholder}
        placeholder={placeholder}
      />
      <Select.Content
        id={`${picker}-dropdown`}
        className="sidebar-select-content dark-theme"
        position="popper"
        onCloseAutoFocus={focusGameAfterSidebarSelect}
      >
        {children}
      </Select.Content>
    </Select.Root>
  );
  return disabled && disabledReason ? (
    <Tooltip content={disabledReason}>
      <span style={{ display: "block", width: "100%" }}>{select}</span>
    </Tooltip>
  ) : select;
}

function SidebarToggle() {
  return (
    <IconButton
      className="sidebar-toggle"
      id="sidebar-toggle"
      type="button"
      size="2"
      color="gray"
      variant="soft"
      aria-label="Collapse sidebar"
      aria-expanded="true"
      title="Collapse sidebar"
    >
      <svg
        className="sidebar-toggle-collapse"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <rect x="2.5" y="3" width="15" height="14" rx="2" />
        <path d="M7 3v14M13 7l-3 3 3 3" />
      </svg>
      <svg
        className="sidebar-toggle-expand"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <rect x="2.5" y="3" width="15" height="14" rx="2" />
        <path d="M7 3v14M10 7l3 3-3 3" />
      </svg>
    </IconButton>
  );
}

export function SidebarApp() {
  const [avatarBrowserOpen, setAvatarBrowserOpen] = useState(false);
  const connectionState = useChatUiStore((state) => state.connectionState);
  const playerCount = useChatUiStore((state) => state.playerCount);
  const {
    connected: multiplayerConnected,
    status: multiplayerStatus,
  } = chatViewState({ connectionState, playerCount });
  const emotes = useSidebarStore((state) => state.emotes);
  const characters = useSidebarStore((state) => state.characters);
  const activeEmoteId = useSidebarStore((state) => state.activeEmoteId);
  const activeCharacterId = useSidebarStore(
    (state) => state.activeCharacterId,
  );
  const defaultCharacterId = useSidebarStore(
    (state) => state.defaultCharacterId,
  );
  const animationDisabled = useSidebarStore(
    (state) => state.animationDisabled,
  );
  const animationDisabledReason = useSidebarStore(
    (state) => state.animationDisabledReason,
  );
  const characterDisabled = useSidebarStore(
    (state) => state.characterDisabled,
  );
  const defaultCharacter = characters.find(
    ({ id }) => id === defaultCharacterId,
  );

  return (
    <>
      <SidebarToggle />
      <Box className="sidebar-header">
        <Heading as="h1" className="sidebar-title" size="4">
          New Yokosuka
        </Heading>
        <button
          type="button"
          className="sidebar-server-status"
          data-state={
            multiplayerConnected ? "online" : connectionState
          }
          disabled={!multiplayerConnected}
          aria-haspopup="dialog"
          aria-controls="online-players-overlay"
          onClick={openPlayerDirectory}
        >
          {multiplayerStatus}
        </button>
      </Box>
      {/* Keep layout in Radix props: a competing display:grid rule in base.css
          wins in production but not dev, shrinking the cards off-center. */}
      <Flex
        className="sidebar-game-tools"
        direction="column"
        gap="3"
        p="3"
        width="100%"
        align="stretch"
        flexShrink="0"
      >
        <Card
          size="2"
          variant="surface"
          aria-label="Travel, animation, and character selection"
        >
          <Flex direction="column" gap="2">
            <SidebarSelect
              id="travel-button"
              placeholder="Travel To..."
              picker="travel"
              onValueChange={selectSidebarTravel}
            >
              {TRAVEL_DESTINATION_GROUPS.map((group, groupIndex) => (
                <Select.Group key={group.label}>
                  {groupIndex > 0 && <Select.Separator />}
                  <Select.Label>{group.label}</Select.Label>
                  {group.destinations.map(([worldId, label]) => (
                    <Select.Item value={worldId} key={worldId}>
                      {label}
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </SidebarSelect>
            <SidebarSelect
              id="animation-button"
              placeholder="Select Emote..."
              picker="animation"
              disabled={animationDisabled}
              disabledReason={animationDisabledReason}
              onValueChange={selectSidebarEmote}
            >
              {emotes.map((emote) => (
                <Select.Item value={emote.id} key={emote.id}>
                  <Text color={emote.id === activeEmoteId ? "teal" : undefined}>
                    {emote.label}
                  </Text>
                </Select.Item>
              ))}
            </SidebarSelect>
            <SidebarSelect
              id="character-button"
              placeholder="Select Appearance..."
              picker="character"
              value={activeCharacterId === defaultCharacterId
                ? DEFAULT_APPEARANCE_VALUE
                : activeCharacterId || DEFAULT_APPEARANCE_VALUE}
              disabled={characterDisabled}
              onValueChange={selectSidebarCharacter}
            >
              <Select.Item value={DEFAULT_APPEARANCE_VALUE}>
                {defaultCharacter
                  ? `Default (${defaultCharacter.label})`
                  : "Default"}
              </Select.Item>
              <Select.Separator />
              {characters.filter(
                ({ id }) => id !== defaultCharacterId,
              ).map((character) => (
                <Select.Item value={character.id} key={character.id}>
                  <Text
                    color={
                      character.id === activeCharacterId ? "teal" : undefined
                    }
                  >
                    {character.label}
                  </Text>
                </Select.Item>
              ))}
            </SidebarSelect>
            <Button
              id="browse-avatars-button"
              type="button"
              color="gray"
              variant="soft"
              disabled={characterDisabled}
              onClick={() => setAvatarBrowserOpen(true)}
            >
              Browse Avatars
            </Button>
          </Flex>
        </Card>
        <Card size="1" variant="surface" aria-label="Notebook and inventory">
          <Grid columns="1" gap="2">
            <Button
              id="journal-button"
              type="button"
              color="gray"
              variant="soft"
              aria-haspopup="dialog"
              aria-controls="journal-overlay"
            >
              Notebook
            </Button>
            <Button
              id="inventory-button"
              type="button"
              color="gray"
              variant="soft"
              aria-haspopup="dialog"
              aria-controls="inventory-overlay"
            >
              Inventory
            </Button>
          </Grid>
        </Card>
        <Card size="1" variant="surface" aria-label="Session and settings">
          <Grid columns="1fr 1fr" gap="2">
            <Button
              id="logout-button"
              type="button"
              color="gray"
              variant="soft"
            >
              Log Out
            </Button>
            <Button
              id="settings-button"
              data-settings-trigger
              type="button"
              color="gray"
              variant="soft"
              aria-haspopup="dialog"
              aria-controls="settings-overlay"
            >
              Settings
            </Button>
          </Grid>
        </Card>
      </Flex>
      <AvatarBrowserDialog
        characters={characters}
        selectedId={activeCharacterId}
        open={avatarBrowserOpen}
        onOpenChange={setAvatarBrowserOpen}
        onCloseAutoFocus={focusGameAfterSidebarSelect}
        onSelect={(character) => {
          selectSidebarCharacter(character.id);
          setAvatarBrowserOpen(false);
        }}
        dark
        title="Browse Avatars"
        description="Choose a temporary appearance for this session."
      />
      <OnlinePlayersDialog />
    </>
  );
}
