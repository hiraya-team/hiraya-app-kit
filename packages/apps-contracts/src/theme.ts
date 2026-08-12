export type ThemeFontFamily = "humanist" | "system" | "mono";
export type ThemeTexture = "none" | "halftone" | "dither";
export type ThemeWallpaperKind = "static" | "animated" | "scene";

export type ThemeTreatment = {
  gradientStrength: number;
  gradientAngle: number;
  texture: ThemeTexture;
  textureStrength: number;
  textureScale: number;
  pixelated: boolean;
};

export type ThemeColors = {
  shell: string;
  chrome: string;
  chromeText: string;
  window: string;
  windowMuted: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  border: string;
  danger: string;
  dangerSurface: string;
  desktopText: string;
  selection: string;
};

export type ThemeDefinition = {
  colors: ThemeColors;
  shape: { radius: number; borderWidth: number };
  effects: { blur: number; opacity: number; shadow: number };
  treatment?: ThemeTreatment;
  typography: { family: ThemeFontFamily; scale: number; weight: number };
  density: number;
  motion: number;
  iconSize: number;
};

export type CustomTheme = { id: string; name: string; definition: ThemeDefinition };

const BUILTIN_THEME_IDS = ["hiraya-dusk", "warm-paper", "midnight-glass", "high-contrast"];
const COLOR_KEYS: Array<keyof ThemeColors> = [
  "shell", "chrome", "chromeText", "window", "windowMuted", "text", "textMuted", "accent", "accentText", "border",
  "danger", "dangerSurface", "desktopText", "selection",
];
const HEX_COLOR = /^#[\da-f]{6}$/i;
const GRADIENT_ANGLES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The theme has an unsupported format.");
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw new Error("The theme has an unsupported format.");
}

function boundedNumber(value: unknown, min: number, max: number, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new Error("The theme has an unsupported value.");
  return value;
}

function containsControl(value: string) {
  return [...value].some((character) => (character.codePointAt(0) ?? 0) < 32 || character.codePointAt(0) === 127);
}

