"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import { BrandMark } from "@/app/components/ui/BrandMark";
import { ChatIcon, CheckIcon, CopyIcon, LinkIcon, ParticipantsIcon } from "@/app/icons";
import { getFocusableElements, trapTabWithinContainer } from "@/app/lib/focus";

type RoomHeaderProps = {
  roomId: string;
  hostName: string;
  participantCount: number;
  userName: string;
  isHost: boolean;
  isRecording: boolean;
  isChatOpen: boolean;
  unreadMessageCount: number;
  isParticipantsOpen: boolean;
  pendingParticipantCount: number;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
};

const formatElapsed = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

const useElapsedSeconds = () => {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  return elapsed;
};

const toggleButtonClass = (isActive: boolean) =>
  `relative flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition sm:px-4 ${
    isActive
      ? "bg-accent text-white shadow-[0_10px_24px_-10px_rgba(47,123,246,0.9)]"
      : "bg-white/[0.06] text-ink ring-1 ring-white/10 hover:bg-white/10"
  }`;

const CountBadge = ({ count, tone }: { count: number; tone: "accent" | "danger" }) =>
  count > 0 ? (
    <span
      className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-shell ${
        tone === "danger" ? "bg-danger" : "bg-accent"
      }`}
    >
      {count > 9 ? "9+" : count}
    </span>
  ) : null;

export const RoomHeader = ({
  roomId,
  hostName,
  participantCount,
  userName,
  isHost,
  isRecording,
  isChatOpen,
  unreadMessageCount,
  isParticipantsOpen,
  pendingParticipantCount,
  onToggleChat,
  onToggleParticipants,
}: RoomHeaderProps) => {
  const [isRoomPopoverOpen, setIsRoomPopoverOpen] = useState(false);
  const [isRoomLinkCopied, setIsRoomLinkCopied] = useState(false);
  const roomShareRef = useRef<HTMLDivElement | null>(null);
  const roomPopoverRef = useRef<HTMLDivElement | null>(null);
  const elapsedSeconds = useElapsedSeconds();

  useEffect(() => {
    if (!isRoomPopoverOpen) return;

    const focusTimer = window.setTimeout(() => {
      const focusableElements = getFocusableElements(roomPopoverRef.current);
      focusableElements[0]?.focus();
    }, 0);

    const handlePointerDown = (event: MouseEvent) => {
      if (!roomShareRef.current?.contains(event.target as Node)) {
        setIsRoomPopoverOpen(false);
        setIsRoomLinkCopied(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsRoomPopoverOpen(false);
        setIsRoomLinkCopied(false);
        return;
      }

      trapTabWithinContainer(event, roomPopoverRef.current);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRoomPopoverOpen]);

  useEffect(() => {
    if (!isRoomLinkCopied) return;
    const timeout = window.setTimeout(() => {
      setIsRoomLinkCopied(false);
    }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isRoomLinkCopied]);

  const getRoomShareLink = () => {
    if (typeof window === "undefined") return `/room/${roomId}`;
    return `${window.location.origin}/room/${roomId}`;
  };

  const handleCopyRoomLink = async () => {
    const link = getRoomShareLink();

    try {
      await navigator.clipboard.writeText(link);
      setIsRoomLinkCopied(true);
      return;
    } catch {
      // Fallback for browsers that block clipboard API.
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setIsRoomLinkCopied(true);
    } catch {
      // Ignore copy failures.
    }
  };

  const subtitle = isHost ? "You're hosting" : hostName ? `Hosted by ${hostName}` : "In call";

  return (
    <header className="flex items-center gap-3 px-3 py-3 sm:px-5 sm:py-4">
      <div className="hidden md:block">
        <BrandMark compact />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-lg font-bold tracking-tight text-ink sm:text-xl">
            Room <span className="font-mono">{roomId}</span>
          </h1>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {formatElapsed(elapsedSeconds)}
          </span>
          {isRecording ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#ff8a8e] ring-1 ring-danger/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
              Rec
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted sm:text-[13px]">
          {subtitle} · {participantCount} {participantCount === 1 ? "person" : "people"}
        </p>
      </div>

      <div ref={roomShareRef} className="relative">
        <button
          onClick={() => {
            setIsRoomLinkCopied(false);
            setIsRoomPopoverOpen((current) => !current);
          }}
          title="Share room link"
          aria-haspopup="dialog"
          aria-expanded={isRoomPopoverOpen}
          className={toggleButtonClass(isRoomPopoverOpen)}
        >
          <LinkIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Invite</span>
        </button>
        {isRoomPopoverOpen ? (
          <div
            ref={roomPopoverRef}
            role="dialog"
            aria-modal="true"
            aria-label="Share room link"
            className="fixed inset-x-3 top-16 z-40 animate-pop-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[22rem] rounded-2xl bg-panel p-4 text-ink shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
          >
            <div className="text-sm font-bold">Invite people</div>
            <p className="mt-1 text-xs text-muted">
              Anyone with this link can ask to join room {roomId}.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-raised p-1.5 pl-3 ring-1 ring-white/5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink/80">
                {getRoomShareLink()}
              </span>
              <button
                onClick={handleCopyRoomLink}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
                  isRoomLinkCopied
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-accent text-white hover:bg-accent-strong"
                }`}
              >
                {isRoomLinkCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                {isRoomLinkCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <button
        onClick={onToggleParticipants}
        title="Participants"
        aria-pressed={isParticipantsOpen}
        className={toggleButtonClass(isParticipantsOpen)}
      >
        <ParticipantsIcon className="h-4 w-4" />
        <span className="hidden lg:inline">People</span>
        <CountBadge count={pendingParticipantCount} tone="danger" />
      </button>

      <button
        onClick={onToggleChat}
        title="Chat"
        aria-pressed={isChatOpen}
        className={toggleButtonClass(isChatOpen)}
      >
        <ChatIcon className="h-4 w-4" />
        <span className="hidden lg:inline">Chat</span>
        <CountBadge count={unreadMessageCount} tone="accent" />
      </button>

      <div className="hidden items-center gap-2 rounded-full bg-white/[0.04] py-1 pl-1 pr-3 ring-1 ring-white/10 sm:flex">
        <Avatar name={userName} size="sm" />
        <span className="max-w-[8rem] truncate text-sm font-semibold text-ink">{userName}</span>
      </div>
    </header>
  );
};
