"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChatIcon,
  EndCallIcon,
  MicIcon,
  MicOffIcon,
  ParticipantsIcon,
  RecordIcon,
  ScreenShareIcon,
  VideoOffIcon,
  VideoOnIcon,
} from "@/app/icons";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import type { MediaDeviceOption } from "@/app/hooks/useWebRTC";

type BottomBarProps = {
  roomId: string;
  isMuted: boolean;
  onToggleMute: () => void;
  audioInputDevices: MediaDeviceOption[];
  selectedAudioInputId: string;
  onSelectAudioInput: (deviceId: string) => void;
  isVideoEnabled: boolean;
  onToggleVideo: () => void;
  videoInputDevices: MediaDeviceOption[];
  selectedVideoInputId: string;
  onSelectVideoInput: (deviceId: string) => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isChatOpen: boolean;
  hasUnreadMessages: boolean;
  isParticipantsOpen: boolean;
  hasPendingParticipants: boolean;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  isHost: boolean;
  isEndingMeeting?: boolean;
  onLeaveMeeting: () => void;
  onEndMeeting: () => void;
};

type ConfirmAction = "stop-share" | "leave-call" | null;

export const BottomBar = ({
  roomId,
  isMuted,
  onToggleMute,
  audioInputDevices,
  selectedAudioInputId,
  onSelectAudioInput,
  isVideoEnabled,
  onToggleVideo,
  videoInputDevices,
  selectedVideoInputId,
  onSelectVideoInput,
  isScreenSharing,
  onToggleScreenShare,
  isRecording,
  onStartRecording,
  onStopRecording,
  isChatOpen,
  hasUnreadMessages,
  isParticipantsOpen,
  hasPendingParticipants,
  onToggleParticipants,
  onToggleChat,
  isHost,
  isEndingMeeting = false,
  onLeaveMeeting,
  onEndMeeting,
}: BottomBarProps) => {
  const [openDeviceMenu, setOpenDeviceMenu] = useState<"audio" | "video" | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isLeaveOptionsOpen, setIsLeaveOptionsOpen] = useState(false);
  const [isRoomPopoverOpen, setIsRoomPopoverOpen] = useState(false);
  const [isRoomLinkCopied, setIsRoomLinkCopied] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const roomShareRef = useRef<HTMLDivElement | null>(null);
  const controlButton =
    "flex h-12 w-12 items-center justify-center rounded-full transition";
  const splitControl = "flex h-12 overflow-hidden rounded-full";
  const splitButton = "flex h-12 w-12 items-center justify-center transition";
  const splitToggleButton =
    "flex h-12 w-8 items-center justify-center border-l border-white/10 transition";
  const neutralBtn =
    "bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600";
  const activeBtn = "bg-white text-zinc-900";
  const dangerBtn = "bg-red-500 text-white hover:bg-red-600";
  const menuButton = "w-full rounded-lg px-3 py-2 text-left text-sm transition";

  useEffect(() => {
    if (!openDeviceMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setOpenDeviceMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDeviceMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openDeviceMenu]);

  useEffect(() => {
    if (!isRoomPopoverOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!roomShareRef.current?.contains(event.target as Node)) {
        setIsRoomPopoverOpen(false);
        setIsRoomLinkCopied(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsRoomPopoverOpen(false);
        setIsRoomLinkCopied(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isRoomPopoverOpen]);

  useEffect(() => {
    if (!isLeaveOptionsOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLeaveOptionsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isLeaveOptionsOpen]);

  useEffect(() => {
    if (!isRoomLinkCopied) return;
    const timeout = window.setTimeout(() => {
      setIsRoomLinkCopied(false);
    }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isRoomLinkCopied]);

  const hasAudioInputs = audioInputDevices.length > 0;
  const hasVideoInputs = videoInputDevices.length > 0;

  const toggleMenu = (menu: "audio" | "video") => {
    setOpenDeviceMenu((current) => (current === menu ? null : menu));
  };

  const handleToggleScreenShare = () => {
    if (isScreenSharing) {
      setOpenDeviceMenu(null);
      setConfirmAction("stop-share");
      return;
    }
    onToggleScreenShare();
  };

  const handleEndCall = () => {
    setOpenDeviceMenu(null);
    if (isHost) {
      setIsLeaveOptionsOpen(true);
      return;
    }
    setConfirmAction("leave-call");
  };

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

  const handleConfirmAction = () => {
    if (confirmAction === "stop-share") {
      onToggleScreenShare();
    } else if (confirmAction === "leave-call") {
      onLeaveMeeting();
    }
    setConfirmAction(null);
  };

  const confirmDialog =
    confirmAction === "stop-share"
      ? {
          title: "Stop screen sharing?",
          description: "Participants will no longer see your shared screen.",
          confirmLabel: "Stop sharing",
          confirmButtonClass: "bg-red-500 text-white hover:bg-red-600",
        }
      : confirmAction === "leave-call"
        ? {
            title: "Leave this call?",
            description: "You will disconnect from this meeting.",
            confirmLabel: "Leave call",
            confirmButtonClass: "bg-red-500 text-white hover:bg-red-600",
          }
        : null;

  return (
    <>
      {confirmDialog ? (
        <ConfirmDialog
          isOpen
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          confirmButtonClassName={confirmDialog.confirmButtonClass}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      ) : null}

      {isLeaveOptionsOpen ? (
        <div
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/65 px-4"
          onClick={() => setIsLeaveOptionsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="host-leave-dialog-title"
            className="w-full max-w-sm cursor-default rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="host-leave-dialog-title" className="text-lg font-semibold text-white">
              Leave or end meeting?
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              Leaving keeps the meeting active for others. Ending closes it for everyone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsLeaveOptionsOpen(false)}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsLeaveOptionsOpen(false);
                  onLeaveMeeting();
                }}
                className="rounded-lg border border-zinc-500 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
              >
                Leave meeting
              </button>
              <button
                onClick={() => {
                  setIsLeaveOptionsOpen(false);
                  onEndMeeting();
                }}
                disabled={isEndingMeeting}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEndingMeeting ? "Ending..." : "End meeting"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="flex items-center justify-between border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Left: Room ID */}
        <div ref={roomShareRef} className="relative hidden min-w-[120px] sm:block">
          <button
            onClick={() => {
              setOpenDeviceMenu(null);
              setIsRoomLinkCopied(false);
              setIsRoomPopoverOpen((current) => !current);
            }}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Room: <span className="font-medium text-zinc-900 dark:text-zinc-100">{roomId}</span>
          </button>
          {isRoomPopoverOpen ? (
            <div className="absolute bottom-12 left-0 z-30 w-80 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 shadow-xl">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Share room link
              </div>
              <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs break-all text-zinc-200">
                {getRoomShareLink()}
              </div>
              <div className="mt-3 flex items-center justify-end">
                <button
                  onClick={handleCopyRoomLink}
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200"
                >
                  {isRoomLinkCopied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Center: Controls */}
        <div ref={controlsRef} className="flex flex-1 items-center justify-center gap-3">
          <div className="relative">
            <div className={splitControl}>
              <button
                onClick={onToggleMute}
                title={isMuted ? "Unmute" : "Mute"}
                className={`${splitButton} ${isMuted ? activeBtn : neutralBtn}`}
              >
                {isMuted ? <MicOffIcon /> : <MicIcon />}
              </button>
              <button
                onClick={() => toggleMenu("audio")}
                title="Select microphone"
                aria-label="Select microphone"
                aria-haspopup="menu"
                aria-expanded={openDeviceMenu === "audio"}
                disabled={!hasAudioInputs}
                className={`${splitToggleButton} ${
                  openDeviceMenu === "audio" ? "bg-zinc-700 text-white" : neutralBtn
                } ${!hasAudioInputs ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`h-4 w-4 transition-transform ${
                    openDeviceMenu === "audio" ? "rotate-180" : ""
                  }`}
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            {openDeviceMenu === "audio" ? (
              <div className="absolute bottom-14 left-0 z-20 w-64 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-xl">
                <div className="border-b border-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Microphone
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {audioInputDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={() => {
                        onSelectAudioInput(device.deviceId);
                        setOpenDeviceMenu(null);
                      }}
                      className={`${menuButton} ${
                        selectedAudioInputId === device.deviceId
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-200 hover:bg-zinc-800"
                      }`}
                    >
                      {device.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <div className={splitControl}>
              <button
                onClick={onToggleVideo}
                title={isVideoEnabled ? "Turn off video" : "Turn on video"}
                className={`${splitButton} ${!isVideoEnabled ? activeBtn : neutralBtn}`}
              >
                {isVideoEnabled ? <VideoOnIcon /> : <VideoOffIcon />}
              </button>
              <button
                onClick={() => toggleMenu("video")}
                title="Select camera"
                aria-label="Select camera"
                aria-haspopup="menu"
                aria-expanded={openDeviceMenu === "video"}
                disabled={!hasVideoInputs}
                className={`${splitToggleButton} ${
                  openDeviceMenu === "video" ? "bg-zinc-700 text-white" : neutralBtn
                } ${!hasVideoInputs ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`h-4 w-4 transition-transform ${
                    openDeviceMenu === "video" ? "rotate-180" : ""
                  }`}
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            {openDeviceMenu === "video" ? (
              <div className="absolute bottom-14 left-0 z-20 w-64 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-xl">
                <div className="border-b border-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Camera
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {videoInputDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={() => {
                        onSelectVideoInput(device.deviceId);
                        setOpenDeviceMenu(null);
                      }}
                      className={`${menuButton} ${
                        selectedVideoInputId === device.deviceId
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-200 hover:bg-zinc-800"
                      }`}
                    >
                      {device.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <button
            onClick={handleToggleScreenShare}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
            className={`${controlButton} ${isScreenSharing ? activeBtn : neutralBtn}`}
          >
            <ScreenShareIcon />
          </button>
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            title={isRecording ? "Stop recording" : "Record"}
            className={`${controlButton} ${isRecording ? dangerBtn : neutralBtn}`}
          >
            <RecordIcon />
          </button>
          <button
            onClick={handleEndCall}
            title="End call"
            className={`${controlButton} ${dangerBtn}`}
          >
            <EndCallIcon />
          </button>
        </div>

        {/* Right: Sidebars */}
        <div className="flex min-w-[120px] justify-end gap-2">
          <button
            onClick={onToggleParticipants}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
              isParticipantsOpen
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            }`}
          >
            <span className="relative">
              <ParticipantsIcon />
              {hasPendingParticipants ? (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500"
                  aria-hidden
                />
              ) : null}
            </span>
            <span className="hidden sm:inline">Participants</span>
          </button>

          <button
            onClick={onToggleChat}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
              isChatOpen
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            }`}
          >
            <span className="relative">
              <ChatIcon />
              {hasUnreadMessages ? (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500"
                  aria-hidden
                />
              ) : null}
            </span>
            <span className="hidden sm:inline">Chat</span>
          </button>
        </div>
      </footer>
    </>
  );
};
