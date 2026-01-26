"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/app/hooks/useChat";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (message: string) => void;
};

export const ChatPanel = ({ messages, onSend }: ChatPanelProps) => {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col bg-zinc-900 p-4">
      <div className="mb-3 text-sm font-semibold text-zinc-100">Chat</div>
      <div className="flex-1 space-y-3 overflow-y-auto text-sm text-zinc-200">
        {messages.length === 0 ? (
          <div className="text-zinc-500">No messages yet.</div>
        ) : (
          messages.map((message) => (
            <div key={`${message.timestamp}-${message.id}`}>
              <div className="text-xs text-zinc-400">{message.name}</div>
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                {message.message}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSend();
            }
          }}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
        />
        <button
          onClick={handleSend}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
        >
          Send
        </button>
      </div>
    </div>
  );
};
