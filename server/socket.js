const rooms = new Map();

const MIN_ROOM_ID = 1;
const MAX_ROOM_ID = 999;

const normalizeRoomId = (value) => {
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

const normalizeName = (value) => {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return text.replace(/\s+/g, " ").slice(0, 60);
};

const getNameKey = (name) => name.trim().toLowerCase();

const roomExists = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }
  return room.members.size > 0 || room.pending.size > 0;
};

const createRoom = (roomId, hostName) => {
  const room = {
    hostName,
    hostSocketId: null,
    members: new Map(),
    pending: new Map(),
    sharerId: null,
  };
  rooms.set(roomId, room);
  return room;
};

const cleanupRoomIfEmpty = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.members.size === 0 && room.pending.size === 0) {
    rooms.delete(roomId);
  }
};

const buildParticipants = (room) =>
  Array.from(room.members.entries())
    .map(([id, member]) => ({
      id,
      name: member.name,
      role: member.role,
    }))
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "host" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

const buildPeers = (room, socketId) =>
  Array.from(room.members.entries())
    .filter(([id]) => id !== socketId)
    .map(([id, member]) => ({
      id,
      name: member.name,
      role: member.role,
    }));

const buildPending = (room) =>
  Array.from(room.pending.entries())
    .map(([id, request]) => ({
      id,
      name: request.name,
      requestedAt: request.requestedAt,
    }))
    .sort((left, right) => left.requestedAt - right.requestedAt);

const emitParticipants = (io, roomId, room) => {
  io.to(roomId).emit("participants-update", {
    participants: buildParticipants(room),
  });
};

const emitPendingRequests = (io, room, includeHostOnline = true) => {
  if (!room.hostSocketId) return;
  const hostSocket = io.sockets.sockets.get(room.hostSocketId);
  if (!hostSocket) return;
  hostSocket.emit("pending-requests", {
    requests: buildPending(room),
    hostOnline: includeHostOnline,
  });
};

const hasNameConflict = (room, nameKey, ignoreSocketId = null) => {
  if (nameKey === getNameKey(room.hostName) && room.hostSocketId !== ignoreSocketId) {
    return true;
  }

  for (const [memberSocketId, member] of room.members.entries()) {
    if (memberSocketId === ignoreSocketId) continue;
    if (getNameKey(member.name) === nameKey) {
      return true;
    }
  }

  for (const [pendingSocketId, pending] of room.pending.entries()) {
    if (pendingSocketId === ignoreSocketId) continue;
    if (getNameKey(pending.name) === nameKey) {
      return true;
    }
  }

  return false;
};

const removePendingRequest = (io, roomId, room, socketId) => {
  if (!room.pending.has(socketId)) return;
  room.pending.delete(socketId);
  emitPendingRequests(io, room);
  cleanupRoomIfEmpty(roomId);
};

const removeMember = (io, roomId, room, socketId) => {
  const member = room.members.get(socketId);
  if (!member) return;

  room.members.delete(socketId);

  if (room.sharerId === socketId) {
    room.sharerId = null;
    io.to(roomId).emit("screen-sharer", { id: null });
  }

  if (member.role === "host" && room.hostSocketId === socketId) {
    room.hostSocketId = null;
  }

  io.to(roomId).emit("peer-left", socketId);
  emitParticipants(io, roomId, room);
  emitPendingRequests(io, room);
  cleanupRoomIfEmpty(roomId);
};

const clearSocketRoomState = (io, socket) => {
  const roomId = socket.data.roomId;
  if (roomId) {
    const room = rooms.get(roomId);
    if (room) {
      removeMember(io, roomId, room, socket.id);
    }
    socket.leave(roomId);
    socket.data.roomId = null;
  }

  const pendingRoomId = socket.data.pendingRoomId;
  if (pendingRoomId) {
    const pendingRoom = rooms.get(pendingRoomId);
    if (pendingRoom) {
      removePendingRequest(io, pendingRoomId, pendingRoom, socket.id);
    }
    socket.data.pendingRoomId = null;
  }

  socket.data.role = null;
};

const joinAdmittedSocket = ({ io, socket, roomId, room, name, role }) => {
  if (socket.data.pendingRoomId === roomId) {
    room.pending.delete(socket.id);
    socket.data.pendingRoomId = null;
  }

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.name = name;
  socket.data.role = role;

  room.members.set(socket.id, {
    name,
    role,
  });

  if (role === "host") {
    room.hostSocketId = socket.id;
  }

  const peers = buildPeers(room, socket.id);
  socket.emit("peers", peers);
  socket.emit("screen-sharer", { id: room.sharerId });
  socket.emit("room-entry-approved", {
    roomId,
    role,
    hostName: room.hostName,
  });

  socket.to(roomId).emit("peer-joined", {
    id: socket.id,
    name,
    role,
  });

  emitParticipants(io, roomId, room);
  emitPendingRequests(io, room);
};

