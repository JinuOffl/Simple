import { assertEquals } from "jsr:@std/assert@1";
import {
  handleBillingWebhook,
  type BillingDb,
  type EntitlementDbRecord,
} from "../billing-webhook/handler.ts";
import {
  handleManageByok,
  type ByokDb,
  type ByokSecretRecord,
  maskApiKey,
} from "../manage-byok/handler.ts";

function createMockBillingDb(): BillingDb & { getRecord(): EntitlementDbRecord; getLedger(): unknown[] } {
  let record: EntitlementDbRecord = {
    user_id: "user-test-777",
    plan: "free",
    active_app_limit: 3,
    monthly_credit_limit: 100,
    credits_used: 10,
    period_start: new Date().toISOString(),
    provider: null,
    provider_ref: null,
    updated_at: new Date().toISOString(),
  };

  const ledger: unknown[] = [];

  return {
    async getUser(userId: string) {
      return userId === record.user_id ? { id: userId, email: "test@simple.test" } : null;
    },

    async getEntitlement(userId: string) {
      return userId === record.user_id ? record : null;
    },

    async updateEntitlement(userId: string, patch: Partial<EntitlementDbRecord>) {
      record = { ...record, ...patch, user_id: userId, updated_at: new Date().toISOString() };
      return record;
    },

    async enforceActiveLimit(_userId: string) {
      const excess = Math.max(0, 5 - record.active_app_limit);
      return { slept_count: excess, active_count: Math.min(5, record.active_app_limit) };
    },

    async recordLedger(entry) {
      ledger.push(entry);
    },

    getRecord() {
      return record;
    },

    getLedger() {
      return ledger;
    },
  };
}

function createMockByokDb(): ByokDb & { getSecret(): ByokSecretRecord | null } {
  let storedSecret: ByokSecretRecord | null = null;

  return {
    async getByok(userId: string) {
      return storedSecret && storedSecret.user_id === userId ? storedSecret : null;
    },

    async setByok(record) {
      storedSecret = {
        ...record,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },

    async deleteByok(userId: string) {
      if (storedSecret && storedSecret.user_id === userId) {
        storedSecret = null;
        return true;
      }
      return false;
    },

    getSecret() {
      return storedSecret;
    },
  };
}

Deno.test("billing-webhook Edge Function: secret verification, plan upgrade/downgrade, and credits grant", async () => {
  const db = createMockBillingDb();
  const getEnv = (key: string) => {
    if (key === "BILLING_WEBHOOK_SECRET") return "super-secret-webhook-key";
    return undefined;
  };

  // 1. Unauthorized request rejected with 401
  const unauthReq = new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "subscription.updated",
      user_id: "user-test-777",
      plan: "pro",
    }),
  });
  const unauthRes = await handleBillingWebhook(unauthReq, { db, getEnv });
  assertEquals(unauthRes.status, 401);

  // 2. Authorized plan upgrade to 'pro'
  const upgradeProReq = new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "super-secret-webhook-key",
    },
    body: JSON.stringify({
      event: "subscription.updated",
      user_id: "user-test-777",
      plan: "pro",
      provider: "stripe",
      provider_ref: "sub_123456",
    }),
  });
  const upgradeProRes = await handleBillingWebhook(upgradeProReq, { db, getEnv });
  assertEquals(upgradeProRes.status, 200);
  const proData = await upgradeProRes.json();
  assertEquals(proData.success, true);
  assertEquals(proData.entitlement.plan, "pro");
  assertEquals(proData.entitlement.active_app_limit, 25);
  assertEquals(proData.entitlement.monthly_credit_limit, 2000);
  assertEquals(db.getRecord().plan, "pro");

  // 3. Authorized plan upgrade to 'group'
  const upgradeGroupReq = new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "super-secret-webhook-key",
    },
    body: JSON.stringify({
      event: "subscription.updated",
      user_id: "user-test-777",
      plan: "group",
      provider: "revenuecat",
      provider_ref: "rc_grp_999",
    }),
  });
  const upgradeGroupRes = await handleBillingWebhook(upgradeGroupReq, { db, getEnv });
  assertEquals(upgradeGroupRes.status, 200);
  const groupData = await upgradeGroupRes.json();
  assertEquals(groupData.entitlement.plan, "group");
  assertEquals(groupData.entitlement.active_app_limit, 50);
  assertEquals(groupData.entitlement.monthly_credit_limit, 5000);

  // 4. Authorized cancellation downgrades to 'free' and triggers enforceActiveLimit
  const cancelReq = new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "super-secret-webhook-key",
    },
    body: JSON.stringify({
      event: "subscription.canceled",
      user_id: "user-test-777",
    }),
  });
  const cancelRes = await handleBillingWebhook(cancelReq, { db, getEnv });
  assertEquals(cancelRes.status, 200);
  const cancelData = await cancelRes.json();
  assertEquals(cancelData.entitlement.plan, "free");
  assertEquals(cancelData.entitlement.active_app_limit, 3);
  assertEquals(cancelData.entitlement.monthly_credit_limit, 100);
  assertEquals(cancelData.slept_excess_apps, 2);

  // 5. Grant bonus credits
  const grantReq = new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "super-secret-webhook-key",
    },
    body: JSON.stringify({
      event: "credits.grant",
      user_id: "user-test-777",
      credits: 250,
    }),
  });
  const grantRes = await handleBillingWebhook(grantReq, { db, getEnv });
  assertEquals(grantRes.status, 200);
  const grantData = await grantRes.json();
  assertEquals(grantData.granted_credits, 250);
  assertEquals(grantData.entitlement.monthly_credit_limit, 350);
});

