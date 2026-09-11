import { useEffect, useRef, useState } from "react";
import {
  Button,
  Callout,
  Card,
} from "@radix-ui/themes";

import {
  characterSlots,
} from "../AccountRules.js";
import { AccountMenuKeyboard } from "../AccountMenuKeyboard.js";
import { setAccountMenuVisible } from "../AccountMenuPresentation.js";
import {
  openSettings,
  useSettingsStore,
} from "../../ui/react/settingsStore.js";
import { worldLabelForId } from "../../config/worlds.js";
import { CUTSCENES } from "../../config/cutscenes.js";
import {
  AvatarBrowserDialog,
  CharacterPreview,
} from "./AvatarBrowserDialog.jsx";
import { useAccountStore } from "./accountStore.js";

function useMobileAccountLayout() {
  const query = "(max-width: 760px)";
  const [mobile, setMobile] = useState(
    () => globalThis.matchMedia?.(query).matches ?? false,
  );

  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return undefined;
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return mobile;
}

function AccountButton({
  children,
  className = "",
  ...props
}) {
  return (
    <Button
      type="button"
      variant="classic"
      className={`account-control ${className}`.trim()}
      {...props}
    >
      {children}
    </Button>
  );
}

function ChevronIcon({ direction }) {
  const path = direction === "left"
    ? "M15.5 19 8.5 12l7-7"
    : "M8.5 5l7 7-7 7";
  return (
    <svg
      className="character-model-chevron"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

function ErrorMessage({ error }) {
  if (!error || (Array.isArray(error) && error.length === 0)) return null;
  const messages = Array.isArray(error) ? error : [error];
  const title = Array.isArray(error)
    ? "Check the details below"
    : "We couldn't complete that request";
  const retryHint = !Array.isArray(error)
    && /(?:unavailable|failed|request failed|network)/i.test(error);
  return (
    <Callout.Root
      color="red"
      variant="surface"
      size="1"
      mt="1"
      role="alert"
      aria-live="polite"
    >
      <Callout.Icon>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 8v5.25M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </Callout.Icon>
      <Callout.Text>
        <strong>{title}</strong>
        {messages.map((message, index) => (
          <span key={message}>
            <br />
            {messages.length > 1 ? "• " : ""}
            {message}
          </span>
        ))}
        {retryHint ? (
          <span>
            <br />
            Please check the server and try again.
          </span>
        ) : null}
      </Callout.Text>
    </Callout.Root>
  );
}

function AccountShell({
  title,
  copy,
  kicker = "",
  kickerClassName = "",
  className = "",
  children,
  onKeyDown,
  radixCard = true,
}) {
  const controller = useAccountStore((state) => state.controller);
  const screen = useAccountStore((state) => state.screen);
  const gateRef = useRef(null);

  useEffect(() => {
    if (!gateRef.current || !controller) return undefined;
    const keyboard = new AccountMenuKeyboard({
      overlay: gateRef.current,
      sounds: controller.sounds,
    });
    return () => keyboard.dispose();
  }, [controller, screen]);

  const playButtonSound = (event) => {
    const control = event.target.closest?.("button.account-control");
    if (!control || control.disabled) return;
    if (control.classList.contains("selection-change")) {
      controller?.sounds?.move();
    } else if (
      control.classList.contains("character-model-arrow")
      || control.classList.contains("character-carousel-arrow")
      || (
        control.classList.contains("character-slot")
        && !control.classList.contains("empty")
      )
    ) {
      // Character changes play when state is updated so keyboard and pointer
      // interaction share one sound.
    } else {
      controller?.sounds?.confirm();
    }
  };

  const shell = (
    <div
      className={[
        "account-shell",
        className,
        radixCard ? "account-shell-radix" : "",
      ].filter(Boolean).join(" ")}
    >
      <header className="account-header">
        {kicker && (
          <span
            className={`account-kicker ${kickerClassName}`.trim()}
          >
            {kicker}
          </span>
        )}
        <h1>{title}</h1>
        {copy && <p className="account-copy">{copy}</p>}
      </header>
      <div className="account-content">{children}</div>
    </div>
  );

  return (
    <section
      className="account-gate"
      ref={gateRef}
      onClick={playButtonSound}
      onKeyDown={onKeyDown}
    >
      {radixCard
        ? (
          <Card asChild size="4" variant="surface">
            {shell}
          </Card>
        )
        : shell}
    </section>
  );
}

function IntroPrompt({ onContinue }) {
  useEffect(() => {
    const continueToMenu = (event) => {
      if (event.type === "keydown" && event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      onContinue();
    };
    window.addEventListener("keydown", continueToMenu, {
      capture: true,
      once: true,
    });
    window.addEventListener("pointerdown", continueToMenu, {
      capture: true,
      once: true,
    });
    return () => {
      window.removeEventListener("keydown", continueToMenu, true);
      window.removeEventListener("pointerdown", continueToMenu, true);
    };
  }, [onContinue]);

  return (
    <section
      className="account-intro-prompt"
      aria-label="Open the New Yokosuka menu"
    >
      <p>Press Any Key</p>
    </section>
  );
}

function EntryScreen({ onClose, revealAnimation = false }) {
  const controller = useAccountStore((state) => state.controller);
  const status = useAccountStore((state) => state.connectionStatus);
  const error = useAccountStore((state) => state.error);
  const settingsOpen = useSettingsStore((state) => state.open);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (settingsOpen) return;
      event.preventDefault();
      event.stopPropagation();
      controller?.sounds?.confirm();
      onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener(
      "keydown",
      closeOnEscape,
      true,
    );
  }, [controller, onClose, settingsOpen]);

  return (
    <AccountShell
      title="Welcome to New Yokosuka"
      copy="Sign in, create an account, or continue with a guest account"
      kicker={status.text}
      kickerClassName={status.state === "offline" ? "offline" : ""}
      className={[
        "account-shell-entry",
        "account-shell-welcome",
        revealAnimation ? "account-shell-reveal" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="account-entry-actions">
        <AccountButton
          className="ny-button-primary account-button-big"
          disabled={!controller}
          onClick={() => controller.quickPlay()}
        >
          Quick Play
        </AccountButton>
        <AccountButton
          className="ny-button-light account-button-big"
          disabled={!controller}
          onClick={() => controller.showCredentials("login")}
        >
          Sign In
        </AccountButton>
        <AccountButton
          className="ny-button-light account-button-big"
          disabled={!controller}
          onClick={() => controller.showCredentials("register")}
        >
          Create Account
        </AccountButton>
        {/* Cutscene previews remain internal until ready for public use. */}
        <AccountButton
          className="ny-button-light account-button-big"
          data-settings-trigger
          onClick={(event) => openSettings(event.currentTarget)}
        >
          Settings
        </AccountButton>
      </div>
      <ErrorMessage error={error} />
    </AccountShell>
  );
}

function CutsceneSelectionScreen() {
  const controller = useAccountStore((state) => state.controller);
  const error = useAccountStore((state) => state.error);
  const [selectedId, setSelectedId] = useState(CUTSCENES[0]?.id || null);
  const selected = CUTSCENES.find(({ id }) => id === selectedId) || null;
  return (
    <AccountShell
      title="Cutscenes"
      copy="Select an available cutscene to play. You will return here when it ends."
      className="account-shell-characters account-shell-cutscenes"
    >
      <div className="character-select-layout cutscene-select-layout">
        <div
          className="cutscene-list"
          role="listbox"
          aria-label="Available cutscenes"
          onWheel={(event) => event.stopPropagation()}
        >
          {CUTSCENES.map((cutscene) => (
            <div
              className={[
                "cutscene-list-item",
                cutscene.id === selected?.id ? "selected" : "",
              ].filter(Boolean).join(" ")}
              key={cutscene.id}
              data-cutscene-id={cutscene.id}
              role="option"
              tabIndex={0}
              aria-selected={cutscene.id === selected?.id}
              onClick={() => setSelectedId(cutscene.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setSelectedId(cutscene.id);
              }}
            >
              <strong>{cutscene.label}</strong>
              <small>{cutscene.areaLabel}</small>
            </div>
          ))}
        </div>
        <section className="character-detail cutscene-detail">
          <div
            className="cutscene-detail-art cutscene-art-surface"
            aria-hidden="true"
          >
            <span>{selected?.id || "—"}</span>
          </div>
          <div className="character-detail-copy">
            <h2>{selected?.label || "No cutscene selected"}</h2>
            <p>{selected?.areaLabel || "Select a cutscene from the list."}</p>
            {selected?.description ? (
              <p className="cutscene-description">{selected.description}</p>
            ) : null}
          </div>
        </section>
      </div>
      <div className="account-footer-actions">
        <AccountButton
          className="selection-change ny-button-light"
          onClick={() => controller.showEntry()}
        >
          Back
        </AccountButton>
        <AccountButton
          className="ny-button-primary account-button-big"
          disabled={!selected}
          onClick={() => controller.playCutscene(selected.id)}
        >
          Enter Cutscene
        </AccountButton>
      </div>
      <ErrorMessage error={error} />
    </AccountShell>
  );
}

function GuestWarningScreen() {
  const controller = useAccountStore((state) => state.controller);
  return (
    <AccountShell
      title="Guest Notice"
      copy="Guest characters are tied to this browser. Clearing browser data, using a private window, or changing browsers can make them unavailable. Guest accounts can later be converted to regular accounts if you change your mind."
      className="account-shell-entry"
    >
      <div className="account-entry-actions">
        <AccountButton
          className="ny-button-primary account-button-big"
          onClick={() => controller.quickPlay({ confirmed: true })}
        >
          Continue as Guest
        </AccountButton>
        <AccountButton
          className="ny-button-light account-button-big"
          onClick={() => controller.showEntry()}
        >
          Back
        </AccountButton>
      </div>
    </AccountShell>
  );
}

function CredentialsScreen() {
  const controller = useAccountStore((state) => state.controller);
  const mode = useAccountStore((state) => state.credentialMode);
  const error = useAccountStore((state) => state.error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = mode === "login";
  const title = login ? "Sign In" : "Create Account";
  return (
    <AccountShell
      title={title}
      copy={login
        ? "Resume your saved characters."
        : "Guest characters saved in this browser will move to your new account."}
      className="account-shell-entry"
    >
      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault();
          controller.submitCredentials(email, password);
        }}
      >
        <input
          type="email"
          placeholder="Email address"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete={login ? "current-password" : "new-password"}
          minLength="8"
          maxLength="72"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <AccountButton
          className="ny-button-primary account-button-big"
          type="submit"
        >
          {title}
        </AccountButton>
        <AccountButton
          className="ny-button-light account-button-big"
          onClick={() => controller.showEntry()}
        >
          Back
        </AccountButton>
        <ErrorMessage error={error} />
      </form>
    </AccountShell>
  );
}

function ConnectingScreen() {
  const copy = useAccountStore((state) => state.connectingCopy);
  return (
    <AccountShell
      title="Connecting..."
      copy={copy || "Retrieving your characters from the server."}
      className="account-shell-entry account-shell-connecting"
    />
  );
}

function avatarFor(character, playableCharacters) {
  return playableCharacters.find(({ id }) => id === character?.avatarId)
    || playableCharacters[0]
    || null;
}

function CharacterSelectScreen() {
  const controller = useAccountStore((state) => state.controller);
  const characters = useAccountStore((state) => state.characters);
  const selected = useAccountStore((state) => state.selectedCharacter);
  const mobile = useMobileAccountLayout();
  const avatar = avatarFor(selected, controller.playableCharacters);
  const selectedIndex = characters.findIndex(
    (character) => character.id === selected?.id,
  );
  const selectRelativeCharacter = (offset) => {
    if (!characters.length) {
      controller.sounds?.blocked();
      return;
    }
    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = (
      currentIndex + offset + characters.length
    ) % characters.length;
    controller.selectCharacter(characters[nextIndex]);
  };
  return (
    <AccountShell
      title="Character Select"
      copy=""
      className="account-shell-characters"
    >
      <div className="character-select-layout">
        {!mobile && (
          <div className="character-slots">
            {characterSlots(characters).map((character, index) => {
              return (
                <AccountButton
                  key={character?.id || `empty-${index}`}
                  className={[
                    "character-slot",
                    "character-slot-button",
                    character?.id === selected?.id ? "selected" : "",
                    character ? "" : "empty",
                  ].filter(Boolean).join(" ")}
                  disabled={!character && !controller.canCreateCharacter()}
                  onClick={() => character
                    ? controller.selectCharacter(character)
                    : controller.showCharacterCreator()}
                >
                  <span className="character-slot-number">
                    Slot {index + 1}
                  </span>
                  <strong>
                    {character?.name || "Create New Character"}
                  </strong>
                  {character && (
                    <small>
                      {worldLabelForId(character.worldId)}
                    </small>
                  )}
                </AccountButton>
              );
            })}
          </div>
        )}
        <section className="character-detail">
          <CharacterPreview character={avatar} />
          <div className="character-detail-copy">
            <h2>{selected?.name || "No character selected"}</h2>
            <p>
              {selected
                ? worldLabelForId(selected.worldId)
                : "Choose an empty slot to create your first character."}
            </p>
          </div>
        </section>
      </div>
      {mobile && (
        <div className="character-carousel-actions">
          <AccountButton
            className={[
              "character-model-arrow",
              "character-carousel-arrow",
              "ny-button-light",
              "account-button-big",
            ].join(" ")}
            aria-label="Previous character"
            disabled={!characters.length}
            onClick={() => selectRelativeCharacter(-1)}
          >
            <ChevronIcon direction="left" />
          </AccountButton>
          <AccountButton
            className="ny-button-primary account-button-big character-carousel-enter"
            disabled={!selected && characters.length > 0}
            onClick={() => selected
              ? controller.enterWorld()
              : controller.showCharacterCreator()}
          >
            {selected ? "Enter World" : "Create Character"}
          </AccountButton>
          <AccountButton
            className={[
              "character-model-arrow",
              "character-carousel-arrow",
              "ny-button-light",
              "account-button-big",
            ].join(" ")}
            aria-label="Next character"
            disabled={!characters.length}
            onClick={() => selectRelativeCharacter(1)}
          >
            <ChevronIcon direction="right" />
          </AccountButton>
        </div>
      )}
      <div className="account-footer-actions">
        <AccountButton
          className="selection-change ny-button-light"
          onClick={() => controller.logout()}
        >
          Back
        </AccountButton>
        {mobile && (
          <AccountButton
            className="ny-button-light character-select-create"
            disabled={!controller.canCreateCharacter()}
            onClick={() => controller.showCharacterCreator()}
          >
            Create Character
          </AccountButton>
        )}
        <AccountButton
          className="ny-button-light"
          disabled={!selected}
          onClick={() => controller.confirmDelete(selected)}
        >
          Delete
        </AccountButton>
        {!mobile && (
          <AccountButton
            className="ny-button-primary account-button-big"
            disabled={!selected}
            onClick={() => controller.enterWorld()}
          >
            Enter World
          </AccountButton>
        )}
      </div>
    </AccountShell>
  );
}

function CharacterCreateScreen() {
  const controller = useAccountStore((state) => state.controller);
  const avatarIndex = useAccountStore(
    (state) => state.creatorAvatarIndex || 0,
  );
  const name = useAccountStore((state) => state.creatorName || "");
  const error = useAccountStore((state) => state.error);
  const [browserOpen, setBrowserOpen] = useState(false);
  const avatar = controller.playableCharacters[avatarIndex];
  return (
    <AccountShell
      title="Character Creation"
      copy=""
      className="account-shell-creator"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (browserOpen) return;
        event.preventDefault();
        event.stopPropagation();
        controller.sounds?.confirm();
        controller.backToCharacterSelect();
      }}
    >
      <div className="character-create-layout">
        <section className="character-create-preview">
          <CharacterPreview character={avatar} />
          <div className="character-model-picker">
            <div className="character-model-picker-controls">
              <AccountButton
                className={[
                  "character-model-arrow",
                  "ny-button-light",
                  "account-button-big",
                ].join(" ")}
                aria-label="Previous character model"
                onClick={() => controller.setCreatorAvatarIndex(
                  avatarIndex - 1,
                )}
              >
                <ChevronIcon direction="left" />
              </AccountButton>
              <strong>{avatar.label}</strong>
              <AccountButton
                className={[
                  "character-model-arrow",
                  "ny-button-light",
                  "account-button-big",
                ].join(" ")}
                aria-label="Next character model"
                onClick={() => controller.setCreatorAvatarIndex(
                  avatarIndex + 1,
                )}
              >
                <ChevronIcon direction="right" />
              </AccountButton>
            </div>
            <AccountButton
              className="ny-button-light account-button-big character-browse-all"
              onClick={() => setBrowserOpen(true)}
            >
              Browse All
            </AccountButton>
          </div>
        </section>
        <form
          className="account-form character-create-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            controller.createCharacter();
          }}
        >
          <label>
            Character Name
            <input
              type="text"
              placeholder="Enter a name"
              autoComplete="off"
              minLength="3"
              maxLength="24"
              value={name}
              onChange={(event) => controller.setCreatorName(event.target.value)}
              autoFocus
            />
          </label>
          <AccountButton
            className="ny-button-primary account-button-big"
            type="submit"
          >
            Create Character
          </AccountButton>
          <p className="character-name-guidance">
            Names must be 3–24 letters, with at most one internal space and one
            internal hyphen. Capitalization is automatic, and main Shenmue
            character names aren’t allowed.
          </p>
          <ErrorMessage error={error} />
          <AccountButton
            className={[
              "character-create-back",
              "ny-button-light",
              "account-button-big",
            ].join(" ")}
            onClick={() => controller.backToCharacterSelect()}
          >
            Cancel
          </AccountButton>
        </form>
      </div>
      <AvatarBrowserDialog
        characters={controller.playableCharacters}
        selectedId={avatar.id}
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={(character) => {
          controller.setCreatorAvatarIndex(
            controller.playableCharacters.findIndex(
              ({ id }) => id === character.id,
            ),
          );
          setBrowserOpen(false);
        }}
      />
    </AccountShell>
  );
}

