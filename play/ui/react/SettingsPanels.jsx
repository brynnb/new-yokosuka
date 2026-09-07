import {
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Heading,
  Separator,
  Select,
  Slider,
  Text,
} from "@radix-ui/themes";
import { useEffect, useState } from "react";

import {
  CONTROL_BINDING_GROUPS,
  formatControlBinding,
  generalPreferences,
} from "../../settings/GeneralPreferences.js";
import {
  LegacyCheckbox,
  LegacySlider,
} from "./SettingsLegacyControls.jsx";
import { settingsCheckboxChanged } from "./settingsStore.js";
import {
  gamepadPreferences,
} from "../../input/GamepadPreferences.js";
import { connectedGamepads } from "../../input/GamepadDiscovery.js";
import {
  STANDARD_GAMEPAD_CONTROLS,
  selectPreferredGamepad,
} from "../../input/GamepadInput.js";
import {
  graphicsPreferences,
} from "../../../src/rendering/GraphicsPreferences.js";

const LOCAL_DEBUG = Boolean(
  import.meta.env.DEV
  && typeof window !== "undefined"
  && ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname),
);

function PreferenceCheckbox({ checked, label, onCheckedChange }) {
  return (
    <Text as="label" size="2" className="settings-checkbox-label">
      <Grid columns="auto 1fr" align="center" gap="2">
        <Checkbox
          checked={checked}
          onCheckedChange={(nextChecked) => {
            onCheckedChange(nextChecked === true);
            settingsCheckboxChanged();
          }}
        />
        {label}
      </Grid>
    </Text>
  );
}

export function GeneralSettings({ generalState }) {
  return (
    <Grid gap="5">
      <Grid columns={{ initial: "1", sm: "2" }} gap="4">
        <PreferenceCheckbox
          label="Dialogue Captions"
          checked={generalState.dialogueCaptions}
          onCheckedChange={(checked) => {
            generalPreferences.setDialogueCaptions(checked);
          }}
        />
        <PreferenceCheckbox
          label="Dialogue Audio"
          checked={generalState.dialogueAudio}
          onCheckedChange={(checked) => {
            generalPreferences.setDialogueAudio(checked);
          }}
        />
      </Grid>
      <Separator size="4" />
      <Grid gap="3">
        <LegacyCheckbox id="big-chat" label="Big Chat" />
        <LegacyCheckbox id="hide-controls" label="Hide Controls" />
        <LegacyCheckbox id="hide-discord" label="Hide Discord" />
        <LegacyCheckbox
          id="show-debug"
          label="Show Debug"
          defaultChecked
          wrapperId="debug-visibility-option"
        />
      </Grid>
    </Grid>
  );
}

export function ControlsSettings({
  capturingBinding,
  generalState,
  setCapturingBinding,
  captureKey,
}) {
  return (
    <Grid gap="5">
      <Grid gap="2" className="settings-slider-row">
        <Flex justify="between" gap="4">
          <Text size="2" weight="medium">Mouse Sensitivity</Text>
          <Text size="2" color="teal">
            {Math.round(generalState.mouseSensitivity * 100)}%
          </Text>
        </Flex>
        <Slider
          className="settings-slider"
          value={[generalState.mouseSensitivity]}
          min={0.25}
          max={2}
          step={0.05}
          aria-label="Mouse Sensitivity"
          onValueChange={([value]) => {
            generalPreferences.setMouseSensitivity(value);
          }}
        />
      </Grid>
      <Separator size="4" />
      <Grid gap="4">
        <Heading as="h3" size="2">Key Bindings</Heading>
        {CONTROL_BINDING_GROUPS.map((group) => (
          <Grid gap="2" key={group.label}>
            <Text
              size="1"
              weight="bold"
              color="gray"
              style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {group.label}
            </Text>
            <Grid columns={{ initial: "1", sm: "2" }} gap="2">
              {group.controls
                .filter(([action]) => action !== "noClip" || LOCAL_DEBUG)
                .map(([action, label]) => (
                <Card key={action} size="1" variant="surface">
                  <Flex align="center" justify="between" gap="3">
                    <Text size="1">{label}</Text>
                    <Button
                      className="ny-button-light"
                      size="1"
                      variant="classic"
                      aria-label={`Rebind ${label}`}
                      onClick={() => setCapturingBinding(action)}
                      onKeyDown={(event) => captureKey(event, action)}
                      onBlur={() => {
                        if (capturingBinding === action) {
                          setCapturingBinding(null);
                        }
                      }}
                      style={{ minWidth: 92 }}
                    >
                      {capturingBinding === action
                        ? "Press a key…"
                        : formatControlBinding(generalState.bindings[action])}
                    </Button>
                  </Flex>
                </Card>
                ))}
            </Grid>
          </Grid>
        ))}
      </Grid>
    </Grid>
  );
}

