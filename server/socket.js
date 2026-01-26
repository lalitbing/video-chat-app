const rooms = new Map();
const roomSharer = new Map();

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
    socket.on("join-room", ({ roomId, name }) => {
      if (!roomId) return;
      socket.data.roomId = roomId;
      socket.data.name = name || "Guest";
      socket.join(roomId);

      const room = getRoom(roomId);
      room.add(socket.id);

      const peers = Array.from(room)
        .filter((id) => id !== socket.id)
        .map((id) => ({
          id,
          name: io.sockets.sockets.get(id)?.data?.name || "Guest",
        }));
      socket.emit("peers", peers);
      const currentSharer = roomSharer.get(roomId) ?? null;
      socket.emit("screen-sharer", { id: currentSharer });
      socket.to(roomId).emit("peer-joined", {
        id: socket.id,
        name: socket.data.name,
      });
    });

    socket.on("leave-room", ({ roomId }) => {
      if (!roomId) return;
      if (roomSharer.get(roomId) === socket.id) {
        roomSharer.delete(roomId);
        io.to(roomId).emit("screen-sharer", { id: null });
      }
      socket.leave(roomId);
      removeFromRoom(roomId, socket.id);
      socket.to(roomId).emit("peer-left", socket.id);
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

    socket.on("chat-message", ({ roomId, message, name }) => {
      if (!roomId || !message) return;
      io.to(roomId).emit("chat-message", {
        id: socket.id,
        name: name || "Guest",
        message,
        timestamp: Date.now(),
      });
    });

    socket.on("screen-share", ({ roomId, isSharing }) => {
      if (!roomId) return;
      const sharing = Boolean(isSharing);
      if (sharing) {
        roomSharer.set(roomId, socket.id);
        io.to(roomId).emit("screen-sharer", { id: socket.id });
        socket.emit("screen-sharer", { id: socket.id });
      } else {
        if (roomSharer.get(roomId) === socket.id) {
          roomSharer.delete(roomId);
          io.to(roomId).emit("screen-sharer", { id: null });
        }
      }
      socket.to(roomId).emit("screen-share", {
        id: socket.id,
        isSharing: sharing,
      });
    });

    socket.on("video-state", ({ roomId, videoEnabled }) => {
      if (!roomId || typeof videoEnabled !== "boolean") return;
      socket.to(roomId).emit("peer-video-state", {
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
