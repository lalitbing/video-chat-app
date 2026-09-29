"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { CallControls } from "@/app/components/CallControls";
import { ChatPanel } from "@/app/components/ChatPanel";
import { ParticipantsPanel } from "@/app/components/ParticipantsPanel";
import { RoomHeader } from "@/app/components/RoomHeader";
import { SidePanel } from "@/app/components/SidePanel";
import { Avatar } from "@/app/components/ui/Avatar";
import { BrandMark } from "@/app/components/ui/BrandMark";
import { Spinner } from "@/app/components/ui/Spinner";
import { Toast } from "@/app/components/ui/Toast";
import { VideoGrid } from "@/app/components/VideoGrid";
import { VideoTile } from "@/app/components/VideoTile";
import { useChat } from "@/app/hooks/useChat";
import { useWebRTC } from "@/app/hooks/useWebRTC";
import {
  AlertIcon,
  ArrowLeftIcon,
  MicIcon,
  MicOffIcon,
  VideoOffIcon,
  VideoOnIcon,
} from "@/app/icons";
import { consumePendingLandingLaunch } from "@/app/lib/landingLaunch";
import { getRoomConnection } from "@/app/lib/roomConnection";
import { normalizeRoomId } from "@/app/lib/room";

const ROOM_CHECK_TIMEOUT_MS = 8000;
const REDIRECT_DELAY_MS = 2500;
const HOST_END_REDIRECT_DELAY_MS = 2200;
const TOAST_AUTO_HIDE_MS = 3000;

type SidebarType = "chat" | "participants" | null;
type RoomLookupStatus = "exists" | "missing" | "error";
type LaunchOrigin = "landing" | "direct";

type RoomLookupResult = {
  roomId: string;
  status: RoomLookupStatus;
  error?: string;
};

type RoomExistsAck = {
  exists?: boolean;
  error?: string;
};

type EndMeetingAck = {
  ok?: boolean;
  error?: string;
};