function GamepadSlider({ label, value, min, max, step, format, onChange }) {
  return (
    <Grid gap="2" className="settings-slider-row">
      <Flex justify="between" gap="4">
        <Text size="2" weight="medium">{label}</Text>
        <Text size="2" color="teal">{format(value)}</Text>
      </Flex>
      <Slider
        className="settings-slider"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([next]) => onChange(next)}
      />
    </Grid>
  );
}

export function GamepadSettings() {
  const [state, setState] = useState(() => gamepadPreferences.getState());
  const [gamepads, setGamepads] = useState(() => connectedGamepads());
  const gamepad = selectPreferredGamepad(
    gamepads,
    state.selectedGamepadId,
  );

  useEffect(() => gamepadPreferences.subscribe(setState), []);
  useEffect(() => {
    const refresh = () => setGamepads(connectedGamepads());
    const interval = window.setInterval(refresh, 500);
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
    };
  }, []);
  useEffect(() => {
    if (!state.selectedGamepadId && gamepad?.id) {
      gamepadPreferences.setSelectedGamepadId(gamepad.id);
    }
  }, [gamepad?.id, state.selectedGamepadId]);

  return (
    <Grid gap="5">
      <Grid gap="3">
        <Flex justify="between" align="center" gap="4">
          <PreferenceCheckbox
            label="Enable Gamepad"
            checked={state.enabled}
            onCheckedChange={(checked) => {
              gamepadPreferences.setEnabled(checked);
            }}
          />
          <Select.Root
            value={gamepad?.id}
            disabled={gamepads.length === 0}
            onValueChange={(value) => {
              gamepadPreferences.setSelectedGamepadId(value);
            }}
          >
            <Select.Trigger
              aria-label="Active controller"
              placeholder="Connect a controller"
              style={{ minWidth: "16rem", maxWidth: "24rem" }}
            />
            <Select.Content position="popper">
              {gamepads.map((option) => (
                <Select.Item value={option.id} key={option.id}>
                  {option.id} ({option.mapping || "raw"})
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
        <Text size="1" color="gray">
          Standard Gamepad API layout is supported. Xbox, PlayStation, and
          compatible controllers use their browser-standard button mapping.
        </Text>
      </Grid>
      <Separator size="4" />
      <Grid columns={{ initial: "1", sm: "2" }} gap="4">
        <GamepadSlider
          label="Movement Deadzone"
          value={state.movementDeadzone}
          min={0.05}
          max={0.5}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => gamepadPreferences.setMovementDeadzone(value)}
        />
        <GamepadSlider
          label="Look Deadzone"
          value={state.lookDeadzone}
          min={0.05}
          max={0.5}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => gamepadPreferences.setLookDeadzone(value)}
        />
        <GamepadSlider
          label="Look Sensitivity"
          value={state.lookSensitivity}
          min={0.25}
          max={2}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => gamepadPreferences.setLookSensitivity(value)}
        />
        <PreferenceCheckbox
          label="Invert Vertical Look"
          checked={state.invertLookY}
          onCheckedChange={(checked) => {
            gamepadPreferences.setInvertLookY(checked);
          }}
        />
      </Grid>
      <Separator size="4" />
      {Object.entries(STANDARD_GAMEPAD_CONTROLS).map(([mode, controls]) => (
        <Grid gap="2" key={mode}>
          <Heading as="h3" size="2">
            {{ onFoot: "On Foot", forklift: "Forklift", pool: "Pool" }[mode]}
          </Heading>
          <Grid columns={{ initial: "1", sm: "2" }} gap="2">
            {controls.map(([control, action]) => (
              <Card key={control} size="1" variant="surface">
                <Flex justify="between" gap="3">
                  <Text size="1" weight="bold">{control}</Text>
                  <Text size="1" color="gray" align="right">{action}</Text>
                </Flex>
              </Card>
            ))}
          </Grid>
        </Grid>
      ))}
    </Grid>
  );
}

