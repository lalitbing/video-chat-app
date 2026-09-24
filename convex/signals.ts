import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { SIGNALING_KINDS } from "./model";

const MAX_BATCH = 100;

export const inbox = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_to", (q) => q.eq("to", sessionId))
      .collect();
    return signals
      .sort((left, right) => left._creationTime - right._creationTime || left.seq - right.seq)
      .map((signal) => ({
        id: signal._id,
        from: signal.from,
        kind: signal.kind,
        payload: signal.payload,
      }));
  },
});

// Clients batch their outgoing offers/answers/ICE candidates into one call.
export const send = mutation({
  args: {
    from: v.string(),
    items: v.array(
      v.object({ to: v.string(), kind: v.string(), payload: v.any(), seq: v.number() })
    ),
  },
  handler: async (ctx, { from, items }) => {
    for (const item of items.slice(0, MAX_BATCH)) {
      if (!(SIGNALING_KINDS as readonly string[]).includes(item.kind) || !item.to) continue;
      await ctx.db.insert("signals", { from, ...item });
    }
  },
});

export const ack = mutation({
  args: { sessionId: v.string(), ids: v.array(v.id("signals")) },
  handler: async (ctx, { sessionId, ids }) => {
    for (const id of ids) {
      const signal = await ctx.db.get(id);
      if (signal && signal.to === sessionId) {
        await ctx.db.delete(id);
      }
    }
  },
});
