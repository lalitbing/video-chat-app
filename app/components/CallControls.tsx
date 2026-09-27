"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ConfirmDialog,
  DialogBackdrop,
  dialogDangerButtonClass,
  dialogPanelClass,
  dialogSecondaryButtonClass,
} from "@/app/components/ConfirmDialog";
import type { MediaDeviceOption } from "@/app/hooks/useWebRTC";
import {
  CheckIcon,
  ChevronDownIcon,
  EndCallIcon,
  MicIcon,
  MicOffIcon,
  RecordIcon,
  ScreenShareIcon,
  VideoOffIcon,
  VideoOnIcon,
} from "@/app/icons";
import { getFocusableElements, trapTabWithinContainer } from "@/app/lib/focus";

type CallControlsProps = {
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
  isHost: boolean;
  isEndingMeeting?: boolean;
  onLeaveMeeting: () => void;
  onEndMeeting: () => void;
};

type ConfirmAction = "stop-share" | "leave-call" | null;

const roundButton =
  "flex h-11 w-11 items-center justify-center rounded-full transition sm:h-12 sm:w-12";
const glassButton = "bg-white/10 text-white hover:bg-white/20";
// "Off" states (muted, camera off) flip to solid white so they're obvious at a glance.
const offButton = "bg-white text-[#0d1420] hover:bg-white/90";