export function GraphicsSettings() {
  const [state, setState] = useState(() => graphicsPreferences.getState());

  useEffect(() => graphicsPreferences.subscribe(setState), []);

  return (
    <Grid gap="5">
      <Grid gap="2">
        <Flex justify="between" align="center" gap="4" wrap="wrap">
          <Grid gap="1">
            <Text size="2" weight="medium">Anti-aliasing</Text>
            <Text size="1" color="gray">
              Smooths object and transparent texture edges.
            </Text>
          </Grid>
          <Select.Root
            value={state.antiAliasing}
            onValueChange={(value) => {
              graphicsPreferences.setAntiAliasing(value);
              settingsCheckboxChanged();
            }}
          >
            <Select.Trigger aria-label="Anti-aliasing" style={{ minWidth: 170 }} />
            <Select.Content position="popper">
              <Select.Item value="off">Off</Select.Item>
              <Select.Item value="fxaa">FXAA</Select.Item>
              <Select.Item value="msaa2">2× MSAA</Select.Item>
              <Select.Item value="msaa4">4× MSAA</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
        <Text size="1" color="gray">
          FXAA is fastest. MSAA preserves more detail; 4× gives the cleanest
          edges at the highest GPU cost.
        </Text>
      </Grid>
      <Separator size="4" />
      <Grid gap="2">
        <Flex justify="between" align="center" gap="4" wrap="wrap">
          <Grid gap="1">
            <Text size="2" weight="medium">Texture filtering</Text>
            <Text size="1" color="gray">
              Controls texture clarity at steep angles and long distances.
            </Text>
          </Grid>
          <Select.Root
            value={state.textureFiltering}
            onValueChange={(value) => {
              graphicsPreferences.setTextureFiltering(value);
              settingsCheckboxChanged();
            }}
          >
            <Select.Trigger aria-label="Texture filtering" style={{ minWidth: 170 }} />
            <Select.Content position="popper">
              <Select.Item value="performance">Performance (1×)</Select.Item>
              <Select.Item value="balanced">Balanced (4×)</Select.Item>
              <Select.Item value="high">High (8×)</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
        <Text size="1" color="gray">
          Higher filtering improves angled textures while mipmaps are enabled.
        </Text>
      </Grid>
      <Separator size="4" />
      <Grid gap="2">
        <Flex justify="between" align="center" gap="4" wrap="wrap">
          <Grid gap="1">
            <Text size="2" weight="medium">Render resolution</Text>
            <Text size="1" color="gray">
              Caps the number of pixels rendered on high-DPI displays.
            </Text>
          </Grid>
          <Select.Root
            value={state.renderResolution}
            onValueChange={(value) => {
              graphicsPreferences.setRenderResolution(value);
              settingsCheckboxChanged();
            }}
          >
            <Select.Trigger
              aria-label="Render resolution"
              style={{ minWidth: 190 }}
            />
            <Select.Content position="popper">
              <Select.Item value="highDpi">High DPI (up to 2×)</Select.Item>
              <Select.Item value="standard">Standard (1×)</Select.Item>
              <Select.Item value="low">Low (0.8×)</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
        <Text size="1" color="gray">
          Standard avoids extra high-DPI rendering. Low prioritizes performance.
        </Text>
      </Grid>
      <Separator size="4" />
      <Grid gap="4">
        <Grid gap="1">
          <PreferenceCheckbox
            label="Enable Mipmaps"
            checked={state.mipmaps}
            onCheckedChange={(checked) => {
              graphicsPreferences.setMipmaps(checked);
            }}
          />
          <Text size="1" color="gray">
            Reduces distant texture shimmer. Texture memory is rebuilt when
            the next world loads.
          </Text>
        </Grid>
        <Grid gap="1">
          <PreferenceCheckbox
            label="Dynamically Adjust Render Resolution"
            checked={state.dynamicResolution}
            onCheckedChange={(checked) => {
              graphicsPreferences.setDynamicResolution(checked);
            }}
          />
          <Text size="1" color="gray">
            Temporarily lowers resolution below the selected cap when needed.
          </Text>
        </Grid>
      </Grid>
    </Grid>
  );
}

export function AudioSettings() {
  return (
    <Grid id="music-controls" gap="5">
      <LegacyCheckbox id="footsteps-muted" label="Mute Footsteps" />
      <LegacyCheckbox
        id="forklift-reverse-muted"
        label="Mute Forklift Backing Alarm"
      />
      <LegacySlider
        id="overall-volume"
        label="Overall Volume"
        defaultValue="1"
        muteId="mute-all"
      />
      <LegacySlider
        id="music-volume"
        label="Background Music Volume"
        defaultValue="0.55"
        muteId="music-muted"
      />
      <LegacySlider
        id="dialogue-volume"
        label="Dialogue Volume"
        defaultValue="0.5"
        muteId="dialogue-muted"
      />
      <LegacySlider
        id="ambient-volume"
        label="Ambient Volume"
        defaultValue="0.5"
        muteId="ambient-muted"
      />
      <LegacySlider
        id="sound-effects-volume"
        label="Sound Effects Volume"
        defaultValue="0.5"
        muteId="sound-effects-muted"
      />
      <LegacySlider
        id="arcade-bg-volume"
        label="Arcade Background Volume"
        defaultValue="0.18"
        muteId="arcade-bg-muted"
        wrapperId="arcade-bg-volume-row"
        muteWrapperId="arcade-bg-muted-row"
      />
      <LegacySlider
        id="tv-volume"
        label="TV and Cinema Volume"
        defaultValue="0.18"
        muteId="tv-muted"
      />
    </Grid>
  );
}
