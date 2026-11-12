import { decryptConnectionSecret } from "./secretCrypto.ts";

export interface UserByokKeyResult {
  hasByok: boolean;
  apiKey?: string;
  provider?: string;
}

export async function fetchUserByokKey(options: {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  userId?: string;
  encryptionSecret?: string;
  allowEphemeral?: boolean;
  fetchFn?: typeof fetch;
}): Promise<UserByokKeyResult> {
  const {
    supabaseUrl,
    serviceRoleKey,
    userId,
    encryptionSecret,
    allowEphemeral = true,
    fetchFn = fetch,
  } = options;

  if (!supabaseUrl || !serviceRoleKey || !userId || userId === "local-dev-user") {
    return { hasByok: false };
  }

  try {
    const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/byok_secrets?user_id=eq.${encodeURIComponent(userId)}&select=encrypted_secret,provider`;
    const res = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!res.ok) {
      await res.body?.cancel();
      return { hasByok: false };
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0]?.encrypted_secret) {
      return { hasByok: false };
    }

    const row = rows[0] as { encrypted_secret: string; provider?: string };
    const decrypted = await decryptConnectionSecret(row.encrypted_secret, encryptionSecret, {
      allowEphemeralDevKey: allowEphemeral,
    });

    return {
      hasByok: true,
      apiKey: decrypted,
      provider: row.provider ?? "groq",
    };
  } catch {
    return { hasByok: false };
  }
}