export const CallControls = ({
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
  isHost,
  isEndingMeeting = false,
  onLeaveMeeting,
  onEndMeeting,
}: CallControlsProps) => {
  const [openDeviceMenu, setOpenDeviceMenu] = useState<"audio" | "video" | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isLeaveOptionsOpen, setIsLeaveOptionsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const audioMenuRef = useRef<HTMLDivElement | null>(null);
  const videoMenuRef = useRef<HTMLDivElement | null>(null);
  const leaveDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openDeviceMenu) return;
    const activeMenuRef = openDeviceMenu === "audio" ? audioMenuRef : videoMenuRef;

    const focusTimer = window.setTimeout(() => {
      const focusableElements = getFocusableElements(activeMenuRef.current);
      focusableElements[0]?.focus();
    }, 0);

    const handlePointerDown = (event: MouseEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setOpenDeviceMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenDeviceMenu(null);
        return;
      }

      trapTabWithinContainer(event, activeMenuRef.current);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDeviceMenu]);

  useEffect(() => {
    if (!isLeaveOptionsOpen) return;

    // Start on Cancel so a stray Enter can't end the meeting for everyone.
    const focusTimer = window.setTimeout(() => {
      const cancelButton = leaveDialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      (cancelButton ?? getFocusableElements(leaveDialogRef.current)[0])?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsLeaveOptionsOpen(false);
        return;
      }

      trapTabWithinContainer(event, leaveDialogRef.current);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLeaveOptionsOpen]);

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
          icon: <ScreenShareIcon className="h-5 w-5" />,
        }
      : confirmAction === "leave-call"
        ? {
            title: "Leave this call?",
            description: "You will disconnect from this meeting.",
            confirmLabel: "Leave call",
            icon: <EndCallIcon className="h-5 w-5" />,
          }
        : null;

  const renderDeviceMenu = (
    kind: "audio" | "video",
    devices: MediaDeviceOption[],
    selectedId: string,
    onSelect: (deviceId: string) => void
  ) => (
    <div
      ref={kind === "audio" ? audioMenuRef : videoMenuRef}
      role="menu"
      aria-label={kind === "audio" ? "Microphone devices" : "Camera devices"}
      className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-pop-in overflow-hidden rounded-2xl bg-panel text-ink shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {kind === "audio" ? <MicIcon className="h-3.5 w-3.5" /> : <VideoOnIcon className="h-3.5 w-3.5" />}
        {kind === "audio" ? "Microphone" : "Camera"}
      </div>
      <div className="max-h-60 overflow-y-auto p-1.5">
        {devices.map((device) => {
          const isSelected = selectedId === device.deviceId;
          return (
            <button
              key={device.deviceId}
              role="menuitem"
              onClick={() => {
                onSelect(device.deviceId);
                setOpenDeviceMenu(null);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                isSelected ? "bg-accent-soft text-white" : "text-ink/85 hover:bg-white/5"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{device.label}</span>
              {isSelected ? <CheckIcon className="h-4 w-4 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSplitControl = (
    kind: "audio" | "video",
    isOff: boolean,
    onToggle: () => void,
    toggleTitle: string,
    icon: ReactNode,
    hasDevices: boolean,
    devices: MediaDeviceOption[],
    selectedId: string,
    onSelect: (deviceId: string) => void
  ) => (
    <div className="relative">
      <div
        className={`flex h-11 items-center overflow-hidden rounded-full transition sm:h-12 ${
          isOff ? offButton : "bg-white/10 text-white"
        }`}
      >
        <button
          onClick={onToggle}
          title={toggleTitle}
          aria-label={toggleTitle}
          aria-pressed={isOff}
          className={`flex h-full w-11 items-center justify-center transition sm:w-12 ${
            isOff ? "hover:bg-black/5" : "hover:bg-white/10"
          }`}
        >
          {icon}
        </button>
        <button
          onClick={() => toggleMenu(kind)}
          title={kind === "audio" ? "Select microphone" : "Select camera"}
          aria-label={kind === "audio" ? "Select microphone" : "Select camera"}
          aria-haspopup="menu"
          aria-expanded={openDeviceMenu === kind}
          disabled={!hasDevices}
          className={`flex h-full w-7 items-center justify-center pr-1 transition disabled:opacity-40 ${
            isOff ? "hover:bg-black/5" : "hover:bg-white/10"
          } ${openDeviceMenu === kind ? (isOff ? "bg-black/5" : "bg-white/10") : ""}`}
        >
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${openDeviceMenu === kind ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {openDeviceMenu === kind ? renderDeviceMenu(kind, devices, selectedId, onSelect) : null}
    </div>
  );

  return (
    <>
      {confirmDialog ? (
        <ConfirmDialog
          isOpen
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          icon={confirmDialog.icon}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      ) : null}

      {isLeaveOptionsOpen ? (
        <DialogBackdrop onDismiss={() => setIsLeaveOptionsOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="host-leave-dialog-title"
            ref={leaveDialogRef}
            className={dialogPanelClass}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger/15 text-[#ff8a8e]">
              <EndCallIcon className="h-5 w-5" />
            </span>
            <h2 id="host-leave-dialog-title" className="mt-4 text-lg font-bold tracking-tight text-ink">
              Leave or end meeting?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Leaving keeps the meeting active for others. Ending closes it for everyone.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => {
                  setIsLeaveOptionsOpen(false);
                  onEndMeeting();
                }}
                disabled={isEndingMeeting}
                className={dialogDangerButtonClass}
              >
                {isEndingMeeting ? "Ending..." : "End meeting for everyone"}
              </button>
              <button
                onClick={() => {
                  setIsLeaveOptionsOpen(false);
                  onLeaveMeeting();
                }}
                className={dialogSecondaryButtonClass}
              >
                Leave meeting
              </button>
              <button
                data-autofocus
                onClick={() => setIsLeaveOptionsOpen(false)}
                className="h-10 rounded-2xl text-sm font-semibold text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      <div
        ref={controlsRef}
        className="glass flex items-center gap-1.5 rounded-full p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/10 sm:gap-2 sm:p-2"
      >
        {renderSplitControl(
          "audio",
          isMuted,
          onToggleMute,
          isMuted ? "Unmute" : "Mute",
          isMuted ? <MicOffIcon /> : <MicIcon />,
          hasAudioInputs,
          audioInputDevices,
          selectedAudioInputId,
          onSelectAudioInput
        )}

        {renderSplitControl(
          "video",
          !isVideoEnabled,
          onToggleVideo,
          isVideoEnabled ? "Turn off video" : "Turn on video",
          isVideoEnabled ? <VideoOnIcon /> : <VideoOffIcon />,
          hasVideoInputs,
          videoInputDevices,
          selectedVideoInputId,
          onSelectVideoInput
        )}

        <button
          onClick={handleToggleScreenShare}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
          aria-label={isScreenSharing ? "Stop sharing" : "Share screen"}
          aria-pressed={isScreenSharing}
          className={`${roundButton} ${
            isScreenSharing ? "bg-accent text-white hover:bg-accent-strong" : glassButton
          }`}
        >
          <ScreenShareIcon />
        </button>
        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          title={isRecording ? "Stop recording" : "Record"}
          aria-label={isRecording ? "Stop recording" : "Record"}
          aria-pressed={isRecording}
          className={`${roundButton} ${
            isRecording ? "bg-danger/20 text-[#ff8a8e] ring-1 ring-danger/50" : glassButton
          }`}
        >
          <RecordIcon className={`h-5 w-5 ${isRecording ? "animate-pulse" : ""}`} />
        </button>

        <span className="mx-0.5 h-7 w-px bg-white/10" aria-hidden />

        <button
          onClick={handleEndCall}
          title="End call"
          aria-label="End call"
          className="flex h-11 w-14 items-center justify-center rounded-full bg-danger text-white shadow-[0_10px_24px_-8px_rgba(229,72,77,0.9)] transition hover:bg-danger-strong sm:h-12 sm:w-16"
        >
          <EndCallIcon />
        </button>
      </div>
    </>
  );
};
