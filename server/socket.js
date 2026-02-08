const rooms = new Map();
const roomSharer = new Map();
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

const roomExists = (roomId) => {
  const room = rooms.get(roomId);
  return Boolean(room && room.size > 0);
};

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  return rooms.get(roomId);
};

const removeFromRoom = (roomId, socketId) => {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(socketId);
  if (room.size === 0) {
    rooms.delete(roomId);
    roomSharer.delete(roomId);
  }
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

    socket.on("join-room", ({ roomId, name } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      if (!normalizedRoomId) return;
      socket.data.roomId = normalizedRoomId;
      socket.data.name = name || "Guest";
      socket.join(normalizedRoomId);

      const room = getRoom(normalizedRoomId);
      room.add(socket.id);

      const peers = Array.from(room)
        .filter((id) => id !== socket.id)
        .map((id) => ({
          id,
          name: io.sockets.sockets.get(id)?.data?.name || "Guest",
        }));
      socket.emit("peers", peers);
      const currentSharer = roomSharer.get(normalizedRoomId) ?? null;
      socket.emit("screen-sharer", { id: currentSharer });
      socket.to(normalizedRoomId).emit("peer-joined", {
        id: socket.id,
        name: socket.data.name,
      });
    });

    socket.on("leave-room", ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      if (!normalizedRoomId) return;
      if (roomSharer.get(normalizedRoomId) === socket.id) {
        roomSharer.delete(normalizedRoomId);
        io.to(normalizedRoomId).emit("screen-sharer", { id: null });
      }
      socket.leave(normalizedRoomId);
      removeFromRoom(normalizedRoomId, socket.id);
      socket.to(normalizedRoomId).emit("peer-left", socket.id);
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
      const sharing = Boolean(isSharing);
      if (sharing) {
        roomSharer.set(normalizedRoomId, socket.id);
        io.to(normalizedRoomId).emit("screen-sharer", { id: socket.id });
        socket.emit("screen-sharer", { id: socket.id });
      } else {
        if (roomSharer.get(normalizedRoomId) === socket.id) {
          roomSharer.delete(normalizedRoomId);
          io.to(normalizedRoomId).emit("screen-sharer", { id: null });
        }
      }
      socket.to(normalizedRoomId).emit("screen-share", {
        id: socket.id,
        isSharing: sharing,
      });
    });

    socket.on("video-state", ({ roomId, videoEnabled } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      if (!normalizedRoomId || typeof videoEnabled !== "boolean") return;
      socket.to(normalizedRoomId).emit("peer-video-state", {
        peerId: socket.id,
        videoEnabled,
      });
    });

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (roomSharer.get(roomId) === socket.id) {
        roomSharer.delete(roomId);
        io.to(roomId).emit("screen-sharer", { id: null });
      }
      removeFromRoom(roomId, socket.id);
      socket.to(roomId).emit("peer-left", socket.id);
    });
  });
};
