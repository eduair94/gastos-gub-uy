/**
 * Dependency-free `.tgz` extractor for the SICE catalog bundle. The archive is a
 * gzip'd tar of ~23 `.sql` files; we only need a handful, so we gunzip in memory
 * and walk the 512-byte tar headers rather than pull in a tar dependency (and
 * avoid relying on a `tar` binary being present on Windows).
 */
import { gunzipSync } from "zlib";

/** Read a NUL-terminated ASCII field from a tar header block. */
function readField(block: Buffer, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && block[end] !== 0) end++;
  return block.toString("ascii", offset, end).trim();
}

/**
 * Extract a gzip'd tar. Returns a map of basename → file contents (Buffer).
 * Handles standard/ustar regular-file entries; ignores directories and metadata.
 */
export function extractTgz(tgz: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(tgz);
  const files = new Map<string, Buffer>();
  let off = 0;

  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    // Two consecutive zero blocks mark the end; a single zero block is enough to stop.
    if (header.every((b) => b === 0)) break;

    const name = readField(header, 0, 100);
    const size = parseInt(readField(header, 124, 12) || "0", 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    off += 512;

    // '0' or '\0' (some archivers use a NUL byte) = regular file.
    if (name && (typeflag === "0" || typeflag === "\0" || typeflag === "")) {
      const base = name.split("/").pop() as string;
      files.set(base, tar.subarray(off, off + size));
    }
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}