type MeetingEndedPayload = {
  roomId?: string;
  hostName?: string;
};

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string | string[] }>();
  const roomParam = params?.roomId;
  const rawRoomId = decodeURIComponent(
    Array.isArray(roomParam) ? roomParam[0] ?? "" : roomParam ?? ""
  );
  const normalizedRoomId = normalizeRoomId(rawRoomId);

  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState("");
  const [joinName, setJoinName] = useState("");
  const [shouldJoin, setShouldJoin] = useState(false);
  const [activeJoinRoomId, setActiveJoinRoomId] = useState<string | null>(null);
  const [activeJoinIntent, setActiveJoinIntent] = useState<"create" | "join" | null>(null);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [roomLookupResult, setRoomLookupResult] = useState<RoomLookupResult | null>(null);
  const [launchIntent, setLaunchIntent] = useState<"create" | "join">("join");
  const [launchOrigin, setLaunchOrigin] = useState<LaunchOrigin>("direct");
  const [isLaunchBootstrapComplete, setIsLaunchBootstrapComplete] = useState(false);
  const [activeSidebar, setActiveSidebar] = useState<SidebarType>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [redirectCountdown, setRedirectCountdown] = useState(
    Math.ceil(REDIRECT_DELAY_MS / 1000)
  );
  const [toastMessage, setToastMessage] = useState("");
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);

  const isChatOpenRef = useRef(false);
  const isTabActiveRef = useRef(
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible" && document.hasFocus()
  );
  const notificationAudioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    if (typeof window === "undefined") return;
    const WindowAudioContext =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!WindowAudioContext) return;
    const audioContext = notificationAudioContextRef.current ?? new WindowAudioContext();
    notificationAudioContextRef.current = audioContext;

    void audioContext.resume().then(() => {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(960, now);
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    });
  }, []);

  const handleIncomingMessage = useCallback(() => {
    playNotificationSound();
    const shouldTreatAsRead = isChatOpenRef.current && isTabActiveRef.current;
    if (!shouldTreatAsRead) {
      setUnreadMessageCount((count) => count + 1);
    }
  }, [playNotificationSound]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const timeoutId = window.setTimeout(() => {
      const pendingLandingLaunch = normalizedRoomId
        ? consumePendingLandingLaunch(normalizedRoomId)
        : null;

      if (pendingLandingLaunch) {
        setDisplayName(pendingLandingLaunch.displayName);
        setLaunchIntent(pendingLandingLaunch.intent);
        setLaunchOrigin("landing");
      } else {
        setLaunchIntent("join");
        setLaunchOrigin("direct");
      }

      setJoinName("");
      setShouldJoin(false);
      setIsLaunchBootstrapComplete(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [normalizedRoomId]);

  useEffect(() => {
    if (!isLaunchBootstrapComplete || !normalizedRoomId || launchIntent === "create") return;

    const socket = getRoomConnection();
    socket.connect();

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setRoomLookupResult({
        roomId: normalizedRoomId,
        status: "error",
        error: "Unable to check room right now. Please try again.",
      });
    }, ROOM_CHECK_TIMEOUT_MS);

    socket.emit("room-exists", { roomId: normalizedRoomId }, (response?: RoomExistsAck) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);

      if (!response) {
        setRoomLookupResult({
          roomId: normalizedRoomId,
          status: "error",
          error: "No response from room server.",
        });
        return;
      }

      if (response.error) {
        setRoomLookupResult({
          roomId: normalizedRoomId,
          status: "error",
          error: response.error,
        });
        return;
      }

      setRoomLookupResult({
        roomId: normalizedRoomId,
        status: response.exists ? "exists" : "missing",
      });
    });

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isLaunchBootstrapComplete, joinAttempt, launchIntent, normalizedRoomId]);

  const roomLookupState = useMemo(() => {
    if (!normalizedRoomId) {
      return "missing";
    }
    if (launchIntent === "create") {
      return "exists";
    }
    if (!roomLookupResult || roomLookupResult.roomId !== normalizedRoomId) {
      return "checking";
    }
    return roomLookupResult.status;
  }, [launchIntent, normalizedRoomId, roomLookupResult]);

  const roomLookupError =
    roomLookupResult && roomLookupResult.roomId === normalizedRoomId
      ? roomLookupResult.error ?? ""
      : "";

  const canAttemptJoin =
    Boolean(normalizedRoomId && shouldJoin) &&
    (launchIntent === "create" || roomLookupState === "exists");
  const stickyRoomId =
    shouldJoin && normalizedRoomId && activeJoinRoomId === normalizedRoomId
      ? activeJoinRoomId
      : null;
  const stickyIntent =
    shouldJoin && stickyRoomId ? (activeJoinIntent ?? launchIntent) : launchIntent;
  const roomId = stickyRoomId ?? (canAttemptJoin ? normalizedRoomId : null);

  const {
    roomEntryState,
    roomEntryError,
    roomRole,
    hostName,
    participants,
    pendingParticipants,
    admittingParticipantId,
    admitParticipant,
    localStream,
    localCameraStream,
    remoteStreams,
    remoteScreenStreams,
    peerNames,
    peerVideoEnabled,
    currentSharerId,
    isLocalSharer,
    isMuted,
    audioInputDevices,
    selectedAudioInputId,
    toggleMute,
    switchAudioInput,
    isVideoEnabled,
    videoInputDevices,
    selectedVideoInputId,
    toggleVideo,
    switchVideoInput,
    isScreenSharing,
    toggleScreenShare,
    isRecording,
    startRecording,
    stopRecording,
  } = useWebRTC(roomId, joinName, {
    intent: stickyIntent,
    joinAttempt,
    enablePrejoinMedia: Boolean(normalizedRoomId),
  });

  const effectiveRoom = roomEntryState === "joined" ? normalizedRoomId : null;
  const { messages, sendMessage } = useChat(effectiveRoom, {
    onIncomingMessage: handleIncomingMessage,
  });

  useEffect(() => {
    isChatOpenRef.current = activeSidebar === "chat";
  }, [activeSidebar]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const updateTabActivity = () => {
      const isActive = document.visibilityState === "visible" && document.hasFocus();
      isTabActiveRef.current = isActive;
      if (isActive && isChatOpenRef.current) {
        setUnreadMessageCount(0);
      }
    };

    document.addEventListener("visibilitychange", updateTabActivity);
    window.addEventListener("focus", updateTabActivity);
    window.addEventListener("blur", updateTabActivity);

    return () => {
      document.removeEventListener("visibilitychange", updateTabActivity);
      window.removeEventListener("focus", updateTabActivity);
      window.removeEventListener("blur", updateTabActivity);
    };
  }, []);

  useEffect(() => {
    return () => {
      void notificationAudioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, TOAST_AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  useEffect(() => {
    if (!normalizedRoomId) return;

    const socket = getRoomConnection();
    let redirectTimer: number | null = null;

    const handleMeetingEnded = (payload: MeetingEndedPayload = {}) => {
      if (!payload.roomId || payload.roomId !== normalizedRoomId) {
        return;
      }

      setShouldJoin(false);
      setJoinName("");
      setActiveSidebar(null);
      setUnreadMessageCount(0);
      setToastMessage(
        payload.hostName
          ? `Meeting terminated by ${payload.hostName}. Redirecting to homepage...`
          : "Meeting terminated by host. Redirecting to homepage..."
      );

      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }

      redirectTimer = window.setTimeout(() => {
        router.replace("/");
      }, HOST_END_REDIRECT_DELAY_MS);
    };

    socket.on("meeting-ended", handleMeetingEnded);

    return () => {
      socket.off("meeting-ended", handleMeetingEnded);
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, [normalizedRoomId, router]);

  useEffect(() => {
    if (!isLaunchBootstrapComplete) return;
    if (!normalizedRoomId) return;
    if (launchOrigin !== "landing") return;
    if (launchIntent !== "join") return;
    if (roomLookupState !== "missing" && roomEntryState !== "room-not-found") return;

    router.replace(`/?room=${normalizedRoomId}&missing=1`);
  }, [
    isLaunchBootstrapComplete,
    launchIntent,
    launchOrigin,
    normalizedRoomId,
    roomEntryState,
    roomLookupState,
    router,
  ]);

  const shouldShowNotFoundScreen =
    !normalizedRoomId ||
    (isLaunchBootstrapComplete &&
      launchOrigin === "direct" &&
      (roomLookupState === "missing" ||
        roomEntryState === "room-not-found" ||
        roomEntryState === "invalid-room"));

  useEffect(() => {
    if (!shouldShowNotFoundScreen) return;

    const resetCountdownId = window.setTimeout(() => {
      setRedirectCountdown(Math.ceil(REDIRECT_DELAY_MS / 1000));
    }, 0);
    const timeoutId = window.setTimeout(() => {
      router.replace("/");
    }, REDIRECT_DELAY_MS);

    let remainingSeconds = Math.ceil(REDIRECT_DELAY_MS / 1000);
    const intervalId = window.setInterval(() => {
      remainingSeconds -= 1;
      setRedirectCountdown(Math.max(remainingSeconds, 0));
    }, 1000);

    return () => {
      window.clearTimeout(resetCountdownId);
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [shouldShowNotFoundScreen, router]);

  useEffect(() => {
    if (roomEntryState !== "joined") {
      if (typeof document !== "undefined") {
        document.title = "VC Meet";
      }
      return;
    }

    if (typeof document === "undefined") return;
    document.title = unreadMessageCount > 0 ? "VC meet *" : "VC meet";
  }, [roomEntryState, unreadMessageCount]);

  const participantList = useMemo(() => {
    if (participants.length > 0) {
      return participants;
    }

    if (!joinName.trim() || !roomRole) {
      return [];
    }

    return [
      {
        id: "local-participant",
        name: joinName,
        role: roomRole,
      },
    ];
  }, [joinName, participants, roomRole]);

  const handleJoin = useCallback(() => {
    if (!normalizedRoomId) return;

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError("Please enter your name to continue.");
      return;
    }

    setNameError("");
    setJoinName(trimmedName);
    setShouldJoin(true);
    setActiveJoinRoomId(normalizedRoomId);
    setActiveJoinIntent(launchIntent);
    setJoinAttempt((current) => current + 1);
  }, [displayName, launchIntent, normalizedRoomId]);

  const handleLeaveRoom = useCallback(() => {
    setShouldJoin(false);
    setJoinName("");
    setActiveJoinRoomId(null);
    setActiveJoinIntent(null);
    setActiveSidebar(null);
    setUnreadMessageCount(0);
    router.push("/");
  }, [router]);

  const handleEndMeeting = useCallback(() => {
    if (!normalizedRoomId || roomRole !== "host") {
      return;
    }

    const socket = getRoomConnection();
    setIsEndingMeeting(true);

    socket.emit("end-meeting", { roomId: normalizedRoomId }, (response?: EndMeetingAck) => {
      setIsEndingMeeting(false);

      if (response?.ok) {
        handleLeaveRoom();
        return;
      }

      setToastMessage(response?.error ?? "Unable to end the meeting right now.");
    });
  }, [handleLeaveRoom, normalizedRoomId, roomRole]);

  const openChat = () => {
    setActiveSidebar((current) => {
      const next = current === "chat" ? null : "chat";
      isChatOpenRef.current = next === "chat";
      if (next === "chat" && isTabActiveRef.current) {
        setUnreadMessageCount(0);
      }
      return next;
    });
  };

  const openParticipants = () => {
    setActiveSidebar((current) => {
      const next = current === "participants" ? null : "participants";
      isChatOpenRef.current = false;
      return next;
    });
  };

  const shouldAutoJoinFromLanding = launchOrigin === "landing" && Boolean(displayName.trim());
  const shouldShowNameInput =
    !shouldAutoJoinFromLanding ||
    roomEntryState === "name-taken" ||
    roomEntryState === "invalid-name";

  const canShowJoinAction =
    shouldShowNameInput ||
    !shouldJoin ||
    roomLookupState === "error" ||
    roomEntryState === "error" ||
    roomEntryState === "revoked";

  const isJoinInProgress = roomEntryState === "joining";
  const isWaitingForApproval = roomEntryState === "waiting";
  const joinButtonLabel =
    isJoinInProgress
      ? "Joining..."
      : shouldJoin &&
          (roomLookupState === "error" || roomEntryState === "error" || roomEntryState === "revoked")
        ? "Retry join"
        : "Join meeting";

  const isJoinDisabled =
    isJoinInProgress ||
    isWaitingForApproval ||
    roomLookupState === "checking" ||
    roomLookupState === "missing" ||
    (shouldShowNameInput && !displayName.trim()) ||
    isEndingMeeting;
  const canSubmitPrejoinForm = canShowJoinAction && !isJoinDisabled;

  const handlePrejoinShortcutSubmit = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      event.preventDefault();
      if (!canSubmitPrejoinForm) {
        return;
      }

      event.currentTarget.requestSubmit();
    },
    [canSubmitPrejoinForm]
  );

  const previewStream = localCameraStream ?? localStream;
  const previewName = (joinName || displayName || "Guest").trim();
  const previewInitial = previewName.charAt(0).toUpperCase() || "?";

  const prejoinDescription =
    roomLookupState === "checking"
      ? `Checking room ${normalizedRoomId}...`
      : isWaitingForApproval
        ? "You're in the waiting room."
        : isJoinInProgress
          ? `Joining room ${normalizedRoomId} as ${joinName || displayName || "Guest"}...`
          : shouldShowNameInput
            ? "Preview your camera and choose your mic/video settings before joining."
            : "Check your camera and mic, then hop in.";
  const waitingStatusMessage = hostName
    ? `${hostName} will admit you into the meeting shortly.`
    : "The host will admit you into the meeting shortly.";

  const isChatOpen = activeSidebar === "chat";
  const isParticipantsOpen = activeSidebar === "participants";
  const isSidebarOpen = isChatOpen || isParticipantsOpen;

  const closeSidebar = () => {
    isChatOpenRef.current = false;
    setActiveSidebar(null);
  };

  const toast = <Toast message={toastMessage} />;

  if (!isLaunchBootstrapComplete) {
    return (
      <StatusScreen toast={toast} icon={<Spinner className="h-6 w-6" />} title="Joining meeting">
        Preparing your profile...
      </StatusScreen>
    );
  }

  if (shouldShowNotFoundScreen) {
    return (
      <StatusScreen
        toast={toast}
        tone="danger"
        icon={<span className="font-mono text-lg font-bold">404</span>}
        title="Meeting room not found"
      >
        Redirecting to homepage in <span className="font-mono text-ink">{redirectCountdown}s</span>...
      </StatusScreen>
    );
  }

  if (roomEntryState !== "joined") {
    const prejoinHeading =
      roomLookupState === "checking"
        ? "Checking the room..."
        : isWaitingForApproval
          ? "Waiting to be let in"
          : isJoinInProgress
            ? "Joining..."
            : "Ready to join?";

    return (
      <div className="app-backdrop flex min-h-dvh p-3 sm:p-5">
        {toast}
        <div className="app-shell mx-auto flex w-full max-w-[1320px] flex-col overflow-hidden rounded-[28px] ring-1 ring-white/5">
          <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => router.push("/")}
              title="Back to home"
              aria-label="Back to home"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-ink ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <ArrowLeftIcon className="h-[18px] w-[18px]" />
            </button>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              Room <span className="font-mono">{normalizedRoomId}</span>
            </h1>
            <div className="ml-auto hidden sm:block">
              <BrandMark />
            </div>
          </header>

          <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 px-3 pb-3 sm:px-5 sm:pb-5 lg:min-h-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
            <div className="relative aspect-[4/3] min-h-0 sm:aspect-video lg:aspect-auto">
              {previewStream ? (
                <VideoTile
                  stream={previewStream}
                  label="You (preview)"
                  avatarName={previewName}
                  muted
                  mirrored
                  objectFit="cover"
                  detectSpeaking={!isMuted}
                  showVideoOffPlaceholder={!isVideoEnabled}
                  placeholderLetter={previewInitial}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[24px] bg-gradient-to-br from-[#1b2536] to-[#121925] px-6 text-center ring-1 ring-white/5">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-muted">
                    <VideoOffIcon className="h-6 w-6" />
                  </span>
                  <p className="max-w-xs text-sm text-muted">
                    Camera preview will appear once media access is allowed.
                  </p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 sm:bottom-5">
                <div className="glass flex items-center gap-2 rounded-full p-1.5 ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={toggleMute}
                    title={isMuted ? "Unmute" : "Mute"}
                    aria-pressed={isMuted}
                    className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                      isMuted ? "bg-white text-[#0d1420]" : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {isMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
                    {isMuted ? "Mic off" : "Mic on"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleVideo}
                    title={isVideoEnabled ? "Turn off video" : "Turn on video"}
                    aria-pressed={!isVideoEnabled}
                    className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                      !isVideoEnabled ? "bg-white text-[#0d1420]" : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {isVideoEnabled ? (
                      <VideoOnIcon className="h-4 w-4" />
                    ) : (
                      <VideoOffIcon className="h-4 w-4" />
                    )}
                    {isVideoEnabled ? "Video on" : "Video off"}
                  </button>
                </div>
              </div>
            </div>

            <form
              className="flex flex-col rounded-[24px] bg-panel p-6 ring-1 ring-white/5 sm:p-8 lg:justify-center"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmitPrejoinForm) {
                  return;
                }
                handleJoin();
              }}
              onKeyDown={handlePrejoinShortcutSubmit}
            >
              <h2 className="text-3xl font-bold tracking-[-0.03em] text-ink">{prejoinHeading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{prejoinDescription}</p>

              {isWaitingForApproval ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-6 flex items-center gap-4 rounded-2xl bg-accent-soft p-4 ring-1 ring-accent/30"
                >
                  <span className="pulse-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                    <span className="h-2.5 w-2.5 rounded-full bg-white" aria-hidden />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-ink">Waiting for host approval</div>
                    <p className="mt-0.5 text-sm text-[#b7cdf3]">{waitingStatusMessage}</p>
                  </div>
                </div>
              ) : null}

              {shouldShowNameInput ? (
                <div className="mt-6 flex flex-col gap-2">
                  <label htmlFor="prejoin-display-name" className="text-sm font-semibold text-ink">
                    Your name
                  </label>
                  <input
                    id="prejoin-display-name"
                    name="displayName"
                    type="text"
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      setNameError("");
                    }}
                    autoComplete="name"
                    autoCorrect="off"
                    placeholder="Enter your name"
                    className="h-12 rounded-2xl bg-raised px-4 text-[15px] text-ink outline-none ring-1 ring-white/5 transition placeholder:text-faint focus:ring-2 focus:ring-accent"
                  />
                </div>
              ) : !isWaitingForApproval ? (
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-raised p-3 ring-1 ring-white/5">
                  <Avatar name={previewName} size="md" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-muted">
                      {roomRole === "host" || launchIntent === "create" ? "Hosting as" : "Joining as"}
                    </div>
                    <div className="truncate text-sm font-semibold text-ink">{previewName}</div>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-1.5">
                {nameError ? <InlineError message={nameError} /> : null}
                {roomLookupState === "error" ? <InlineError message={roomLookupError} /> : null}
                {roomEntryError ? <InlineError message={roomEntryError} /> : null}
              </div>

              <div className="pt-6">
                {canShowJoinAction ? (
                  <button
                    type="submit"
                    disabled={isJoinDisabled}
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-[15px] font-semibold text-white transition hover:bg-accent-strong active:scale-[0.98] disabled:bg-accent/40 disabled:text-white/60"
                  >
                    {isJoinInProgress || roomLookupState === "checking" ? <Spinner className="h-4 w-4" /> : null}
                    {joinButtonLabel}
                  </button>
                ) : null}
                <p className="mt-3 text-center text-xs text-muted">
                  or press <kbd className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink/80 ring-1 ring-white/10">⌘/Ctrl</kbd>{" "}
                  <kbd className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink/80 ring-1 ring-white/10">Enter</kbd>
                </p>
              </div>
            </form>
          </main>
        </div>
      </div>
    );
  }

  const localName = joinName || displayName || "Guest";
  const selfId = getRoomConnection().id;

  return (
    <div className="app-backdrop flex h-dvh md:p-4">
      {toast}
      <div className="app-shell flex min-w-0 flex-1 flex-col overflow-hidden ring-1 ring-white/5 md:rounded-[28px]">
        <RoomHeader
          roomId={normalizedRoomId}
          hostName={hostName}
          participantCount={participantList.length}
          userName={localName}
          isHost={roomRole === "host"}
          isRecording={isRecording}
          isChatOpen={isChatOpen}
          unreadMessageCount={unreadMessageCount}
          isParticipantsOpen={isParticipantsOpen}
          pendingParticipantCount={pendingParticipants.length}
          onToggleChat={openChat}
          onToggleParticipants={openParticipants}
        />

        <main className="relative flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:gap-4 sm:px-4 sm:pb-4">
          <div className="min-h-0 min-w-0 flex-1">
            <VideoGrid
              roomId={normalizedRoomId}
              localStream={localStream}
              localCameraStream={localCameraStream}
              remoteStreams={remoteStreams}
              remoteScreenStreams={remoteScreenStreams}
              peerNames={peerNames}
              peerVideoEnabled={peerVideoEnabled}
              isLocalScreenSharing={isScreenSharing}
              currentSharerId={currentSharerId}
              isLocalSharer={isLocalSharer}
              isVideoEnabled={isVideoEnabled}
              localDisplayName={localName}
              onShowAllParticipants={() => {
                if (!isParticipantsOpen) openParticipants();
              }}
              controls={
                <CallControls
                  isMuted={isMuted}
                  onToggleMute={toggleMute}
                  audioInputDevices={audioInputDevices}
                  selectedAudioInputId={selectedAudioInputId}
                  onSelectAudioInput={switchAudioInput}
                  isVideoEnabled={isVideoEnabled}
                  onToggleVideo={toggleVideo}
                  videoInputDevices={videoInputDevices}
                  selectedVideoInputId={selectedVideoInputId}
                  onSelectVideoInput={switchVideoInput}
                  isScreenSharing={isScreenSharing}
                  onToggleScreenShare={toggleScreenShare}
                  isRecording={isRecording}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                  isHost={roomRole === "host"}
                  isEndingMeeting={isEndingMeeting}
                  onLeaveMeeting={handleLeaveRoom}
                  onEndMeeting={handleEndMeeting}
                />
              }
            />
          </div>

          {isSidebarOpen ? (
            <SidePanel
              activeTab={isChatOpen ? "chat" : "participants"}
              unreadMessageCount={unreadMessageCount}
              participantCount={participantList.length}
              pendingParticipantCount={pendingParticipants.length}
              onSelectTab={(tab) => {
                if (tab === "chat" && !isChatOpen) openChat();
                if (tab === "participants" && !isParticipantsOpen) openParticipants();
              }}
              onClose={closeSidebar}
            >
              {isChatOpen ? (
                <ChatPanel
                  messages={messages}
                  selfId={selfId}
                  onSend={(message) => sendMessage(message, localName)}
                />
              ) : (
                <ParticipantsPanel
                  participants={participantList}
                  pendingParticipants={pendingParticipants}
                  localDisplayName={localName}
                  localRole={roomRole}
                  isHost={roomRole === "host"}
                  admittingParticipantId={admittingParticipantId}
                  onAdmitParticipant={admitParticipant}
                />
              )}
            </SidePanel>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-[#ff8a8e]">
      <AlertIcon className="h-3.5 w-3.5 shrink-0" />
      {message}
    </span>
  );
}

function StatusScreen({
  toast,
  icon,
  title,
  tone = "accent",
  children,
}: {
  toast: ReactNode;
  icon: ReactNode;
  title: string;
  tone?: "accent" | "danger";
  children: ReactNode;
}) {
  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center p-4">
      {toast}
      <div className="app-shell w-full max-w-sm animate-pop-in rounded-[28px] p-8 text-center ring-1 ring-white/5">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <span
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
            tone === "danger" ? "bg-danger/15 text-[#ff8a8e]" : "bg-accent-soft text-[#8fb8ff]"
          }`}
        >
          {icon}
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}
