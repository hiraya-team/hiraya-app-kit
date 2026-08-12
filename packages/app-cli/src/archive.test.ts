import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  APP_MANIFEST_PATH,
  HIRAYA_SCENE_EXTENSION,
  HIRAYA_SCENE_MANIFEST_PATH,
  HIRAYA_SCENE_MIME_TYPE,
  THEME_MANIFEST_PATH,
  createSceneArchive,
  inspectAppArchive,
  inspectHirayaArchive,
  inspectSceneArchive,
  openSceneArchive,
  repackSceneArchive,
} from "./archive";
import { createAppArchive, packageApp, readAppDirectory } from "./filesystem";

const themeDefinition = {
  colors: {
    shell: "#25383d", chrome: "#141c1f", chromeText: "#f4f6f1", window: "#f2f1eb", windowMuted: "#e4e4dd",
    text: "#192229", textMuted: "#59625f", accent: "#e7b964", accentText: "#20261f", border: "#c6c9c1",
    danger: "#983c34", dangerSurface: "#f3dfdc", desktopText: "#ffffff", selection: "#96651d",
  },
  shape: { radius: 14, borderWidth: 1 }, effects: { blur: 22, opacity: 0.9, shadow: 0.55 },
  typography: { family: "humanist", scale: 1, weight: 600 }, density: 1, motion: 1, iconSize: 60,
};

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    uiRuntime: 1,
    id: "dev.hiraya.test",
    name: "Test App",
    version: "1.0.0",
    entrypoint: "index.html",
    icon: "icon.svg",
    permissions: [],
    ...overrides,
  };
}

function appFiles(overrides: Record<string, Uint8Array> = {}): Record<string, Uint8Array> {
  return {
    [APP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest())),
    "index.html": strToU8('<!doctype html><link rel="stylesheet" href="assets/app.css"><script type="module" src="assets/app.js"></script><iframe src="frame.html"></iframe>'),
    "assets/app.css": strToU8("body { color: #fff }"),
    "assets/app.js": strToU8('import "./dependency.js";'),
    "assets/dependency.js": strToU8("document.body.dataset.ready = 'true';"),
    "frame.html": strToU8("<!doctype html><title>Frame</title>"),
    "icon.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ...overrides,
  };
}

function archive(files: Record<string, Uint8Array> = appFiles()) {
  return zipSync(files, { level: 6, mtime: new Date("1980-01-01T00:00:00Z") });
}

function signatures(bytes: Uint8Array, signature: number) {
  const found: number[] = [];
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    const value = (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    if (value === signature) found.push(offset);
  }
  return found;
}

function setUint16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 255;
  bytes[offset + 1] = value >>> 8;
}

function setUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 255;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value >>> 16;
  bytes[offset + 3] = value >>> 24;
}

