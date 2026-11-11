/**
 * Authenticated AES-GCM-256 secret encryption for server-side `connection_secrets`.
 * Uses Web Crypto API (`crypto.subtle`) so secrets remain encrypted at rest without
 * requiring Supabase Vault in the web-first phase.
 */

const EPHEMERAL_DEV_KEY_BYTES = crypto.getRandomValues(new Uint8Array(32));

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(rawSecret: string | undefined, allowEphemeralDevKey: boolean): Promise<CryptoKey> {
  let keyMaterial: ArrayBuffer;
  if (rawSecret && rawSecret.trim().length > 0) {
    const encoded = new TextEncoder().encode(rawSecret.trim());
    keyMaterial = await crypto.subtle.digest("SHA-256", encoded);
  } else if (allowEphemeralDevKey) {
    keyMaterial = EPHEMERAL_DEV_KEY_BYTES.buffer.slice(0);
  } else {
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY environment secret is required to store or decrypt connector tokens."
    );
  }

  return await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptConnectionSecret(
  plaintext: string,
  encryptionSecret: string | undefined,
  options: { allowEphemeralDevKey?: boolean } = {}
): Promise<string> {
  const key = await deriveAesKey(encryptionSecret, Boolean(options.allowEphemeralDevKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return `v1:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptConnectionSecret(
  ciphertext: string,
  encryptionSecret: string | undefined,
  options: { allowEphemeralDevKey?: boolean } = {}
): Promise<string> {
  const parts = ciphertext.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported encrypted connection secret format.");
  }
  const key = await deriveAesKey(encryptionSecret, Boolean(options.allowEphemeralDevKey));
  const ivBytes = fromBase64Url(parts[1]!);
  const cipherBytes = fromBase64Url(parts[2]!);
  const ivBuffer = ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength) as ArrayBuffer;
  const cipherBuffer = cipherBytes.buffer.slice(
    cipherBytes.byteOffset,
    cipherBytes.byteOffset + cipherBytes.byteLength
  ) as ArrayBuffer;

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    cipherBuffer
  );
  return new TextDecoder().decode(decrypted);
}
