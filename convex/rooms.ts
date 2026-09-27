import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  MAX_ACTIVE_ROOMS,
  MAX_ROOM_ID,
  MIN_ROOM_ID,
  PRESENCE_STALE_MS,
  RESERVATION_MS,
  SWEEP_INTERVAL_MS,
  cleanupRoomIfEmpty,
  countActiveRooms,
  clearSessionRoomState,
  clearSignalingInbox,
  deleteRoom,
  getMembers,
  getNameKey,
  getPending,
  getRoom,
  hasNameConflict,
  normalizeName,
  normalizeRoomId,
  removeMember,
  removePending,
  roomExists,
  sendEvent,
  touchPresence,
} from "./model";

const ROOMS_FULL_ERROR = `All ${MAX_ACTIVE_ROOMS} meeting rooms are in use right now. Please try again in a few minutes.`;

export const capacity = query({
  args: {},
  handler: async (ctx) => ({ active: await countActiveRooms(ctx), max: MAX_ACTIVE_ROOMS }),
});

// Hands out a free room number and holds it for the caller, in one transaction,
// so two people starting meetings at once can never get the same room.
export const createRandom = mutation({
  args: { name: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    if (!name) {
      return { ok: false as const, error: "Please enter your name to start a meeting." };
    }

    const rooms = await ctx.db.query("rooms").collect();
    if (rooms.length >= MAX_ACTIVE_ROOMS) {
      return { ok: false as const, error: ROOMS_FULL_ERROR };
    }

    const used = new Set(rooms.map((room) => room.roomId));
    const free: string[] = [];
    for (let id = MIN_ROOM_ID; id <= MAX_ROOM_ID; id += 1) {
      if (!used.has(String(id))) free.push(String(id));
    }
    const roomId = free[Math.floor(Math.random() * free.length)];

    const roomDocId = await ctx.db.insert("rooms", {
      roomId,
      hostName: name,
      hostSessionId: null,
      sharerId: null,
      reservedBy: args.sessionId,
      reservedUntil: Date.now() + RESERVATION_MS,
    });
    await ctx.scheduler.runAfter(RESERVATION_MS, internal.rooms.expireReservation, { roomDocId });
    await ctx.scheduler.runAfter(SWEEP_INTERVAL_MS, internal.rooms.sweep, { roomDocId });

    return { ok: true as const, roomId };
  },
});

// Frees a reserved room whose host never joined.
export const expireReservation = internalMutation({
  args: { roomDocId: v.id("rooms") },
  handler: async (ctx, { roomDocId }) => {
    const room = await ctx.db.get(roomDocId);
    if (!room || !room.reservedBy) return;
    await ctx.db.patch(roomDocId, { reservedBy: undefined, reservedUntil: undefined });
    await cleanupRoomIfEmpty(ctx, room.roomId);
  },
});

export const exists = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    if (!roomId) {
      return { exists: false, error: "Invalid room ID. Use numbers from 1 to 999." };
    }
    return { exists: await roomExists(ctx, roomId) };
  },
});

// Everything a client in (or waiting for) a room needs, in one subscription.
export const state = query({
  args: { roomId: v.string(), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    const room = await getRoom(ctx, roomId);
    if (!room) {
      return { exists: false as const, me: "none" as const };
    }

    const [members, pending] = await Promise.all([getMembers(ctx, roomId), getPending(ctx, roomId)]);
    const self = members.find((member) => member.sessionId === sessionId);
    const isPending = pending.some((request) => request.sessionId === sessionId);

    if (!self) {
      return {
        exists: true as const,
        me: isPending ? ("pending" as const) : ("none" as const),
        hostName: room.hostName,
      };
    }

    const isHost = self.role === "host" && room.hostSessionId === sessionId;

    return {
      exists: true as const,
      me: "member" as const,
      role: self.role,
      hostName: room.hostName,
      sharerId: room.sharerId,
      members: members
        .map((member) => ({
          id: member.sessionId,
          name: member.name,
          role: member.role,
          videoEnabled: member.videoEnabled,
          isSharing: member.isSharing,
        }))
        .sort((left, right) => {
          if (left.role !== right.role) {
            return left.role === "host" ? -1 : 1;
          }
          return left.name.localeCompare(right.name);
        }),
      pending: isHost
        ? pending
            .map((request) => ({
              id: request.sessionId,
              name: request.name,
              requestedAt: request.requestedAt,
            }))
            .sort((left, right) => left.requestedAt - right.requestedAt)
        : [],
    };
  },
});

