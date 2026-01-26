"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/app/lib/socket";

export type ChatMessage = {
  id: string;
  name: string;
  message: string;
  timestamp: number;
};

export const useChat = (roomId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!roomId) return;
    setMessages([]);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    const handler = (payload: ChatMessage) => {
      setMessages((prev) => [...prev, payload]);
    };
    socket.on("chat-message", handler);
    return () => {
      socket.off("chat-message", handler);
    };
  }, [roomId]);

  const sendMessage = useCallback(
    (message: string, name?: string) => {
      if (!roomId || !message.trim()) return;
      const socket = getSocket();
      socket.emit("chat-message", { roomId, message: message.trim(), name });
    },
    [roomId]
  );

  return { messages, sendMessage };
};