function DeleteCharacterScreen() {
  const controller = useAccountStore((state) => state.controller);
  const character = useAccountStore((state) => state.deleteTarget);
  const error = useAccountStore((state) => state.error);
  return (
    <AccountShell
      title={`Delete ${character?.name}?`}
      copy="This permanently deletes this character and all of their saved progress."
      className="account-shell-entry"
    >
      <div className="account-entry-actions">
        <AccountButton
          className="danger"
          onClick={() => controller.deleteCharacter()}
        >
          Delete Character
        </AccountButton>
        <AccountButton
          className="ny-button-primary"
          onClick={() => controller.backToCharacterSelect()}
        >
          Cancel
        </AccountButton>
      </div>
      <ErrorMessage error={error} />
    </AccountShell>
  );
}

function SessionEndedScreen() {
  const message = useAccountStore((state) => state.sessionEndedMessage);
  return (
    <AccountShell
      title="Session Ended"
      copy={message}
      className="account-shell-entry"
    >
      <div className="account-entry-actions">
        <AccountButton
          className="ny-button-primary"
          onClick={() => {
            location.href = "/";
          }}
        >
          Back to Homepage
        </AccountButton>
      </div>
    </AccountShell>
  );
}

export function AccountApp() {
  const screen = useAccountStore((state) => state.screen);
  const [introAccepted, setIntroAccepted] = useState(false);
  useEffect(() => {
    // Closing character selection must release the same menu-visibility
    // state used by the gameplay input router, not just remove its DOM.
    if (screen === "closed") {
      setAccountMenuVisible(false);
      return;
    }
    if (screen !== "cutscenes") return;
    setAccountMenuVisible(true);
    setIntroAccepted(true);
  }, [screen]);
  if (screen === "entry" && !introAccepted) {
    return (
      <IntroPrompt
        onContinue={() => {
          setAccountMenuVisible(true);
          setIntroAccepted(true);
        }}
      />
    );
  }
  switch (screen) {
    case "cutscenes":
      return <CutsceneSelectionScreen />;
    case "guestWarning":
      return <GuestWarningScreen />;
    case "credentials":
      return <CredentialsScreen />;
    case "connecting":
      return <ConnectingScreen />;
    case "characterSelect":
      return <CharacterSelectScreen />;
    case "characterCreate":
      return <CharacterCreateScreen />;
    case "deleteCharacter":
      return <DeleteCharacterScreen />;
    case "sessionEnded":
      return <SessionEndedScreen />;
    case "closed":
      return null;
    default:
      return (
        <EntryScreen
          revealAnimation
          onClose={() => {
            setAccountMenuVisible(false);
            setIntroAccepted(false);
          }}
        />
      );
  }
}
