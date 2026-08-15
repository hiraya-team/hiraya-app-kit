import { expect, test } from "bun:test";
import { parseCustomTheme, parseThemeDefinition, parseThemeTokens } from "./theme";

const tokens = {
  mode: "dark",
  background: "#172329",
  surface: "#f2f1eb",
  surfaceElevated: "#ffffff",
  text: "#192229",
  textMuted: "#59625f",
  border: "#c6c9c1",
  accent: "#96651d",
  accentText: "#ffffff",
  danger: "#983c34",
  focus: "#e7b964",
} as const;

test("validates semantic runtime theme tokens", () => {
  expect(parseThemeTokens(tokens)).toEqual(tokens);
  expect(() => parseThemeTokens({ ...tokens, mode: "system" })).toThrow("mode");
  expect(() => parseThemeTokens({ ...tokens, legacyAccent: "#fff" })).toThrow("unsupported shape");
});

test("validates portable theme definitions", () => {
  const definition = {
    colors: {
      shell: "#25383d", chrome: "#141c1f", chromeText: "#f4f6f1", window: "#f2f1eb", windowMuted: "#e4e4dd",
      text: "#192229", textMuted: "#59625f", accent: "#e7b964", accentText: "#20261f", border: "#c6c9c1",
      danger: "#983c34", dangerSurface: "#f3dfdc", desktopText: "#ffffff", selection: "#96651d",
    },
    shape: { radius: 14, borderWidth: 1 }, effects: { blur: 22, opacity: 0.9, shadow: 0.55 },
    typography: { family: "humanist", scale: 1, weight: 600 }, density: 1, motion: 1, iconSize: 60,
  } as const;
  expect(parseCustomTheme({ id: "dev.hiraya.aurora", name: "Aurora", definition })).toEqual({ id: "dev.hiraya.aurora", name: "Aurora", definition });
  expect(() => parseCustomTheme({ id: "../bad", name: "Bad", definition })).toThrow("invalid ID");
  expect(() => parseThemeDefinition({ ...definition, legacyEditorPalette: {} })).toThrow("unsupported format");
  expect(() => parseThemeDefinition({ ...definition, colors: { ...definition.colors, editorBackground: "#f8f7f2" } })).toThrow("unsupported format");
});
