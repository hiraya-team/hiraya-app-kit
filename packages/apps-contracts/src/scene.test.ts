import { describe, expect, test } from "bun:test";
import { HIRAYA_SCENE_EXTENSION, HIRAYA_SCENE_MANIFEST_PATH, HIRAYA_SCENE_MIME_TYPE, parseSceneManifestV1 } from "./scene";

describe("Hiraya Scene contract", () => {
  test("defines the portable package and exact manifest shape", () => {
    expect(HIRAYA_SCENE_EXTENSION).toBe(".hiraya.scene");
    expect(HIRAYA_SCENE_MIME_TYPE).toBe("application/vnd.hiraya.scene+zip");
    expect(HIRAYA_SCENE_MANIFEST_PATH).toBe("hiraya.scene.json");
    expect(parseSceneManifestV1({ schemaVersion: 1, entrypoint: "scene/index.html" })).toEqual({ schemaVersion: 1, entrypoint: "scene/index.html" });
    for (const value of [
      { schemaVersion: 1, entrypoint: "index.html", id: "scene" },
      { schemaVersion: 1, entrypoint: "index.html", version: "1.0.0" },
      { schemaVersion: 1, entrypoint: "index.html", permissions: [] },
      { schemaVersion: 2, entrypoint: "index.html" },
      { schemaVersion: 1, entrypoint: "../index.html" },
      { schemaVersion: 1, entrypoint: "index.js" },
    ]) expect(() => parseSceneManifestV1(value)).toThrow();
  });
});