describe("Hiraya app archives", () => {
  test("validates a complete archive and computes a stable SHA-256 digest", async () => {
    const bytes = archive();
    const first = await inspectAppArchive(bytes);
    const second = await inspectAppArchive(bytes);
    expect(first.manifest).toEqual(manifest() as typeof first.manifest);
    expect(first.entryCount).toBe(7);
    expect(first.expandedBytes).toBeGreaterThan(0);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.digest).toBe(first.digest);
  });

  test("creates byte-for-byte deterministic sorted archives", () => {
    const files = new Map(Object.entries(appFiles()).reverse());
    const first = createAppArchive(files);
    const second = createAppArchive(files);
    expect(second).toEqual(first);
    const names = signatures(first, 0x02014b50).map((offset) => {
      const length = first[offset + 28] | (first[offset + 29] << 8);
      return new TextDecoder().decode(first.subarray(offset + 46, offset + 46 + length));
    });
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right, "en")));
  });

  test("rejects traversal, absolute, backslash, and duplicate normalized paths", async () => {
    for (const path of ["../escape", "/absolute", "C:/absolute", "folder\\file"]) {
      await expect(inspectAppArchive(archive({ ...appFiles(), [path]: strToU8("bad") }))).rejects.toThrow("unsafe path");
    }
    await expect(inspectAppArchive(archive({ ...appFiles(), "caf\u00e9.txt": strToU8("one"), "cafe\u0301.txt": strToU8("two") }))).rejects.toThrow("duplicate normalized path");
  });

  test("rejects missing or malformed manifests, entrypoints, and icons", async () => {
    const { [APP_MANIFEST_PATH]: _manifest, ...withoutManifest } = appFiles();
    void _manifest;
    await expect(inspectAppArchive(archive(withoutManifest))).rejects.toThrow(APP_MANIFEST_PATH);
    await expect(inspectAppArchive(archive({ ...appFiles(), [APP_MANIFEST_PATH]: strToU8("{") }))).rejects.toThrow("valid JSON");
    await expect(inspectAppArchive(archive({ ...appFiles(), [APP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest({ entrypoint: "missing.html" }))) }))).rejects.toThrow("entrypoint is missing");
    await expect(inspectAppArchive(archive({ ...appFiles(), [APP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest({ icon: "missing.svg" }))) }))).rejects.toThrow("icon is missing");
    await expect(inspectAppArchive(archive({ ...appFiles(), [APP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest({ extra: true }))) }))).rejects.toThrow("unsupported shape");
  });

  test("rejects v1 manifests and unsupported UI runtimes", async () => {
    await expect(inspectAppArchive(archive({ ...appFiles(), [APP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest({ schemaVersion: 1 }))) }))).rejects.toThrow("schema version");
    await expect(inspectAppArchive(archive({ ...appFiles(), [APP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest({ uiRuntime: 2 }))) }))).rejects.toThrow("UI runtime");
  });

  test("rejects remote scripts, styles, modules, import maps, and frames", async () => {
    const htmlCases = [
      '<script src="https://evil.example/app.js"></script>',
      '<link rel="stylesheet" href="//evil.example/app.css">',
      '<script type="module">import "https://evil.example/app.js"</script>',
      '<script type="importmap">{"imports":{"bad":"https://evil.example/app.js"}}</script>',
      '<iframe src="https://evil.example/"></iframe>',
      '<iframe srcdoc="&lt;script src=&quot;https://evil.example/app.js&quot;&gt;&lt;/script&gt;"></iframe>',
      '<style>@import url("https://evil.example/app.css");</style>',
      '<div style="background: url(https://evil.example/image.png)"></div>',
      '<link rel="preload" as="script" href="https://evil.example/app.js">',
      '<img src="https://evil.example/pixel?secret=static">',
      '<a href="https://evil.example/leave">Leave</a>',
      '<form action="https://evil.example/submit"><button>Submit</button></form>',
      '<button formaction="https://evil.example/submit">Submit</button>',
      '<img srcset="https://evil.example/pixel 2x">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example/leave">',
    ];
    for (const html of htmlCases) {
      await expect(inspectAppArchive(archive({ ...appFiles(), "index.html": strToU8(html) }))).rejects.toThrow("remote reference");
    }
    await expect(inspectAppArchive(archive({ ...appFiles(), "assets/app.js": strToU8('export { x } from "https://evil.example/x.js"') }))).rejects.toThrow("remote reference");
    await expect(inspectAppArchive(archive({ ...appFiles(), "assets/app.css": strToU8("body { background: url(https://evil.example/x) }") }))).rejects.toThrow("remote reference");
    await expect(inspectAppArchive(archive({ ...appFiles(), "index.html": strToU8('<base href="https://evil.example/"><script src="assets/app.js"></script>') }))).rejects.toThrow("base URL");
  });

  test("rejects missing local HTML dependencies", async () => {
    await expect(inspectAppArchive(archive({ ...appFiles(), "index.html": strToU8('<script type="module" src="missing.js"></script>') }))).rejects.toThrow("missing package file");
    await expect(inspectAppArchive(archive({ ...appFiles(), "assets/app.js": strToU8('import "./missing.js"') }))).rejects.toThrow("missing package file");
    await expect(inspectAppArchive(archive({ ...appFiles(), "assets/app.js": strToU8('import("./missing.js")') }))).rejects.toThrow("missing package file");
  });

  test("ignores module syntax inside JavaScript strings", async () => {
    const bytes = archive({ ...appFiles(), "assets/app.js": strToU8('const tags = "import export from"; const example = \'import {name} from "${module}"\'; const fragment = "url(#preview)"; const data = "data:image/svg+xml,x";') });
    await expect(inspectAppArchive(bytes)).resolves.toMatchObject({ manifest: { id: "dev.hiraya.test" } });
  });

  test("accepts classic scripts without parsing them as modules", async () => {
    const bytes = archive({ ...appFiles(), "index.html": strToU8('<script src="assets/app.js"></script>'), "assets/app.js": strToU8("with ({ ready: true }) document.body.dataset.ready = String(ready);") });
    await expect(inspectAppArchive(bytes)).resolves.toMatchObject({ manifest: { id: "dev.hiraya.test" } });
  });

  test("validates nested dependencies and rejects reachable cycles with their chain", async () => {
    await expect(inspectAppArchive(archive({
      ...appFiles(),
      "assets/app.js": strToU8('import "./nested.js?cache=1#module";'),
      "assets/nested.js": strToU8('import "./missing.js";'),
    }))).rejects.toThrow("Module assets/nested.js references missing package file: assets/missing.js");

    await expect(inspectAppArchive(archive({
      ...appFiles(),
      "assets/app.css": strToU8('@import "./theme.css"; body { mask: url("#preview"); background: url("data:image/svg+xml,x") }'),
      "assets/theme.css": strToU8('@import "./app.css";'),
    }))).rejects.toThrow("assets/app.css -> assets/theme.css -> assets/app.css");
  });

  test("rejects oversized metadata, excessive compression ratios, entry counts, and symlinks", async () => {
    const oversized = archive();
    const central = signatures(oversized, 0x02014b50)[0];
    setUint32(oversized, central + 24, 16 * 1024 * 1024 + 1);
    await expect(inspectAppArchive(oversized)).rejects.toThrow("size limit");

    await expect(inspectAppArchive(archive({ ...appFiles(), "bomb.txt": new Uint8Array(4096) }))).rejects.toThrow("compression ratio");

    const many: Record<string, Uint8Array> = appFiles();
    for (let index = 0; index < 506; index += 1) many[`files/${index}.txt`] = strToU8("x");
    await expect(inspectAppArchive(archive(many))).rejects.toThrow("too many entries");

    const linked = archive();
    const linkedCentral = signatures(linked, 0x02014b50)[0];
    setUint16(linked, linkedCentral + 4, 3 << 8);
    setUint32(linked, linkedCentral + 38, 0xa000 << 16);
    await expect(inspectAppArchive(linked)).rejects.toThrow("symbolic links");
  });

  test("rejects mismatched local paths", async () => {
    const bytes = archive();
    const local = signatures(bytes, 0x04034b50)[0];
    bytes[local + 30] ^= 1;
    await expect(inspectAppArchive(bytes)).rejects.toThrow("paths do not match");
  });
});

