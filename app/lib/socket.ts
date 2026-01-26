import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

const getSocketUrl = (): string | undefined => {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL;
  return url && url.trim() ? url.trim() : undefined;
};

export const getSocket = () => {
  if (!socket) {
    const url = getSocketUrl();
    socket = io(url, {
      path: "/socket.io",
    });
  }
  return socket;
};
