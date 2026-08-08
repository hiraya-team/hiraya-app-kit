import { expect, test } from "bun:test";
import { parseCustomTheme, parseThemeDefinition } from "./theme";

test("validates portable theme definitions", () => {
  const definition = {
    colors: {
      shell: "#25383d", chrome: "#141c1f", chromeText: "#f4f6f1", window: "#f2f1eb", windowMuted: "#e4e4dd",
      text: "#192229", textMuted: "#59625f", accent: "#e7b964", accentText: "#20261f", border: "#c6c9c1",
      danger: "#983c34", dangerSurface: "#f3dfdc", desktopText: "#ffffff", selection: "#96651d",
    },
    shape: { radius: 14, borderWidth: 1 }, effects: { blur: 22, opacity: 0.9, shadow: 0.55 },
    typography: { family: "humanist", scale: 1, weight: 600 }, density: 1, motion: 1, iconSize: 60,
  };
  expect(parseCustomTheme({ id: "dev.hiraya.aurora", name: "Aurora", definition })).toEqual({ id: "dev.hiraya.aurora", name: "Aurora", definition });
  expect(() => parseCustomTheme({ id: "../bad", name: "Bad", definition })).toThrow("invalid ID");
  const legacy = structuredClone(definition) as typeof definition & { colors: typeof definition.colors & Record<string, string> };
  Object.assign(legacy.colors, { editorBackground: "#f8f7f2", editorText: "#27302d", editorGutter: "#e8e8e1", editorKeyword: "#875d18", editorString: "#47735d", editorComment: "#606964" });
  expect(parseThemeDefinition(legacy)).toEqual(definition);
});