describe("Hiraya theme archives", () => {
  const themeManifest = {
    schemaVersion: 1,
    id: "dev.hiraya.aurora",
    name: "Aurora",
    definition: themeDefinition,
    wallpaper: { kind: "scene", entrypoint: "wallpaper.html", dim: 0.08, overlayColor: "#10aBcF", overlayOpacity: 0.08 },
  };

  test("classifies and validates a sandboxed scene package", async () => {
    const inspection = await inspectHirayaArchive(archive({ [THEME_MANIFEST_PATH]: strToU8(JSON.stringify(themeManifest)), "wallpaper.html": strToU8('<!doctype html><style>body{background:url("glow.webp")}</style>'), "glow.webp": strToU8("image") }));
    if (inspection.kind !== "theme") throw new Error("Expected a theme inspection.");
    expect(inspection.manifest.id).toBe(themeManifest.id);
    expect(inspection.manifest.wallpaper?.overlayColor).toBe("#10ABCF");
    await expect(inspectAppArchive(archive({ [THEME_MANIFEST_PATH]: strToU8(JSON.stringify(themeManifest)), "wallpaper.html": strToU8("<!doctype html>") }))).rejects.toThrow("theme, not an app");
  });

  test("rejects ambiguous packages and remote scene references", async () => {
    await expect(inspectHirayaArchive(archive({ ...appFiles(), [THEME_MANIFEST_PATH]: strToU8(JSON.stringify(themeManifest)) }))).rejects.toThrow("exactly one");
    await expect(inspectHirayaArchive(archive({ [THEME_MANIFEST_PATH]: strToU8(JSON.stringify(themeManifest)), "wallpaper.html": strToU8('<script src="https://evil.example/scene.js"></script>') }))).rejects.toThrow("remote reference");
  });

  test("requires a string wallpaper entrypoint", async () => {
    await expect(inspectHirayaArchive(archive({
      [THEME_MANIFEST_PATH]: strToU8(JSON.stringify({ ...themeManifest, wallpaper: { kind: "static", entrypoint: 42 } })),
      "42": strToU8("image"),
    }))).rejects.toThrow("entrypoint is invalid");
  });
});