const endMeetingForAll = ({ io, roomId, room, endedBySocketId }) => {
  const endedByHostName = room.hostName;
  const memberSocketIds = Array.from(room.members.keys());
  const pendingSocketIds = Array.from(room.pending.keys());

  memberSocketIds.forEach((memberSocketId) => {
    const memberSocket = io.sockets.sockets.get(memberSocketId);
    if (!memberSocket) return;

    if (memberSocketId !== endedBySocketId) {
      memberSocket.emit("meeting-ended", {
        roomId,
        hostName: endedByHostName,
      });
    }

    memberSocket.leave(roomId);
    memberSocket.data.roomId = null;
    memberSocket.data.pendingRoomId = null;
    memberSocket.data.role = null;
  });

  pendingSocketIds.forEach((pendingSocketId) => {
    const pendingSocket = io.sockets.sockets.get(pendingSocketId);
    if (!pendingSocket) return;

    pendingSocket.emit("meeting-ended", {
      roomId,
      hostName: endedByHostName,
    });

    pendingSocket.data.pendingRoomId = null;
    pendingSocket.data.roomId = null;
    pendingSocket.data.role = null;
  });

  room.members.clear();
  room.pending.clear();
  room.sharerId = null;
  room.hostSocketId = null;
  rooms.delete(roomId);
};

