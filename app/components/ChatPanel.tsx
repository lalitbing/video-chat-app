"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import type { ChatMessage } from "@/app/hooks/useChat";
import { ChatIcon, SendIcon } from "@/app/icons";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  /** Session id of the local user, to tell own messages apart. */
  selfId: string | null;
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const ChatPanel = ({ messages, onSend, selfId }: ChatPanelProps) => {
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-[#8fb8ff]">
              <ChatIcon className="h-6 w-6" />
            </span>
            <div className="mt-4 text-sm font-semibold text-ink">No messages yet</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Drop a link or say hi. Messages are only visible to people in the call.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {messages.map((message, index) => {
              const isOwn = selfId !== null && message.id === selfId;
              const previous = messages[index - 1];
              const startsGroup = !previous || previous.id !== message.id;

              return (
                <div
                  key={`${message.timestamp}-${message.id}-${index}`}
                  className={`flex animate-pop-in items-end gap-2.5 ${isOwn ? "justify-end" : ""} ${
                    startsGroup ? "mt-3 first:mt-0" : ""
                  }`}
                >
                  {!isOwn ? (
                    <span className="w-8 shrink-0">
                      {startsGroup ? <Avatar name={message.name} size="sm" /> : null}
                    </span>
                  ) : null}
                  <div className={`flex max-w-[80%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    {startsGroup ? (
                      <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-muted">
                        <span className="font-semibold text-ink/80">{isOwn ? "You" : message.name}</span>
                        <span>{formatTime(message.timestamp)}</span>
                      </div>
                    ) : null}
                    <div
                      className={`whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed ${
                        isOwn
                          ? "rounded-2xl rounded-br-md bg-accent text-white"
                          : "rounded-2xl rounded-bl-md bg-raised text-ink"
                      }`}
                    >
                      {message.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-line p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSend();
            }
          }}
          placeholder="Type a message..."
          aria-label="Message"
          className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-ink outline-none ring-1 ring-white/5 transition placeholder:text-faint focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          title="Send"
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent-strong disabled:bg-white/[0.06] disabled:text-faint"
        >
          <SendIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
};