function relativeLuminance(color: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function mix(foreground: string, background: string, ratio: number) {
  const channels = (color: string) => [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const first = channels(foreground);
  const second = channels(background);
  return `#${first.map((channel, index) => Math.round(channel * ratio + second[index] * (1 - ratio)).toString(16).padStart(2, "0")).join("")}`;
}

function strongest(background: string, candidates: readonly string[]) {
  return candidates.reduce((best, candidate) => contrast(candidate, background) > contrast(best, background) ? candidate : best);
}

function strongestMinimum(backgrounds: readonly string[], candidates: readonly string[]) {
  const minimum = (candidate: string) => Math.min(...backgrounds.map((background) => contrast(candidate, background)));
  return candidates.reduce((best, candidate) => minimum(candidate) > minimum(best) ? candidate : best);
}

function hasContrastIssues(definition: ThemeDefinition) {
  const c = definition.colors;
  const minimumWindow = mix(c.window, c.shell, 0.65);
  const minimumMuted = mix(c.windowMuted, c.shell, 0.65);
  const minimumChrome = mix(c.chrome, c.shell, 0.65);
  const windowCandidates = [c.accent, c.selection, c.text, c.chromeText];
  const chromeCandidates = [c.accent, c.selection, c.chromeText, c.text];
  const accentOnWindow = strongestMinimum([c.window, minimumWindow], windowCandidates);
  const accentOnChrome = strongestMinimum([c.chrome, minimumChrome], chromeCandidates);
  const accentSurface = mix(accentOnWindow, c.window, 0.1);
  const status = strongestMinimum([c.window, minimumWindow], [c.accent, c.selection, c.text, c.chromeText]);
  const statusSurface = mix(status, c.window, 0.12);
  const readOnlySurface = mix(accentOnChrome, c.chrome, 0.12);
  const textPairs = [
    [c.text, c.window], [c.text, minimumWindow], [c.text, c.windowMuted], [c.text, minimumMuted], [c.textMuted, c.window],
    [c.textMuted, c.windowMuted], [c.text, mix(c.selection, c.window, 0.23)], [c.text, mix(c.accent, c.window, 0.13)],
    [c.chromeText, c.chrome], [c.chromeText, minimumChrome], [c.chromeText, mix(c.chromeText, c.chrome, 0.09)],
    [c.accentText, c.accent], [strongest(accentSurface, [accentOnWindow, c.text, c.chromeText]), accentSurface],
    [strongest(statusSurface, [status, c.text, c.chromeText]), statusSurface], [strongest(readOnlySurface, [accentOnChrome, c.chromeText, c.text]), readOnlySurface],
    [strongest(c.danger, [c.accentText, c.chromeText, c.text]), c.danger], [strongest(c.dangerSurface, [c.danger, c.text, c.chromeText]), c.dangerSurface],
    [c.textMuted, c.window],
  ];
  const indicatorPairs = [
    [accentOnWindow, c.window], [accentOnWindow, minimumWindow], [accentOnChrome, c.chrome], [accentOnChrome, minimumChrome],
    [strongestMinimum([c.window, minimumWindow], windowCandidates), c.window], [strongestMinimum([c.window, minimumWindow], windowCandidates), minimumWindow],
    [strongestMinimum([c.windowMuted, minimumMuted], windowCandidates), c.windowMuted], [strongestMinimum([c.windowMuted, minimumMuted], windowCandidates), minimumMuted],
    [strongestMinimum([c.chrome, minimumChrome], chromeCandidates), c.chrome], [strongestMinimum([c.chrome, minimumChrome], chromeCandidates), minimumChrome],
  ];
  return textPairs.some(([foreground, background]) => contrast(foreground, background) < 4.5)
    || indicatorPairs.some(([foreground, background]) => contrast(foreground, background) < 3);
}

export function parseThemeDefinition(value: unknown): ThemeDefinition {
  const candidate = record(value);
  exact(candidate, ["colors", "shape", "effects", "typography", "density", "motion", "iconSize", ...(candidate.treatment === undefined ? [] : ["treatment"])]);
  const colorValues = record(candidate.colors);
  exact(colorValues, COLOR_KEYS);
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => {
    const color = colorValues[key];
    if (typeof color !== "string" || !HEX_COLOR.test(color)) throw new Error("The theme contains an invalid color.");
    return [key, color.toLowerCase()];
  })) as ThemeColors;
  const shape = record(candidate.shape);
  const effects = record(candidate.effects);
  const typography = record(candidate.typography);
  exact(shape, ["radius", "borderWidth"]);
  exact(effects, ["blur", "opacity", "shadow"]);
  exact(typography, ["family", "scale", "weight"]);
  if (typography.family !== "humanist" && typography.family !== "system" && typography.family !== "mono") throw new Error("The theme contains an invalid font family.");
  let treatment: ThemeTreatment | undefined;
  if (candidate.treatment !== undefined) {
    const item = record(candidate.treatment);
    exact(item, ["gradientStrength", "gradientAngle", "texture", "textureStrength", "textureScale", "pixelated"]);
    if (!GRADIENT_ANGLES.has(item.gradientAngle as number)
      || item.texture !== "none" && item.texture !== "halftone" && item.texture !== "dither" || typeof item.pixelated !== "boolean") throw new Error("The theme contains an invalid surface treatment.");
    treatment = {
      gradientStrength: boundedNumber(item.gradientStrength, 0, 1), gradientAngle: boundedNumber(item.gradientAngle, 0, 315, true), texture: item.texture,
      textureStrength: boundedNumber(item.textureStrength, 0, 1), textureScale: boundedNumber(item.textureScale, 2, 12, true), pixelated: item.pixelated,
    };
  }
  return {
    colors,
    shape: { radius: boundedNumber(shape.radius, 0, 24), borderWidth: boundedNumber(shape.borderWidth, 0, 2) },
    effects: { blur: boundedNumber(effects.blur, 0, 30), opacity: boundedNumber(effects.opacity, 0.65, 1), shadow: boundedNumber(effects.shadow, 0, 1) },
    ...(treatment ? { treatment } : {}),
    typography: { family: typography.family, scale: boundedNumber(typography.scale, 0.85, 1.2), weight: boundedNumber(typography.weight, 400, 700, true) },
    density: boundedNumber(candidate.density, 0.8, 1.2), motion: boundedNumber(candidate.motion, 0, 1.5), iconSize: boundedNumber(candidate.iconSize, 48, 72, true),
  };
}

export function parseCustomTheme(value: unknown): CustomTheme {
  const candidate = record(value);
  exact(candidate, ["id", "name", "definition"]);
  if (typeof candidate.id !== "string" || !candidate.id || candidate.id === "." || candidate.id === ".." || new TextEncoder().encode(candidate.id).byteLength > 180
    || BUILTIN_THEME_IDS.includes(candidate.id) || candidate.id.includes("/") || candidate.id.includes("\\") || containsControl(candidate.id)) throw new Error("The custom theme has an invalid ID.");
  if (typeof candidate.name !== "string" || candidate.name.trim() !== candidate.name || !candidate.name || [...candidate.name].length > 60 || /\p{Cc}/u.test(candidate.name)) throw new Error("The custom theme has an invalid name.");
  const definition = parseThemeDefinition(candidate.definition);
  if (hasContrastIssues(definition)) throw new Error("The custom theme does not provide sufficient text contrast.");
  return { id: candidate.id, name: candidate.name, definition };
}
