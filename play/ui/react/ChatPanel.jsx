import { useEffect, useRef, useState } from "react";

import {
  chatViewState,
  openPlayerDirectory,
  useChatUiStore,
} from "./chatStore.js";

export function ChatPanel() {
  const state = useChatUiStore();
  const { connected, title, status } = chatViewState(state);
  const [text, setText] = useState("");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      const interactiveTarget = event.target?.closest?.(
        "input, button, select, textarea, [contenteditable='true']",
      );
      if (
        event.key === "Enter"
        && document.activeElement !== inputRef.current
        && !interactiveTarget
        && !event.repeat
        && state.controller?.canFocus()
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.exitPointerLock?.();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [state.controller]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.messages]);

  useEffect(() => {
    const panel = panelRef.current;
    const list = listRef.current;
    if (!panel || !list) return undefined;

    const onWheel = (event) => {
      const pageHeight = Math.max(list.clientHeight, 1);
      const deltaScale = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? pageHeight
          : 1;

      list.scrollTop += event.deltaY * deltaScale;
      event.preventDefault();
      event.stopPropagation();
    };

    panel.addEventListener("wheel", onWheel, { passive: false });
    return () => panel.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <section
      className="chat-panel"
      id="chat-panel"
      aria-label="Online chat"
      ref={panelRef}
    >
      <header className="chat-header">
        <span id="chat-title">{title}</span>
        <button
          type="button"
          className="multiplayer-status"
          id="multiplayer-status"
          data-state={connected ? "online" : state.connectionState}
          disabled={!connected}
          aria-haspopup="dialog"
          aria-controls="online-players-overlay"
          onClick={openPlayerDirectory}
        >
          {status}
        </button>
      </header>
      <div
        className="chat-messages"
        id="chat-messages"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        ref={listRef}
      >
        {state.messages.map((message) => (
          <div
            className={[
              "chat-message",
              message.type === "system" ? "chat-message-system" : "",
            ].filter(Boolean).join(" ")}
            key={message.id}
          >
            {message.type === "chat" && (
              <strong className="chat-message-name">{message.name}:</strong>
            )}
            {message.type === "chat" ? ` ${message.text}` : message.text}
          </div>
        ))}
      </div>
      <form
        className="chat-form"
        id="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = text.trim();
          if (!trimmed) {
            inputRef.current?.blur();
            return;
          }
          if (connected && state.controller?.send(trimmed)) {
            setText("");
            state.controller.setTyping(false);
            inputRef.current?.blur();
            document.getElementById("renderCanvas")?.focus({
              preventScroll: true,
            });
          }
        }}
      >
        <input
          className="chat-input"
          id="chat-input"
          type="text"
          maxLength="240"
          autoComplete="off"
          aria-label="Chat message"
          placeholder={connected ? "Press Enter to chat…" : "Multiplayer offline"}
          disabled={!connected}
          value={text}
          ref={inputRef}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => state.controller?.setTyping(true)}
          onBlur={() => state.controller?.setTyping(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setText("");
              inputRef.current?.blur();
            }
            event.stopPropagation();
          }}
        />
      </form>
    </section>
  );
}
