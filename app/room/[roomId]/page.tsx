"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { BottomBar } from "@/app/components/BottomBar";
import { ChatPanel } from "@/app/components/ChatPanel";
import { ParticipantsPanel } from "@/app/components/ParticipantsPanel";
import { TopBar } from "@/app/components/TopBar";
import { VideoGrid } from "@/app/components/VideoGrid";
import { VideoTile } from "@/app/components/VideoTile";
import { useChat } from "@/app/hooks/useChat";
import { useWebRTC } from "@/app/hooks/useWebRTC";
import { MicIcon, MicOffIcon, VideoOffIcon, VideoOnIcon } from "@/app/icons";
import { consumePendingLandingLaunch } from "@/app/lib/landingLaunch";
import { getSocket } from "@/app/lib/socket";
import { normalizeRoomId } from "@/app/lib/room";

const ROOM_CHECK_TIMEOUT_MS = 3000;
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

    const socket = getSocket();
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

    const socket = getSocket();
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

    router.replace(`/?room=${normalizedRoomId}&promptCreate=1`);
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

  const hasUnreadMessages = unreadMessageCount > 0;
  const hasPendingParticipants = pendingParticipants.length > 0;

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

    const socket = getSocket();
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
            : `Ready to join room ${normalizedRoomId} as ${displayName}.`;
  const waitingStatusMessage = hostName
    ? `${hostName} will admit you into the meeting shortly.`
    : "The host will admit you into the meeting shortly.";

  const isChatOpen = activeSidebar === "chat";
  const isParticipantsOpen = activeSidebar === "participants";
  const isSidebarOpen = isChatOpen || isParticipantsOpen;

  const toast = toastMessage ? (
    <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 shadow-lg ring-1 ring-white/10">
      {toastMessage}
    </div>
  ) : null;

  if (!isLaunchBootstrapComplete) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        {toast}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-lg font-semibold tracking-tight">VC meet</div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h1 className="text-xl font-semibold">Joining meeting</h1>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Preparing your profile...
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (shouldShowNotFoundScreen) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        {toast}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-lg font-semibold tracking-tight">VC meet</div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h1 className="text-xl font-semibold">Meeting room not found</h1>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Redirecting to homepage in {redirectCountdown}s...
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (roomEntryState !== "joined") {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        {toast}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-lg font-semibold tracking-tight">VC meet</div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <form
            className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmitPrejoinForm) {
                return;
              }
              handleJoin();
            }}
            onKeyDown={handlePrejoinShortcutSubmit}
          >
            <h1 className="mb-1 text-2xl font-semibold">Room {normalizedRoomId}</h1>
            <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">{prejoinDescription}</p>
            {isWaitingForApproval ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700/80 dark:bg-amber-900/20 dark:text-amber-100"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
                  Waiting for host approval
                </div>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {waitingStatusMessage}
                </p>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 dark:border-zinc-700">
              <div className="aspect-video w-full">
                {previewStream ? (
                  <VideoTile
                    stream={previewStream}
                    label="You (preview)"
                    muted
                    mirrored
                    objectFit="cover"
                    showVideoOffPlaceholder={!isVideoEnabled}
                    placeholderLetter={previewInitial}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-300">
                    Camera preview will appear once media access is allowed.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                  isMuted
                    ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                }`}
              >
                {isMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
                {isMuted ? "Mic off" : "Mic on"}
              </button>

              <button
                type="button"
                onClick={toggleVideo}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                  !isVideoEnabled
                    ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
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

            {shouldShowNameInput ? (
              <div className="mt-5 flex flex-col gap-2">
                <label htmlFor="prejoin-display-name" className="text-sm font-medium">
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
                  className="rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700"
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              {nameError ? <span className="text-xs text-red-500">{nameError}</span> : null}
              {roomLookupState === "error" ? (
                <span className="text-xs text-red-500">{roomLookupError}</span>
              ) : null}
              {roomEntryError ? <span className="text-xs text-red-500">{roomEntryError}</span> : null}
            </div>

            {canShowJoinAction ? (
              <button
                type="submit"
                disabled={isJoinDisabled}
                aria-keyshortcuts="Control+Enter Meta+Enter"
                className="mt-5 w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {joinButtonLabel}
              </button>
            ) : null}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Press Ctrl+Enter (Cmd+Enter on Mac) to submit join.
            </p>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {toast}
      <TopBar userName={joinName || displayName || "Guest"} />

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={`flex min-h-0 flex-1 transition-all ${isSidebarOpen ? "mr-80" : ""}`}>
          <div className="flex min-h-0 flex-1">
            <VideoGrid
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
              localDisplayName={joinName || displayName}
            />
          </div>
        </div>

        {isChatOpen ? (
          <div className="absolute bottom-0 right-0 top-0 w-80 border-l border-zinc-800 bg-zinc-900">
            <ChatPanel
              messages={messages}
              onSend={(message) => sendMessage(message, joinName || displayName)}
            />
          </div>
        ) : null}

        {isParticipantsOpen ? (
          <div className="absolute bottom-0 right-0 top-0 w-80 border-l border-zinc-800 bg-zinc-900">
            <ParticipantsPanel
              participants={participantList}
              pendingParticipants={pendingParticipants}
              localDisplayName={joinName || displayName}
              localRole={roomRole}
              isHost={roomRole === "host"}
              admittingParticipantId={admittingParticipantId}
              onAdmitParticipant={admitParticipant}
            />
          </div>
        ) : null}
      </main>

      <BottomBar
        roomId={normalizedRoomId}
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
        isChatOpen={isChatOpen}
        hasUnreadMessages={hasUnreadMessages}
        isParticipantsOpen={isParticipantsOpen}
        hasPendingParticipants={hasPendingParticipants}
        onToggleParticipants={openParticipants}
        onToggleChat={openChat}
        isHost={roomRole === "host"}
        isEndingMeeting={isEndingMeeting}
        onLeaveMeeting={handleLeaveRoom}
        onEndMeeting={handleEndMeeting}
      />
    </div>
  );
}
