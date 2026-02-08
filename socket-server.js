/**
 * Standalone Socket.io server for Railway (or any Node host).
 * Deploy this separately from the Next.js frontend; frontend connects via NEXT_PUBLIC_SOCKET_URL.
 */
const { createServer } = require("http");
const { Server } = require("socket.io");
const setupSocket = require("./server/socket");

const port = Number(process.env.PORT) || 3001;
const corsOrigin = process.env.CORS_ORIGIN || "*";
const allowedOrigins =
  corsOrigin === "*"
    ? "*"
    : corsOrigin.split(",").map((o) => o.trim()).filter(Boolean);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Socket server OK");
});

const io = new Server(httpServer, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: false,
  },
});

setupSocket(io);

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Socket server ready on port ${port} (CORS: ${corsOrigin})`);
});