export const join = mutation({
  args: {
    roomId: v.string(),
    name: v.string(),
    intent: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    const name = normalizeName(args.name);
    const intent = args.intent === "create" ? "create" : "join";
    const { sessionId } = args;

    if (!roomId) {
      return { status: "invalid-room", error: "Invalid room ID. Use numbers from 1 to 999." };
    }
    if (!name) {
      return { status: "invalid-name", error: "Please enter your name before joining." };
    }

    await clearSessionRoomState(ctx, sessionId, roomId);
    await touchPresence(ctx, sessionId);

    let room = await getRoom(ctx, roomId);
    if (!room) {
      if (intent !== "create") {
        return { status: "room-not-found", error: `Meeting room ${roomId} was not found.` };
      }
      if ((await countActiveRooms(ctx)) >= MAX_ACTIVE_ROOMS) {
        return { status: "rooms-full", error: ROOMS_FULL_ERROR };
      }
      const roomDocId = await ctx.db.insert("rooms", {
        roomId,
        hostName: name,
        hostSessionId: null,
        sharerId: null,
      });
      await ctx.scheduler.runAfter(SWEEP_INTERVAL_MS, internal.rooms.sweep, { roomDocId });
      room = (await ctx.db.get(roomDocId))!;
    }

    const existingMember = (await getMembers(ctx, roomId)).find(
      (member) => member.sessionId === sessionId
    );
    const nameKey = getNameKey(name);
    const role = nameKey === getNameKey(room.hostName) ? "host" : "participant";

    if (role === "participant") {
      if (existingMember) {
        return { status: "joined", role: existingMember.role, hostName: room.hostName };
      }
      if (await hasNameConflict(ctx, room, nameKey, sessionId)) {
        return {
          status: "name-taken",
          error: "This name is already in use in the room. Please choose a unique name.",
        };
      }

      const existingRequest = (await getPending(ctx, roomId)).find(
        (request) => request.sessionId === sessionId
      );
      if (existingRequest) {
        await ctx.db.patch(existingRequest._id, { name, requestedAt: Date.now() });
      } else {
        await ctx.db.insert("pending", { roomId, sessionId, name, requestedAt: Date.now() });
      }

      return { status: "waiting", role: "participant", hostName: room.hostName };
    }

    // Host (re)joining: a host session in another tab/window is replaced.
    if (room.hostSessionId && room.hostSessionId !== sessionId) {
      const previousHostId = room.hostSessionId;
      const previousHost = (await getMembers(ctx, roomId)).find(
        (member) => member.sessionId === previousHostId
      );
      if (previousHost) {
        await ctx.db.delete(previousHost._id);
      }
      await sendEvent(ctx, previousHostId, "room-entry-revoked", {
        reason: "Host session moved to a new tab/window.",
      });
    }

    if (!existingMember) {
      await ctx.db.insert("members", {
        roomId,
        sessionId,
        name,
        role: "host",
        joinedAt: Date.now(),
        videoEnabled: true,
        isSharing: false,
      });
    }
    // The host has arrived, so the room no longer needs holding.
    await ctx.db.patch(room._id, {
      hostSessionId: sessionId,
      reservedBy: undefined,
      reservedUntil: undefined,
    });

    return { status: "joined", role: "host", hostName: room.hostName };
  },
});

export const admit = mutation({
  args: { roomId: v.string(), sessionId: v.string(), targetId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    if (!roomId || !args.targetId) {
      return { ok: false, error: "Invalid participant admission request." };
    }

    const room = await getRoom(ctx, roomId);
    if (!room) {
      return { ok: false, error: "Meeting room no longer exists." };
    }
    if (room.hostSessionId !== args.sessionId) {
      return { ok: false, error: "Only the host can admit participants." };
    }

    const request = (await getPending(ctx, roomId)).find(
      (entry) => entry.sessionId === args.targetId
    );
    if (!request) {
      return { ok: false, error: "This participant is no longer waiting." };
    }

    const presence = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.targetId))
      .unique();
    if (!presence || presence.lastSeen < Date.now() - PRESENCE_STALE_MS) {
      await ctx.db.delete(request._id);
      return { ok: false, error: "This participant disconnected." };
    }

    if (await hasNameConflict(ctx, room, getNameKey(request.name), args.targetId)) {
      await ctx.db.delete(request._id);
      await sendEvent(ctx, args.targetId, "room-entry-denied", {
        reason: "Your name conflicts with someone already in the room.",
      });
      return { ok: false, error: "Participant name is no longer unique." };
    }

    await ctx.db.delete(request._id);
    await ctx.db.insert("members", {
      roomId,
      sessionId: args.targetId,
      name: request.name,
      role: "participant",
      joinedAt: Date.now(),
      videoEnabled: true,
      isSharing: false,
    });

    return { ok: true };
  },
});

