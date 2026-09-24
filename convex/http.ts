import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Target of navigator.sendBeacon on pagehide; the body is the session id as plain text.
http.route({
  path: "/disconnect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const sessionId = (await request.text()).trim();
    if (sessionId && sessionId.length <= 100) {
      await ctx.runMutation(internal.rooms.disconnect, { sessionId });
    }
    return new Response(null, { status: 204 });
  }),
});

export default http;
