"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/app/lib/socket";

export type ChatMessage = {
  id: string;
  name: string;
  message: string;
  timestamp: number;
};

type UseChatOptions = {
  onIncomingMessage?: (message: ChatMessage) => void;
};

export const useChat = (roomId: string | null, options: UseChatOptions = {}) => {
  const { onIncomingMessage } = options;
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const messages = roomId ? (messagesByRoom[roomId] ?? []) : [];

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    const roomKey = roomId;
    const handler = (payload: ChatMessage) => {
      setMessagesByRoom((prev) => {
        const roomMessages = prev[roomKey] ?? [];
        return {
          ...prev,
          [roomKey]: [...roomMessages, payload],
        };
      });
      if (payload.id !== socket.id) {
        onIncomingMessage?.(payload);
      }
    };
    socket.on("chat-message", handler);
    return () => {
      socket.off("chat-message", handler);
    };
  }, [onIncomingMessage, roomId]);

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
