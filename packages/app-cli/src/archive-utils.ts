import { zipSync, type Zippable } from "fflate";

export const ARCHIVE_LIMITS = {
  archiveBytes: 32 * 1024 * 1024,
  entries: 512,
  entryBytes: 16 * 1024 * 1024,
  expandedBytes: 64 * 1024 * 1024,
  manifestBytes: 128 * 1024,
  compressionRatio: 200,
} as const;

export const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const DETERMINISTIC_TIMESTAMP = new Date("1980-01-01T00:00:00.000Z");

export function normalizeArchivePath(input: string) {
  const path = input.normalize("NFC");
  if (
    path.length === 0 || path.length > 1024 || path.includes("\\") || path.includes("\0") ||
    path.startsWith("/") || /^[A-Za-z]:\//.test(path) ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new TypeError(`Archive contains unsafe path: ${JSON.stringify(input)}.`);
  return path;
}

export function normalizePackageFiles(files: ReadonlyMap<string, Uint8Array>) {
  const normalized = new Map<string, Uint8Array>();
  let expandedBytes = 0;
  for (const [rawPath, bytes] of files) {
    const path = normalizeArchivePath(rawPath);
    if (normalized.has(path)) throw new TypeError(`Package contains duplicate normalized path: ${path}.`);
    if (bytes.byteLength > ARCHIVE_LIMITS.entryBytes) throw new TypeError(`Package file exceeds the size limit: ${path}.`);
    if (normalized.size >= ARCHIVE_LIMITS.entries) throw new TypeError("Package contains too many files.");
    expandedBytes += bytes.byteLength;
    if (expandedBytes > ARCHIVE_LIMITS.expandedBytes) throw new TypeError("Package exceeds the expanded size limit.");
    normalized.set(path, bytes);
  }
  return { files: normalized, expandedBytes };
}

export function decodeText(bytes: Uint8Array, label: string) {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new TypeError(`${label} must be valid UTF-8.`);
  }
}

export function parseJson(bytes: Uint8Array, label: string): unknown {
  const source = decodeText(bytes, label);
  try {
    return JSON.parse(source);
  } catch {
    throw new TypeError(`${label} must be valid JSON.`);
  }
}

export function createDeterministicZip(files: ReadonlyMap<string, Uint8Array>) {
  const archive: Zippable = {};
  for (const [path, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    archive[path] = [bytes, { level: 6, mtime: DETERMINISTIC_TIMESTAMP }];
  }
  const zipped = zipSync(archive, { level: 6, mtime: DETERMINISTIC_TIMESTAMP });
  if (zipped.byteLength > ARCHIVE_LIMITS.archiveBytes) throw new TypeError("Archive exceeds the compressed size limit.");
  return zipped;
}
