import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { normalizeRoomId } from "./model";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY = 200;

const getMembership = (ctx: QueryCtx, sessionId: string, roomId: string) =>
  ctx.db
    .query("members")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .filter((q) => q.eq(q.field("roomId"), roomId))
    .first();

// Like the socket version, members only see messages sent after they joined.
export const list = query({
  args: { roomId: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    if (!roomId) return [];
    const member = await getMembership(ctx, args.sessionId, roomId);
    if (!member) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId).gte("_creationTime", member.joinedAt))
      .order("desc")
      .take(MAX_HISTORY);

    return messages.reverse().map((message) => ({
      key: message._id,
      id: message.sessionId,
      name: message.name,
      message: message.message,
      timestamp: message._creationTime,
    }));
  },
});

export const send = mutation({
  args: {
    roomId: v.string(),
    sessionId: v.string(),
    message: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const roomId = normalizeRoomId(args.roomId);
    const message = args.message.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!roomId || !message) return;
    const member = await getMembership(ctx, args.sessionId, roomId);
    if (!member) return;
    await ctx.db.insert("messages", {
      roomId,
      sessionId: args.sessionId,
      name: args.name?.trim() || member.name || "Guest",
      message,
    });
  },
});
