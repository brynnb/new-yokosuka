import { Theme } from "@radix-ui/themes";

import { useAccountStore } from "../../account/react/accountStore.js";

export const NEW_YOKOSUKA_THEME = Object.freeze({
  accentColor: "teal",
  grayColor: "slate",
  panelBackground: "translucent",
  radius: "medium",
  scaling: "100%",
});

export function themeAppearanceForAccountScreen(screen) {
  return screen === "closed" ? "dark" : "light";
}

export function NewYokosukaTheme({ children, displayContents = false }) {
  const screen = useAccountStore((state) => state.screen);
  const appearance = themeAppearanceForAccountScreen(screen);
  return (
    <Theme
      {...NEW_YOKOSUKA_THEME}
      appearance={appearance}
      className={[
        "new-yokosuka-theme",
        `new-yokosuka-theme-${appearance}`,
        displayContents ? "new-yokosuka-theme-contents" : "",
      ].filter(Boolean).join(" ")}
      hasBackground={false}
    >
      {children}
    </Theme>
  );
}
