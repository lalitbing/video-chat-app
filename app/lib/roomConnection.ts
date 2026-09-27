import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Convex-backed replacement for the old Socket.IO client.
 *
 * It keeps the same `emit(event, payload, ack)` / `on(event, handler)` surface so the
 * WebRTC and room code didn't need restructuring. Server-pushed events are derived from
 * Convex subscriptions:
 * - room membership diffs  -> peers, peer-joined, peer-left, participants-update,
 *                             pending-requests, screen-sharer, screen-share, peer-video-state,
 *                             room-entry-approved, room-entry-waiting
 * - the per-session inbox  -> offer, answer, ice-candidate, meeting-ended,
 *                             room-entry-denied, room-entry-revoked
 * - chat subscription      -> chat-message
 */

type Listener = (...args: never[]) => void;
type Ack = (response: never) => void;

type RoomRole = "host" | "participant";
type RoomState = typeof api.rooms.state._returnType;
type MemberSnapshot = NonNullable<RoomState["members"]>[number];

const HEARTBEAT_INTERVAL_MS = 10_000;
const SIGNAL_FLUSH_DELAY_MS = 40;
// If we drop out of a room without an explicit server event, wait this long for one
// (e.g. meeting-ended) before reporting a generic disconnect.
const UNEXPLAINED_REMOVAL_GRACE_MS = 1500;

