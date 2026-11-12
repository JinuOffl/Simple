import { assertEquals } from "jsr:@std/assert@1";
import {
  handleInvites,
  type AppInviteRecord,
  type AppMemberRecord,
  type InvitesDb,
} from "../invites/handler.ts";

function createMockInvitesDb(): InvitesDb & { getIsShared(): boolean } {
  const app = {
    id: "app-123",
    user_id: "user-owner",
    name: "Shared Habit Tracker",
    icon: "✅",
    description: "Track habits together",
  };

  const invites: AppInviteRecord[] = [];
  const members: AppMemberRecord[] = [
    {
      id: "mem-owner",
      app_id: "app-123",
      user_id: "user-owner",
      role: "owner",
      created_at: new Date().toISOString(),
    },
  ];

  let isShared = false;

  return {
    async getApp(appId: string) {
      return appId === app.id ? app : null;
    },

    async getInviteByCode(code: string) {
      return invites.find((i) => i.code === code) ?? null;
    },

    async createInvite(input) {
      const rec: AppInviteRecord = {
        id: `inv-${invites.length + 1}`,
        app_id: input.app_id,
        code: input.code,
        role: input.role,
        created_by: input.created_by,
        max_uses: input.max_uses,
        uses: 0,
        expires_at: input.expires_at ?? null,
        created_at: new Date().toISOString(),
      };
      invites.push(rec);
      return rec;
    },

    async incrementInviteUses(inviteId: string) {
      const inv = invites.find((i) => i.id === inviteId);
      if (inv) inv.uses += 1;
    },

    async getMember(appId: string, userId: string) {
      return members.find((m) => m.app_id === appId && m.user_id === userId) ?? null;
    },

    async addMember(appId: string, userId: string, role: "editor" | "viewer") {
      const rec: AppMemberRecord = {
        id: `mem-${members.length + 1}`,
        app_id: appId,
        user_id: userId,
        role,
        created_at: new Date().toISOString(),
      };
      members.push(rec);
      return rec;
    },

    async removeMember(appId: string, userId: string) {
      const idx = members.findIndex((m) => m.app_id === appId && m.user_id === userId);
      if (idx !== -1) {
        members.splice(idx, 1);
        return true;
      }
      return false;
    },

    async listMembers(appId: string) {
      return members.filter((m) => m.app_id === appId);
    },

    async markAppShared(appId: string) {
      if (appId === app.id) isShared = true;
    },

    getIsShared() {
      return isShared;
    },
  };
}

Deno.test("invites Edge Function: auth, create, accept, and member management", async () => {
  const db = createMockInvitesDb();

  // 1. Unauthenticated request to protected op returns 401
  const unauthReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", app_id: "app-123" }),
  });
  const unauthRes = await handleInvites(unauthReq, {
    db,
    verifyJwt: async () => null,
  });
  assertEquals(unauthRes.status, 401);

  // 2. Public get_info returns 404 for unknown code
  const notFoundReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "get_info", code: "UNKNOWN" }),
  });
  const notFoundRes = await handleInvites(notFoundReq, { db });
  assertEquals(notFoundRes.status, 404);

  // 3. Owner creates an invite
  const createReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      op: "create",
      app_id: "app-123",
      role: "editor",
      max_uses: 5,
    }),
  });
  const createRes = await handleInvites(createReq, {
    db,
    verifyJwt: async () => ({ userId: "user-owner" }),
  });
  assertEquals(createRes.status, 200);
  const createData = await createRes.json();
  assertEquals(createData.success, true);
  assertEquals(db.getIsShared(), true);
  const code = createData.invite.code;
  assertEquals(typeof code, "string");
  assertEquals(code.length, 8);

  // 4. Non-owner cannot create an invite
  const nonOwnerCreateReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", app_id: "app-123" }),
  });
  const nonOwnerCreateRes = await handleInvites(nonOwnerCreateReq, {
    db,
    verifyJwt: async () => ({ userId: "user-rando" }),
  });
  assertEquals(nonOwnerCreateRes.status, 403);

  // 5. Public get_info on the generated code returns app preview
  const infoReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "get_info", code }),
  });
  const infoRes = await handleInvites(infoReq, { db });
  assertEquals(infoRes.status, 200);
  const infoData = await infoRes.json();
  assertEquals(infoData.valid, true);
  assertEquals(infoData.app.name, "Shared Habit Tracker");
  assertEquals(infoData.role, "editor");

  // 6. User 2 accepts the invite
  const acceptReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "accept", code }),
  });
  const acceptRes = await handleInvites(acceptReq, {
    db,
    verifyJwt: async () => ({ userId: "user-partner" }),
  });
  assertEquals(acceptRes.status, 200);
  const acceptData = await acceptRes.json();
  assertEquals(acceptData.success, true);
  assertEquals(acceptData.role, "editor");

  // 7. Verify member list now includes User 2
  const listReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "list_members", app_id: "app-123" }),
  });
  const listRes = await handleInvites(listReq, {
    db,
    verifyJwt: async () => ({ userId: "user-owner" }),
  });
  assertEquals(listRes.status, 200);
  const listData = await listRes.json();
  assertEquals(listData.members.length, 2);
  const partner = listData.members.find((m: { user_id: string }) => m.user_id === "user-partner");
  assertEquals(partner.role, "editor");
  assertEquals(partner.is_owner, false);

  // 8. Owner removes User 2
  const removeReq = new Request("http://localhost/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "remove_member", app_id: "app-123", user_id: "user-partner" }),
  });
  const removeRes = await handleInvites(removeReq, {
    db,
    verifyJwt: async () => ({ userId: "user-owner" }),
  });
  assertEquals(removeRes.status, 200);

  // Verify User 2 removed
  const listAfter = await db.listMembers("app-123");
  assertEquals(listAfter.length, 1);
});