export const end = mutation({
  args: { roomId: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    if (!roomId) {
      return { ok: false, error: "Invalid meeting room." };
    }

    const room = await getRoom(ctx, roomId);
    if (!room) {
      return { ok: false, error: "Meeting room no longer exists." };
    }
    if (room.hostSessionId !== args.sessionId) {
      return { ok: false, error: "Only the host can end the meeting." };
    }

    const [members, pending] = await Promise.all([getMembers(ctx, roomId), getPending(ctx, roomId)]);
    for (const entry of [...members, ...pending]) {
      if (entry.sessionId !== args.sessionId) {
        await sendEvent(ctx, entry.sessionId, "meeting-ended", {
          roomId,
          hostName: room.hostName,
        });
      }
      await ctx.db.delete(entry._id);
    }
    await deleteRoom(ctx, room);

    return { ok: true };
  },
});

export const leave = mutation({
  args: { roomId: v.optional(v.string()), sessionId: v.string() },
  handler: async (ctx, args) => {
    const roomId = args.roomId ? normalizeRoomId(args.roomId) : null;
    const [memberships, requests] = await Promise.all([
      ctx.db
        .query("members")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("pending")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
    ]);

    for (const request of requests) {
      if (!roomId || request.roomId === roomId) await removePending(ctx, request);
    }
    for (const member of memberships) {
      if (!roomId || member.roomId === roomId) await removeMember(ctx, member);
    }
    await clearSignalingInbox(ctx, args.sessionId);
  },
});

export const heartbeat = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    await touchPresence(ctx, sessionId);
  },
});

export const setScreenShare = mutation({
  args: { roomId: v.string(), sessionId: v.string(), isSharing: v.boolean() },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    if (!roomId) return;
    const room = await getRoom(ctx, roomId);
    const member = (await getMembers(ctx, roomId)).find(
      (entry) => entry.sessionId === args.sessionId
    );
    if (!room || !member) return;

    await ctx.db.patch(member._id, { isSharing: args.isSharing });
    if (args.isSharing) {
      await ctx.db.patch(room._id, { sharerId: args.sessionId });
    } else if (room.sharerId === args.sessionId) {
      await ctx.db.patch(room._id, { sharerId: null });
    }
  },
});

export const setVideoState = mutation({
  args: { roomId: v.string(), sessionId: v.string(), videoEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    if (!roomId) return;
    const member = (await getMembers(ctx, roomId)).find(
      (entry) => entry.sessionId === args.sessionId
    );
    if (!member || member.videoEnabled === args.videoEnabled) return;
    await ctx.db.patch(member._id, { videoEnabled: args.videoEnabled });
  },
});

// Called from the pagehide beacon (see http.ts) so closing a tab frees the seat right away.
export const disconnect = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    await clearSessionRoomState(ctx, sessionId);
    await clearSignalingInbox(ctx, sessionId);
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (presence) await ctx.db.delete(presence._id);
  },
});

// Replaces socket.io's "disconnect": removes sessions that stopped sending heartbeats.
// Reschedules itself for as long as the room exists.
export const sweep = internalMutation({
  args: { roomDocId: v.id("rooms") },
  handler: async (ctx, { roomDocId }: { roomDocId: Id<"rooms"> }) => {
    const room = await ctx.db.get(roomDocId);
    if (!room) return;

    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const isStale = async (sessionId: string) => {
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .unique();
      return !presence || presence.lastSeen < cutoff;
    };

    const [members, pending] = await Promise.all([
      getMembers(ctx, room.roomId),
      getPending(ctx, room.roomId),
    ]);
    for (const request of pending) {
      if (await isStale(request.sessionId)) await removePending(ctx, request);
    }
    for (const member of members) {
      if (await isStale(member.sessionId)) {
        await removeMember(ctx, member);
        await clearSignalingInbox(ctx, member.sessionId);
      }
    }

    if (await ctx.db.get(roomDocId)) {
      await ctx.scheduler.runAfter(SWEEP_INTERVAL_MS, internal.rooms.sweep, { roomDocId });
    }
  },
});