Deno.test("manage-byok Edge Function: set, get without leaking plaintext, and delete", async () => {
  const db = createMockByokDb();
  const getEnv = (key: string) => {
    if (key === "BYOK_LOCAL_DEV_OPEN") return "true";
    if (key === "CONNECTION_ENCRYPTION_KEY") return "test-aes-key-for-byok-test-suite-32b";
    return undefined;
  };

  const testUserId = "user-byok-111";
  const verifyJwt = async () => ({ userId: testUserId });

  // 1. Initial state: no key
  const getEmptyReq = new Request("http://localhost/manage-byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "get" }),
  });
  const getEmptyRes = await handleManageByok(getEmptyReq, { db, getEnv, verifyJwt });
  assertEquals(getEmptyRes.status, 200);
  const emptyData = await getEmptyRes.json();
  assertEquals(emptyData.has_byok, false);

  // 2. Set key
  const rawKey = "gsk_abc123def456xyz789";
  const setReq = new Request("http://localhost/manage-byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      op: "set",
      apiKey: rawKey,
      provider: "groq",
    }),
  });
  const setRes = await handleManageByok(setReq, { db, getEnv, verifyJwt });
  assertEquals(setRes.status, 200);
  const setData = await setRes.json();
  assertEquals(setData.success, true);
  assertEquals(setData.has_byok, true);
  assertEquals(setData.preview, maskApiKey(rawKey));

  // Verify DB record does NOT store plaintext
  const stored = db.getSecret();
  assertEquals(Boolean(stored), true);
  assertEquals(stored?.encrypted_secret.startsWith("v1:"), true);
  assertEquals(stored?.encrypted_secret.includes(rawKey), false);

  // 3. Get key (returns preview and provider, never plaintext key)
  const getReq = new Request("http://localhost/manage-byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "get" }),
  });
  const getRes = await handleManageByok(getReq, { db, getEnv, verifyJwt });
  assertEquals(getRes.status, 200);
  const getData = await getRes.json();
  assertEquals(getData.has_byok, true);
  assertEquals(getData.preview, maskApiKey(rawKey));
  assertEquals(getData.provider, "groq");
  assertEquals(Boolean(getData.apiKey), false);

  // 4. Delete key
  const deleteReq = new Request("http://localhost/manage-byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "delete" }),
  });
  const deleteRes = await handleManageByok(deleteReq, { db, getEnv, verifyJwt });
  assertEquals(deleteRes.status, 200);
  const deleteData = await deleteRes.json();
  assertEquals(deleteData.has_byok, false);

  // Verify DB row deleted
  assertEquals(db.getSecret(), null);
});

