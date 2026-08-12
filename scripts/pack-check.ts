import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const temporary = await mkdtemp(join(tmpdir(), "hiraya-app-kit-pack-"));
try {
  const tarballs = join(temporary, "tarballs");
  await mkdir(tarballs);

  const packages = ["apps-contracts", "apps-sdk", "app-cli"] as const;
  const archives = new Map<string, string>();
  const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version as string;

async function run(command: string[], cwd = root) {
  const process = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  const exitCode = await process.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}.`);
}

async function textFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await textFiles(path));
    else if (/\.(?:js|mjs|cjs|ts|json|md)$/.test(entry.name)) found.push(path);
  }
  return found;
}

for (const name of packages) {
  const manifest = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8"));
  if (manifest.version !== version) throw new Error(`${name} version must match the root version ${version}.`);
  const existingTarballs = new Set(await readdir(tarballs));
  await run(["bun", "pm", "pack", "--destination", tarballs, "--quiet"], join(root, "packages", name));
  const packedTarballs = (await readdir(tarballs)).filter((filename) => filename.endsWith(".tgz") && !existingTarballs.has(filename));
  if (packedTarballs.length !== 1) throw new Error(`${name} pack created ${packedTarballs.length} tarballs; expected one.`);
  const archive = join(tarballs, packedTarballs[0]);
  archives.set(name, archive);
  const extracted = join(temporary, `unpacked-${name}`);
  await mkdir(extracted);
  await run(["tar", "-xzf", archive, "-C", extracted]);
  for (const path of await textFiles(extracted)) {
    const content = await readFile(path, "utf8");
    if (/workspace:|["']file:|clients\/web|(?:\.\.\/)+src\/(?:lib\/themes|domain\/theme)/.test(content)) throw new Error(`Forbidden source reference in ${path}.`);
  }
}

const packedDependencies = Object.fromEntries(packages.map((name) => [`@hiraya-team/${name}`, archives.get(name)!]));

const cliArchiveSource = await readFile(join(temporary, "unpacked-app-cli", "package", "dist", "archive.js"), "utf8");
if (/node:(?:fs|path|url|os)/.test(cliArchiveSource)) throw new Error("The app-cli root export imports Node filesystem modules.");

const consumer = join(temporary, "consumer");
await mkdir(consumer);
await writeFile(join(consumer, "package.json"), JSON.stringify({
  name: "hiraya-pack-consumer",
  private: true,
  type: "module",
  dependencies: packedDependencies,
  overrides: packedDependencies,
}, null, 2));
await writeFile(join(consumer, "imports.ts"), `
import { parseManifestV2 } from "@hiraya-team/apps-contracts";
import { parseCustomTheme } from "@hiraya-team/apps-contracts/theme";
import { HIRAYA_SCENE_MIME_TYPE, parseSceneManifestV1 } from "@hiraya-team/apps-contracts/scene";
import { connectHiraya } from "@hiraya-team/apps-sdk";
import { APP_MANIFEST_PATH, createSceneArchive, inspectAppArchive, inspectSceneArchive, openSceneArchive, repackSceneArchive } from "@hiraya-team/app-cli";
if (typeof parseManifestV2 !== "function" || typeof parseCustomTheme !== "function" || typeof parseSceneManifestV1 !== "function" || HIRAYA_SCENE_MIME_TYPE !== "application/vnd.hiraya.scene+zip" || typeof connectHiraya !== "function" || typeof inspectAppArchive !== "function" || typeof inspectSceneArchive !== "function" || typeof openSceneArchive !== "function" || typeof createSceneArchive !== "function" || typeof repackSceneArchive !== "function" || APP_MANIFEST_PATH !== "hiraya.app.json") throw new Error("Published exports are incomplete.");
`);
await run(["bun", "install"], consumer);
await run(["bun", "imports.ts"], consumer);

const bin = join(consumer, "node_modules", ".bin", "hiraya-app");
const app = join(consumer, "sample-app");
await run([bin, "init", app, "com.example.sample"], consumer);
const appPackagePath = join(app, "package.json");
const appPackage = JSON.parse(await readFile(appPackagePath, "utf8"));
if (appPackage.dependencies["@hiraya-team/apps-sdk"] !== version || appPackage.devDependencies["@hiraya-team/app-cli"] !== version) {
  throw new Error(`Generated starter must pin app-kit ${version}.`);
}
appPackage.dependencies["@hiraya-team/apps-sdk"] = archives.get("apps-sdk");
appPackage.devDependencies["@hiraya-team/app-cli"] = archives.get("app-cli");
appPackage.overrides = packedDependencies;
await writeFile(appPackagePath, `${JSON.stringify(appPackage, null, 2)}\n`);
await run(["bun", "install"], app);
await run(["bun", "run", "build"], app);
const appArchive = join(consumer, "sample.hiraya.app");
await run([bin, "package", join(app, "dist"), appArchive], consumer);
await run([bin, "validate", appArchive], consumer);

const theme = join(consumer, "sample-theme");
await mkdir(theme);
const definition = {
  colors: {
    shell: "#25383d", chrome: "#141c1f", chromeText: "#f4f6f1", window: "#f2f1eb", windowMuted: "#e4e4dd", text: "#192229", textMuted: "#59625f",
    accent: "#e7b964", accentText: "#20261f", border: "#c6c9c1", danger: "#983c34", dangerSurface: "#f3dfdc", desktopText: "#ffffff", selection: "#96651d",
  },
  shape: { radius: 14, borderWidth: 1 }, effects: { blur: 22, opacity: 0.9, shadow: 0.55 }, typography: { family: "humanist", scale: 1, weight: 600 }, density: 1, motion: 1, iconSize: 60,
};
await writeFile(join(theme, "hiraya.theme.json"), JSON.stringify({ schemaVersion: 1, id: "com.example.theme", name: "Example", definition, wallpaper: { kind: "static", entrypoint: "wallpaper.png" } }));
await writeFile(join(theme, "wallpaper.png"), "not-decoded-by-packager");
const themeArchive = join(consumer, "sample-theme.hiraya.app");
await run([bin, "package", theme, themeArchive], consumer);
await run([bin, "validate", themeArchive], consumer);

console.log("Pack check passed.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