module.exports = function setupSocket(io) {
  io.on("connection", (socket) => {
    socket.on("room-exists", (payload = {}, callback = () => {}) => {
      const ack = typeof callback === "function" ? callback : () => {};
      const normalizedRoomId = normalizeRoomId(payload.roomId);
      if (!normalizedRoomId) {
        ack({
          exists: false,
          error: "Invalid room ID. Use numbers from 1 to 999.",
        });
        return;
      }
      ack({ exists: roomExists(normalizedRoomId) });
    });

    socket.on("join-room", (payload = {}, callback = () => {}) => {
      const ack = typeof callback === "function" ? callback : () => {};
      const normalizedRoomId = normalizeRoomId(payload.roomId);
      const normalizedName = normalizeName(payload.name);
      const intent = payload.intent === "create" ? "create" : "join";

      if (!normalizedRoomId) {
        ack({
          status: "invalid-room",
          error: "Invalid room ID. Use numbers from 1 to 999.",
        });
        return;
      }

      if (!normalizedName) {
        ack({
          status: "invalid-name",
          error: "Please enter your name before joining.",
        });
        return;
      }

      socket.data.name = normalizedName;

      if (
        (socket.data.roomId && socket.data.roomId !== normalizedRoomId) ||
        (socket.data.pendingRoomId && socket.data.pendingRoomId !== normalizedRoomId)
      ) {
        clearSocketRoomState(io, socket);
      }

      let room = rooms.get(normalizedRoomId);
      if (!room) {
        if (intent !== "create") {
          ack({
            status: "room-not-found",
            error: `Meeting room ${normalizedRoomId} was not found.`,
          });
          return;
        }
        room = createRoom(normalizedRoomId, normalizedName);
      }

      const nameKey = getNameKey(normalizedName);
      const hostNameKey = getNameKey(room.hostName);
      const resolvedRole = nameKey === hostNameKey ? "host" : "participant";

      if (resolvedRole === "participant") {
        if (hasNameConflict(room, nameKey, socket.id)) {
          ack({
            status: "name-taken",
            error: "This name is already in use in the room. Please choose a unique name.",
          });
          return;
        }

        room.pending.set(socket.id, {
          name: normalizedName,
          requestedAt: Date.now(),
        });

        socket.data.pendingRoomId = normalizedRoomId;
        socket.data.roomId = null;
        socket.data.role = "participant";

        socket.emit("room-entry-waiting", {
          roomId: normalizedRoomId,
          hostName: room.hostName,
          hostOnline: Boolean(room.hostSocketId && io.sockets.sockets.get(room.hostSocketId)),
        });

        emitPendingRequests(io, room);

        ack({
          status: "waiting",
          role: "participant",
          hostName: room.hostName,
        });
        return;
      }

      if (room.hostSocketId && room.hostSocketId !== socket.id) {
        const previousHostSocketId = room.hostSocketId;
        const previousHostSocket = io.sockets.sockets.get(previousHostSocketId);

        if (previousHostSocket) {
          previousHostSocket.emit("room-entry-revoked", {
            reason: "Host session moved to a new tab/window.",
          });
          previousHostSocket.leave(normalizedRoomId);
          previousHostSocket.data.roomId = null;
          previousHostSocket.data.role = null;
        }

        room.members.delete(previousHostSocketId);
        io.to(normalizedRoomId).emit("peer-left", previousHostSocketId);
      }

      joinAdmittedSocket({
        io,
        socket,
        roomId: normalizedRoomId,
        room,
        name: normalizedName,
        role: "host",
      });

      ack({
        status: "joined",
        role: "host",
      });
    });

    socket.on("admit-participant", (payload = {}, callback = () => {}) => {
      const ack = typeof callback === "function" ? callback : () => {};
      const normalizedRoomId = normalizeRoomId(payload.roomId);
      const targetSocketId = typeof payload.socketId === "string" ? payload.socketId : "";

      if (!normalizedRoomId || !targetSocketId) {
        ack({ ok: false, error: "Invalid participant admission request." });
        return;
      }

      const room = rooms.get(normalizedRoomId);
      if (!room) {
        ack({ ok: false, error: "Meeting room no longer exists." });
        return;
      }

      if (room.hostSocketId !== socket.id) {
        ack({ ok: false, error: "Only the host can admit participants." });
        return;
      }

      const pendingRequest = room.pending.get(targetSocketId);
      if (!pendingRequest) {
        emitPendingRequests(io, room);
        ack({ ok: false, error: "This participant is no longer waiting." });
        return;
      }

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) {
        room.pending.delete(targetSocketId);
        emitPendingRequests(io, room);
        ack({ ok: false, error: "This participant disconnected." });
        return;
      }

      const nameKey = getNameKey(pendingRequest.name);
      if (hasNameConflict(room, nameKey, targetSocketId)) {
        room.pending.delete(targetSocketId);
        targetSocket.emit("room-entry-denied", {
          reason: "Your name conflicts with someone already in the room.",
        });
        emitPendingRequests(io, room);
        ack({ ok: false, error: "Participant name is no longer unique." });
        return;
      }

      joinAdmittedSocket({
        io,
        socket: targetSocket,
        roomId: normalizedRoomId,
        room,
        name: pendingRequest.name,
        role: "participant",
      });

      ack({ ok: true });
    });

    socket.on("end-meeting", (payload = {}, callback = () => {}) => {
      const ack = typeof callback === "function" ? callback : () => {};
      const normalizedRoomId = normalizeRoomId(payload.roomId);

      if (!normalizedRoomId) {
        ack({ ok: false, error: "Invalid meeting room." });
        return;
      }

      const room = rooms.get(normalizedRoomId);
      if (!room) {
        ack({ ok: false, error: "Meeting room no longer exists." });
        return;
      }

      if (room.hostSocketId !== socket.id) {
        ack({ ok: false, error: "Only the host can end the meeting." });
        return;
      }

      endMeetingForAll({
        io,
        roomId: normalizedRoomId,
        room,
        endedBySocketId: socket.id,
      });

      ack({ ok: true });
    });

    socket.on("leave-room", ({ roomId } = {}) => {
      const normalizedRoomId =
        normalizeRoomId(roomId) || socket.data.roomId || socket.data.pendingRoomId || null;
      if (!normalizedRoomId) return;

      const room = rooms.get(normalizedRoomId);
      if (!room) return;

      if (socket.data.pendingRoomId === normalizedRoomId) {
        removePendingRequest(io, normalizedRoomId, room, socket.id);
        socket.data.pendingRoomId = null;
      }

      if (socket.data.roomId === normalizedRoomId) {
        socket.leave(normalizedRoomId);
        removeMember(io, normalizedRoomId, room, socket.id);
        socket.data.roomId = null;
      }

      socket.data.role = null;
    });

    socket.on("offer", ({ to, sdp }) => {
      if (!to || !sdp) return;
      io.to(to).emit("offer", { from: socket.id, sdp });
    });

    socket.on("answer", ({ to, sdp }) => {
      if (!to || !sdp) return;
      io.to(to).emit("answer", { from: socket.id, sdp });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      if (!to || !candidate) return;
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    socket.on("chat-message", ({ roomId, message, name } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      if (!normalizedRoomId || !message) return;
      const room = rooms.get(normalizedRoomId);
      if (!room || !room.members.has(socket.id)) return;
      io.to(normalizedRoomId).emit("chat-message", {
        id: socket.id,
        name: name || "Guest",
        message,
        timestamp: Date.now(),
      });
    });

    socket.on("screen-share", ({ roomId, isSharing } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      if (!normalizedRoomId) return;
      const room = rooms.get(normalizedRoomId);
      if (!room || !room.members.has(socket.id)) return;

      const sharing = Boolean(isSharing);
      if (sharing) {
        room.sharerId = socket.id;
        io.to(normalizedRoomId).emit("screen-sharer", { id: socket.id });
        socket.emit("screen-sharer", { id: socket.id });
      } else if (room.sharerId === socket.id) {
        room.sharerId = null;
        io.to(normalizedRoomId).emit("screen-sharer", { id: null });
      }

      socket.to(normalizedRoomId).emit("screen-share", {
        id: socket.id,
        isSharing: sharing,
      });
    });

    socket.on("video-state", ({ roomId, videoEnabled } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      if (!normalizedRoomId || typeof videoEnabled !== "boolean") return;
      const room = rooms.get(normalizedRoomId);
      if (!room || !room.members.has(socket.id)) return;
      socket.to(normalizedRoomId).emit("peer-video-state", {
        peerId: socket.id,
        videoEnabled,
      });
    });

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          removeMember(io, roomId, room, socket.id);
        }
      }

      const pendingRoomId = socket.data.pendingRoomId;
      if (pendingRoomId) {
        const room = rooms.get(pendingRoomId);
        if (room) {
          removePendingRequest(io, pendingRoomId, room, socket.id);
        }
      }
    });
  });
};