describe("Hiraya Scene archives", () => {
  function sceneFiles(manifest: string = JSON.stringify({ schemaVersion: 1, entrypoint: "scene/index.html" })) {
    return new Map<string, Uint8Array>([
      [HIRAYA_SCENE_MANIFEST_PATH, strToU8(manifest)],
      ["scene/index.html", strToU8('<!doctype html><link rel="stylesheet" href="style.css"><script type="module" src="main.js"></script><img src="../media/sky.webp">')],
      ["scene/style.css", strToU8('body { background: url("../media/sky.webp") }')],
      ["scene/main.js", strToU8('import "./motion.js"; document.body.dataset.ready = "true";')],
      ["scene/motion.js", strToU8("export const motion = true;")],
      ["media/sky.webp", strToU8("image")],
    ]);
  }

  test("exposes the format and strictly inspects a valid multi-file package", async () => {
    expect(HIRAYA_SCENE_EXTENSION).toBe(".hiraya.scene");
    expect(HIRAYA_SCENE_MIME_TYPE).toBe("application/vnd.hiraya.scene+zip");
    const inspection = await inspectSceneArchive(createSceneArchive(sceneFiles()));
    expect(inspection).toMatchObject({ kind: "scene", manifest: { schemaVersion: 1, entrypoint: "scene/index.html" }, entryCount: 6 });
    expect((await inspectHirayaArchive(createSceneArchive(sceneFiles()))).kind).toBe("scene");
  });

  test("requires exactly one root manifest kind", async () => {
    const scene = sceneFiles();
    scene.set(APP_MANIFEST_PATH, strToU8(JSON.stringify(manifest())));
    expect(() => createSceneArchive(scene)).toThrow("exactly one");
    await expect(inspectHirayaArchive(archive({
      [HIRAYA_SCENE_MANIFEST_PATH]: strToU8('{"schemaVersion":1,"entrypoint":"index.html"}'),
      [THEME_MANIFEST_PATH]: strToU8("{}"),
      "index.html": strToU8("<!doctype html>"),
    }))).rejects.toThrow("exactly one");
  });

  test("keeps malformed drafts editable while strict inspection rejects them", async () => {
    const bytes = createSceneArchive(sceneFiles('{"schemaVersion":1,"entrypoint":'));
    const draft = await openSceneArchive(bytes);
    expect(draft.manifestSource).toBe('{"schemaVersion":1,"entrypoint":');
    expect(draft.manifest).toBeUndefined();
    expect(draft.manifestError).toBeTruthy();
    await expect(inspectSceneArchive(bytes)).rejects.toThrow("valid JSON");
  });

  test("rejects unsafe archives and unsafe executable resources", async () => {
    await expect(openSceneArchive(archive({ ...Object.fromEntries(sceneFiles()), "../escape": strToU8("bad") }))).rejects.toThrow("unsafe path");
    for (const [path, source, message] of [
      ["scene/index.html", '<a href="https://evil.example/">leave</a>', "remote reference"],
      ["scene/index.html", '<script type="module" src="missing.js"></script>', "missing package file"],
      ["scene/main.js", 'import "./missing.js"', "missing package file"],
      ["scene/main.js", "import {", "invalid JavaScript"],
    ] as const) {
      const files = sceneFiles();
      files.set(path, strToU8(source));
      await expect(inspectSceneArchive(createSceneArchive(files))).rejects.toThrow(message);
    }
  });

  test("creates and repacks byte-for-byte deterministically", async () => {
    const files = new Map([...sceneFiles()].reverse());
    const created = createSceneArchive(files);
    expect(createSceneArchive(files)).toEqual(created);
    expect(repackSceneArchive(await openSceneArchive(created))).toEqual(created);
  });
});

describe("app package filesystem", () => {
  test("packages a directory and rejects filesystem symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "hiraya-app-"));
    const output = join(root, "..", `test-${crypto.randomUUID()}.hiraya.app`);
    try {
      await mkdir(join(root, "assets"));
      for (const [path, bytes] of Object.entries(appFiles())) {
        const target = join(root, path);
        if (path.includes("/")) await mkdir(join(target, ".."), { recursive: true });
        await writeFile(target, bytes);
      }
      const packaged = await packageApp(root, output);
      if (packaged.inspection.kind !== "app") throw new Error("Expected an app inspection.");
      expect(packaged.inspection.manifest.id).toBe("dev.hiraya.test");
      expect((await readFile(output)).byteLength).toBe(packaged.inspection.compressedBytes);

      await symlink(join(root, "index.html"), join(root, "linked.html"));
      await expect(readAppDirectory(root)).rejects.toThrow("symbolic links");
    } finally {
      await Promise.all([rm(root, { recursive: true, force: true }), rm(output, { force: true })]);
    }
  });
});