const getConvexUrl = () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` to configure it.");
  }
  return url;
};

const getConvexSiteUrl = (convexUrl: string) =>
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim() ||
  convexUrl.replace(/\.convex\.cloud\/?$/, ".convex.site");

// RTCSessionDescription / RTCIceCandidate instances aren't plain objects; Convex needs JSON.
const toPlain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const toParticipant = ({ id, name, role }: MemberSnapshot) => ({ id, name, role });

export class RoomConnection {
  readonly id: string;
  readonly connected = true;

  private client: ConvexClient;
  private siteUrl: string;
  private listeners = new Map<string, Set<Listener>>();

  private processedSignals = new Set<string>();
  private outgoingSignals: Array<{ to: string; kind: string; payload: unknown; seq: number }> = [];
  private signalSeq = 0;
  private signalFlushTimer: number | null = null;

  private activeRoomId: string | null = null;
  private unsubscribeRoom: (() => void) | null = null;
  private unsubscribeChat: (() => void) | null = null;
  private heartbeatTimer: number | null = null;
  private removalTimer: number | null = null;
  private lastRemovalEventAt = 0;

  private me: "member" | "pending" | "none" = "none";
  private knownMembers = new Map<string, MemberSnapshot>();
  private sharerId: string | null = null;
  private participantsKey = "";
  private pendingKey = "";
  private seenMessages = new Set<string>();

  constructor() {
    const convexUrl = getConvexUrl();
    this.client = new ConvexClient(convexUrl);
    this.siteUrl = getConvexSiteUrl(convexUrl);
    this.id = crypto.randomUUID();

    this.client.onUpdate(api.signals.inbox, { sessionId: this.id }, (signals) =>
      this.handleInbox(signals)
    );
    window.addEventListener("pagehide", this.handlePageHide);
  }

  /** Kept for Socket.IO API compatibility; the Convex client connects on creation. */
  connect() {
    return this;
  }

  /** Live count of running meetings against the cap. Returns an unsubscribe function. */
  watchCapacity(onChange: (capacity: { active: number; max: number }) => void) {
    return this.client.onUpdate(api.rooms.capacity, {}, onChange);
  }

  on(event: string, listener: Listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload: Record<string, unknown> = {}, ack?: Ack) {
    const reply = (response: unknown) => (ack as ((value: unknown) => void) | undefined)?.(response);
    const roomId = typeof payload.roomId === "string" ? payload.roomId : "";
    const sessionId = this.id;

    switch (event) {
      case "room-exists":
        this.client
          .query(api.rooms.exists, { roomId })
          .then(reply, () => reply({ exists: false, error: "Unable to reach the room server." }));
        return;

      case "create-random-room":
        this.client
          .mutation(api.rooms.createRandom, { name: String(payload.name ?? ""), sessionId })
          .then(reply, () => reply({ ok: false, error: "Unable to reach the room server." }));
        return;

      case "join-room":
        this.client
          .mutation(api.rooms.join, {
            roomId,
            name: String(payload.name ?? ""),
            intent: String(payload.intent ?? "join"),
            sessionId,
          })
          .then(
            (response) => {
              if (response.status === "joined" || response.status === "waiting") {
                this.setActiveRoom(roomId);
              }
              reply(response);
            },
            () => reply({ status: "error", error: "Unable to reach the room server." })
          );
        return;

      case "admit-participant":
        this.client
          .mutation(api.rooms.admit, {
            roomId,
            sessionId,
            targetId: String(payload.socketId ?? ""),
          })
          .then(reply, () => reply({ ok: false, error: "Unable to reach the room server." }));
        return;

      case "end-meeting":
        this.client
          .mutation(api.rooms.end, { roomId, sessionId })
          .then(
            (response) => {
              if (response.ok) this.clearActiveRoom();
              reply(response);
            },
            () => reply({ ok: false, error: "Unable to reach the room server." })
          );
        return;

      case "leave-room":
        this.clearActiveRoom();
        void this.client.mutation(api.rooms.leave, { roomId: roomId || undefined, sessionId });
        return;

      case "offer":
      case "answer":
      case "ice-candidate": {
        const { to, ...rest } = payload;
        if (typeof to !== "string" || !to) return;
        this.queueSignal(to, event, toPlain(rest));
        return;
      }

      case "chat-message":
        void this.client.mutation(api.chat.send, {
          roomId,
          sessionId,
          message: String(payload.message ?? ""),
          name: typeof payload.name === "string" ? payload.name : undefined,
        });
        return;

      case "screen-share":
        void this.client.mutation(api.rooms.setScreenShare, {
          roomId,
          sessionId,
          isSharing: Boolean(payload.isSharing),
        });
        return;

      case "video-state":
        if (typeof payload.videoEnabled !== "boolean") return;
        void this.client.mutation(api.rooms.setVideoState, {
          roomId,
          sessionId,
          videoEnabled: payload.videoEnabled,
        });
        return;

      default:
        console.warn(`RoomConnection: unknown event "${event}"`);
    }
  }

  private dispatch(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => {
      (listener as (...values: unknown[]) => void)(...args);
    });
  }

  // --- outgoing signaling -------------------------------------------------

  private queueSignal(to: string, kind: string, payload: unknown) {
    this.outgoingSignals.push({ to, kind, payload, seq: this.signalSeq++ });
    if (this.signalFlushTimer !== null) return;
    // ICE candidates arrive in bursts; batching keeps function calls (and cost) down.
    this.signalFlushTimer = window.setTimeout(() => {
      this.signalFlushTimer = null;
      const items = this.outgoingSignals.splice(0);
      if (items.length) {
        void this.client.mutation(api.signals.send, { from: this.id, items });
      }
    }, SIGNAL_FLUSH_DELAY_MS);
  }

  // --- inbox ------------------------------------------------------------------

  private handleInbox(
    signals: Array<{ id: Id<"signals">; from: string; kind: string; payload: Record<string, unknown> }>
  ) {
    const fresh = signals.filter((signal) => !this.processedSignals.has(signal.id));
    // Forget ids the server has already deleted.
    this.processedSignals = new Set(signals.map((signal) => signal.id));
    if (!fresh.length) return;

    for (const signal of fresh) {
      if (signal.kind === "offer" || signal.kind === "answer" || signal.kind === "ice-candidate") {
        this.dispatch(signal.kind, { from: signal.from, ...signal.payload });
        continue;
      }

      if (
        signal.kind === "meeting-ended" ||
        signal.kind === "room-entry-denied" ||
        signal.kind === "room-entry-revoked"
      ) {
        this.lastRemovalEventAt = Date.now();
        this.clearActiveRoom();
      }
      this.dispatch(signal.kind, signal.payload);
    }

    void this.client.mutation(api.signals.ack, {
      sessionId: this.id,
      ids: fresh.map((signal) => signal.id),
    });
  }

  // --- room subscription ---------------------------------------------------

  private setActiveRoom(roomId: string) {
    if (this.activeRoomId === roomId) return;
    this.clearActiveRoom();
    this.activeRoomId = roomId;

    this.unsubscribeRoom = this.client.onUpdate(
      api.rooms.state,
      { roomId, sessionId: this.id },
      (state) => {
        if (this.activeRoomId === roomId) this.handleRoomState(roomId, state);
      }
    );

    this.heartbeatTimer = window.setInterval(() => {
      void this.client.mutation(api.rooms.heartbeat, { sessionId: this.id });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearActiveRoom() {
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    this.stopChat();
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.removalTimer !== null) window.clearTimeout(this.removalTimer);
    this.removalTimer = null;

    this.activeRoomId = null;
    this.me = "none";
    this.knownMembers.clear();
    this.sharerId = null;
    this.participantsKey = "";
    this.pendingKey = "";
  }

  private handleRoomState(roomId: string, state: RoomState) {
    const previousMe = this.me;
    this.me = state.me;

    if (state.me === "none") {
      if (previousMe !== "none") this.handleUnexplainedRemoval();
      return;
    }

    if (state.me === "pending") {
      if (previousMe !== "pending") {
        this.dispatch("room-entry-waiting", { roomId, hostName: state.hostName });
      }
      return;
    }

    const members = state.members ?? [];
    const sharerId = state.sharerId ?? null;
    const others = members.filter((member) => member.id !== this.id);

    if (previousMe !== "member") {
      // Newly admitted: existing peers will send us offers.
      this.dispatch(
        "peers",
        others.map(({ id, name, role }) => ({ id, name, role: role as RoomRole }))
      );
      this.sharerId = sharerId;
      this.dispatch("screen-sharer", { id: sharerId });
      this.dispatch("room-entry-approved", { roomId, role: state.role, hostName: state.hostName });
      others.forEach((member) => this.announceMediaState(member));
      this.startChat(roomId);
    } else {
      const currentIds = new Set(others.map((member) => member.id));
      for (const id of this.knownMembers.keys()) {
        if (!currentIds.has(id)) this.dispatch("peer-left", id);
      }
      for (const member of others) {
        const previous = this.knownMembers.get(member.id);
        if (!previous) {
          this.dispatch("peer-joined", toParticipant(member));
          this.announceMediaState(member);
          continue;
        }
        if (previous.videoEnabled !== member.videoEnabled) {
          this.dispatch("peer-video-state", { peerId: member.id, videoEnabled: member.videoEnabled });
        }
        if (previous.isSharing !== member.isSharing) {
          this.dispatch("screen-share", { id: member.id, isSharing: member.isSharing });
        }
      }
      if (sharerId !== this.sharerId) {
        this.sharerId = sharerId;
        this.dispatch("screen-sharer", { id: sharerId });
      }
    }

    this.knownMembers = new Map(others.map((member) => [member.id, member]));

    const participants = members.map(toParticipant);
    const participantsKey = JSON.stringify(participants);
    if (participantsKey !== this.participantsKey) {
      this.participantsKey = participantsKey;
      this.dispatch("participants-update", { participants });
    }

    const pending = state.pending ?? [];
    const pendingKey = JSON.stringify(pending);
    if (pendingKey !== this.pendingKey) {
      this.pendingKey = pendingKey;
      this.dispatch("pending-requests", { requests: pending, hostOnline: true });
    }
  }

  private announceMediaState(member: MemberSnapshot) {
    this.dispatch("peer-video-state", { peerId: member.id, videoEnabled: member.videoEnabled });
    if (member.isSharing) {
      this.dispatch("screen-share", { id: member.id, isSharing: true });
    }
  }

  private handleUnexplainedRemoval() {
    this.knownMembers.forEach((_, id) => this.dispatch("peer-left", id));
    this.knownMembers.clear();
    this.stopChat();

    const removedAt = Date.now();
    this.removalTimer = window.setTimeout(() => {
      this.removalTimer = null;
      if (this.lastRemovalEventAt >= removedAt - UNEXPLAINED_REMOVAL_GRACE_MS) return;
      this.clearActiveRoom();
      this.dispatch("room-entry-revoked", {
        reason: "You were disconnected from the meeting. Please rejoin.",
      });
    }, UNEXPLAINED_REMOVAL_GRACE_MS);
  }

  // --- chat ------------------------------------------------------------------

  private startChat(roomId: string) {
    this.stopChat();
    this.unsubscribeChat = this.client.onUpdate(
      api.chat.list,
      { roomId, sessionId: this.id },
      (messages) => {
        for (const { key, ...message } of messages) {
          if (this.seenMessages.has(key)) continue;
          this.seenMessages.add(key);
          this.dispatch("chat-message", message);
        }
      }
    );
  }

  private stopChat() {
    this.unsubscribeChat?.();
    this.unsubscribeChat = null;
    this.seenMessages.clear();
  }

  // --- tab close -----------------------------------------------------------

  private handlePageHide = () => {
    if (!this.activeRoomId) return;
    // Frees the seat immediately instead of waiting for the heartbeat to go stale.
    navigator.sendBeacon(`${this.siteUrl}/disconnect`, this.id);
  };
}

let connection: RoomConnection | null = null;

export const getRoomConnection = () => {
  if (!connection) {
    connection = new RoomConnection();
  }
  return connection;
};
