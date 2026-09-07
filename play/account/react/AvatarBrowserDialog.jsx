import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  ScrollArea,
} from "@radix-ui/themes";

function CharacterPreview({ character, motion = "idle", yawDegrees = 0 }) {
  const hostRef = useRef(null);
  const previewRef = useRef(null);
  const characterRef = useRef(character);
  characterRef.current = character;

  useEffect(() => {
    let disposed = false;
    let preview;
    void import("../CharacterPreview.js").then(({ CharacterPreview: Preview }) => {
      if (disposed || !hostRef.current) return;
      preview = new Preview(hostRef.current, { motion, yawDegrees });
      previewRef.current = preview;
      if (characterRef.current) preview.show(characterRef.current);
    });
    return () => {
      disposed = true;
      preview?.dispose();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (character) previewRef.current?.show(character);
  }, [character]);

  return <div className="character-preview" ref={hostRef} />;
}

function LazyCharacterPreview({ character }) {
  const hostRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (!globalThis.IntersectionObserver) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { threshold: 0.01 });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="avatar-browser-preview" ref={hostRef}>
      {visible
        ? (
          <CharacterPreview
            character={character}
            motion="walk"
            yawDegrees={-25}
          />
        )
        : <span className="avatar-browser-preview-placeholder">Preview</span>}
    </div>
  );
}

export function AvatarBrowserDialog({
  characters,
  selectedId,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onSelect,
  dark = false,
  title = "Browse All Characters",
  description = "Choose a Shenmue character model for your new character.",
}) {
  const choices = [...characters].sort((left, right) => (
    left.label.localeCompare(right.label, "en")
  ));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        className={[
          "avatar-browser-dialog",
          dark ? "avatar-browser-dialog-dark dark-theme" : "",
        ].filter(Boolean).join(" ")}
        aria-describedby="avatar-browser-description"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <header className="avatar-browser-header">
          <div>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description id="avatar-browser-description">
              {description}
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <Button
              type="button"
              color="gray"
              variant="soft"
              className="account-control avatar-browser-close"
            >
              Close
            </Button>
          </Dialog.Close>
        </header>
        <ScrollArea
          className="avatar-browser-scroll"
          type="auto"
          scrollbars="vertical"
        >
          <div className="avatar-browser-grid">
            {choices.map((character) => (
              <Button
                type="button"
                variant="surface"
                className={[
                  "account-control",
                  "avatar-browser-card",
                  character.id === selectedId ? "selected" : "",
                ].filter(Boolean).join(" ")}
                key={character.id}
                onClick={() => onSelect(character)}
              >
                <LazyCharacterPreview character={character} />
                <strong>{character.label}</strong>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export { CharacterPreview };
