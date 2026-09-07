import {
  Box,
  Checkbox,
  Grid,
  Slider,
  Text,
} from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";

import {
  settingsCheckboxChanged,
  useSettingsStore,
} from "./settingsStore.js";

function dispatchLegacyEvent(element, type) {
  element?.dispatchEvent(new Event(type, { bubbles: true }));
}

export function LegacyCheckbox({
  id,
  label,
  defaultChecked = false,
  wrapperId,
}) {
  const open = useSettingsStore((state) => state.open);
  const syncRevision = useSettingsStore((state) => state.syncRevision);
  const bridgeRef = useRef(null);
  const [checked, setChecked] = useState(defaultChecked);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChecked(Boolean(bridgeRef.current?.checked));
    setDisabled(Boolean(bridgeRef.current?.disabled));
  }, [open, syncRevision]);

  return (
    <Box id={wrapperId}>
      <input
        ref={bridgeRef}
        id={id}
        type="checkbox"
        defaultChecked={defaultChecked}
        hidden
        aria-hidden="true"
        tabIndex={-1}
      />
      <Text as="label" size="2" className="settings-checkbox-label">
        <Grid columns="auto 1fr" align="center" gap="2">
          <Checkbox
            checked={checked}
            disabled={disabled}
            onCheckedChange={(nextChecked) => {
              const next = nextChecked === true;
              setChecked(next);
              bridgeRef.current.checked = next;
              dispatchLegacyEvent(bridgeRef.current, "change");
              settingsCheckboxChanged();
            }}
          />
          {label}
        </Grid>
      </Text>
    </Box>
  );
}

export function LegacySlider({
  id,
  label,
  defaultValue,
  muteId,
  wrapperId,
  muteWrapperId,
}) {
  const open = useSettingsStore((state) => state.open);
  const syncRevision = useSettingsStore((state) => state.syncRevision);
  const bridgeRef = useRef(null);
  const [value, setValue] = useState(Number(defaultValue));
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextValue = Number(bridgeRef.current?.value);
    if (Number.isFinite(nextValue)) setValue(nextValue);
    setDisabled(Boolean(bridgeRef.current?.disabled));
  }, [open, syncRevision]);

  return (
    <Grid id={wrapperId} gap="2" className="settings-slider-row">
      <Text size="2" weight="medium">{label}</Text>
      <Grid columns="minmax(0, 1fr) auto" gap="4" align="center">
        <input
          ref={bridgeRef}
          id={id}
          type="range"
          min="0"
          max="1"
          step="0.01"
          defaultValue={defaultValue}
          hidden
          aria-hidden="true"
          tabIndex={-1}
        />
        <Slider
          className="settings-slider"
          value={[value]}
          min={0}
          max={1}
          step={0.01}
          disabled={disabled}
          aria-label={label}
          onValueChange={([nextValue]) => {
            setValue(nextValue);
            bridgeRef.current.value = String(nextValue);
            dispatchLegacyEvent(bridgeRef.current, "input");
          }}
        />
        {muteId ? (
          <LegacyCheckbox
            id={muteId}
            label="Mute"
            wrapperId={muteWrapperId}
          />
        ) : null}
      </Grid>
    </Grid>
  );
}
