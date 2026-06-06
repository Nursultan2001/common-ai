import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";

// Object storage abstraction. Default implementation writes to a local vault
// directory (gitignored). Swap these three functions for S3/R2 in production —
// callers (the document routes) don't change. Bytes handed here are ALREADY
// AES-256-GCM encrypted by lib/crypto.ts.

const VAULT_DIR = process.env.VAULT_DIR ?? join(process.cwd(), ".vault");

function pathFor(key: string) {
  return join(VAULT_DIR, key);
}

export async function putObject(key: string, bytes: Buffer): Promise<void> {
  const p = pathFor(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, bytes);
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(pathFor(key));
}

export async function deleteObject(key: string): Promise<void> {
  await unlink(pathFor(key)).catch(() => {});
}
