import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// AES-256-GCM document encryption for the vault.
// Key is a 32-byte base64 value in DOC_ENCRYPTION_KEY.

function getKey(): Buffer {
  const raw = process.env.DOC_ENCRYPTION_KEY;
  if (!raw) throw new Error("DOC_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DOC_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export interface EncryptedBlob {
  ciphertext: Buffer;
  iv: string; // base64
  authTag: string; // base64
}

export function encryptBytes(plain: Buffer): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptBytes(
  ciphertext: Buffer,
  ivB64: string,
  authTagB64: string
): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
