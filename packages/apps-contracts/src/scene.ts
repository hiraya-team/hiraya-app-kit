export const HIRAYA_SCENE_EXTENSION = ".hiraya.scene";
export const HIRAYA_SCENE_MIME_TYPE = "application/vnd.hiraya.scene+zip";
export const HIRAYA_SCENE_MANIFEST_PATH = "hiraya.scene.json";

export interface HirayaSceneManifestV1 {
  schemaVersion: 1;
  entrypoint: string;
}

export function parseSceneManifestV1(value: unknown): HirayaSceneManifestV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Scene manifest must be an object.");
  const manifest = value as Record<string, unknown>;
  if (Object.keys(manifest).length !== 2 || !("schemaVersion" in manifest) || !("entrypoint" in manifest)) throw new TypeError("Scene manifest has an unsupported shape.");
  if (manifest.schemaVersion !== 1) throw new TypeError("Scene manifest schema version is unsupported.");
  if (typeof manifest.entrypoint !== "string" || manifest.entrypoint.length === 0 || manifest.entrypoint.length > 1024
    || manifest.entrypoint.startsWith("/") || /^[A-Za-z]:\//.test(manifest.entrypoint) || manifest.entrypoint.includes("\\")
    || [...manifest.entrypoint].some((character) => (character.codePointAt(0) ?? 0) < 32 || character.codePointAt(0) === 127)
    || manifest.entrypoint.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    || !/\.html?$/i.test(manifest.entrypoint)) throw new TypeError("Scene entrypoint must be a relative HTML path.");
  return { schemaVersion: 1, entrypoint: manifest.entrypoint };
}
