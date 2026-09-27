import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const MIN_ROOM_ID = 1;
export const MAX_ROOM_ID = 999;
// Room numbers run 1-999, but only this many meetings may run at the same time.
export const MAX_ACTIVE_ROOMS = 5;
// How long a room handed out by createRandom is held for its host to join.
export const RESERVATION_MS = 5 * 60_000;

// A session that hasn't sent a heartbeat for this long is treated as disconnected.
export const PRESENCE_STALE_MS = 30_000;
export const SWEEP_INTERVAL_MS = 15_000;

export const SIGNALING_KINDS = ["offer", "answer", "ice-candidate"] as const;

export const normalizeRoomId = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const numeric = Number.parseInt(text, 10);
  if (!Number.isInteger(numeric) || numeric < MIN_ROOM_ID || numeric > MAX_ROOM_ID) {
    return null;
  }
  return String(numeric);
};

export const normalizeName = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return text.replace(/\s+/g, " ").slice(0, 60);
};

export const getNameKey = (name: string) => name.trim().toLowerCase();

export const getRoom = (ctx: QueryCtx, roomId: string) =>
  ctx.db
    .query("rooms")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .unique();

export const getMembers = (ctx: QueryCtx, roomId: string) =>
  ctx.db
    .query("members")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

export const getPending = (ctx: QueryCtx, roomId: string) =>
  ctx.db
    .query("pending")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

export const isReserved = (room: Doc<"rooms">, now = Date.now()) =>
  Boolean(room.reservedBy && room.reservedUntil && room.reservedUntil > now);

export const roomExists = async (ctx: QueryCtx, roomId: string) => {
  const room = await getRoom(ctx, roomId);
  if (!room) return false;
  if (isReserved(room)) return true;
  const [members, pending] = await Promise.all([getMembers(ctx, roomId), getPending(ctx, roomId)]);
  return members.length > 0 || pending.length > 0;
};

// Every row in `rooms` is a live or reserved meeting; empty rooms are deleted.
export const countActiveRooms = async (ctx: QueryCtx) => (await ctx.db.query("rooms").collect()).length;

export const hasNameConflict = async (
  ctx: QueryCtx,
  room: Doc<"rooms">,
  nameKey: string,
  ignoreSessionId: string | null = null
) => {
  if (nameKey === getNameKey(room.hostName) && room.hostSessionId !== ignoreSessionId) {
    return true;
  }

  const [members, pending] = await Promise.all([
    getMembers(ctx, room.roomId),
    getPending(ctx, room.roomId),
  ]);

  return [...members, ...pending].some(
    (entry) => entry.sessionId !== ignoreSessionId && getNameKey(entry.name) === nameKey
  );
};

export const sendEvent = async (
  ctx: MutationCtx,
  to: string,
  kind: string,
  payload: Record<string, unknown>
) => {
  await ctx.db.insert("signals", { to, from: "server", kind, payload, seq: 0 });
};

export const touchPresence = async (ctx: MutationCtx, sessionId: string) => {
  const existing = await ctx.db
    .query("presence")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { lastSeen: Date.now() });
  } else {
    await ctx.db.insert("presence", { sessionId, lastSeen: Date.now() });
  }
};

export const cleanupRoomIfEmpty = async (ctx: MutationCtx, roomId: string) => {
  const room = await getRoom(ctx, roomId);
  if (!room) return;
  if (isReserved(room)) return; // still waiting for its host
  const [members, pending] = await Promise.all([getMembers(ctx, roomId), getPending(ctx, roomId)]);
  if (members.length === 0 && pending.length === 0) {
    await deleteRoom(ctx, room);
  }
};

export const deleteRoom = async (ctx: MutationCtx, room: Doc<"rooms">) => {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
    .collect();
  await Promise.all(messages.map((message) => ctx.db.delete(message._id)));
  await ctx.db.delete(room._id);
};

export const removeMember = async (ctx: MutationCtx, member: Doc<"members">) => {
  await ctx.db.delete(member._id);
  const room = await getRoom(ctx, member.roomId);
  if (room) {
    const patch: Partial<Doc<"rooms">> = {};
    if (room.sharerId === member.sessionId) patch.sharerId = null;
    if (member.role === "host" && room.hostSessionId === member.sessionId) {
      patch.hostSessionId = null;
    }
    if (Object.keys(patch).length) {
      await ctx.db.patch(room._id, patch);
    }
  }
  await cleanupRoomIfEmpty(ctx, member.roomId);
};

export const removePending = async (ctx: MutationCtx, request: Doc<"pending">) => {
  await ctx.db.delete(request._id);
  await cleanupRoomIfEmpty(ctx, request.roomId);
};

// Drops signaling left over from a previous call so it isn't replayed on rejoin.
export const clearSignalingInbox = async (ctx: MutationCtx, sessionId: string) => {
  const signals = await ctx.db
    .query("signals")
    .withIndex("by_to", (q) => q.eq("to", sessionId))
    .collect();
  await Promise.all(
    signals
      .filter((signal) => (SIGNALING_KINDS as readonly string[]).includes(signal.kind))
      .map((signal) => ctx.db.delete(signal._id))
  );
};

// Removes a session from every room it is in or waiting for (optionally except one).
export const clearSessionRoomState = async (
  ctx: MutationCtx,
  sessionId: string,
  exceptRoomId: string | null = null
) => {
  const [memberships, requests] = await Promise.all([
    ctx.db
      .query("members")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect(),
    ctx.db
      .query("pending")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect(),
  ]);

  for (const member of memberships) {
    if (member.roomId !== exceptRoomId) await removeMember(ctx, member);
  }
  for (const request of requests) {
    if (request.roomId !== exceptRoomId) await removePending(ctx, request);
  }
};
