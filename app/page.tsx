"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoGrid } from "@/app/components/VideoGrid";
import { ChatPanel } from "@/app/components/ChatPanel";
import { TopBar } from "@/app/components/TopBar";
import { BottomBar } from "@/app/components/BottomBar";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { useWebRTC } from "@/app/hooks/useWebRTC";
import { useChat } from "@/app/hooks/useChat";
import { getSocket } from "@/app/lib/socket";

const MIN_ROOM_ID = 1;
const MAX_ROOM_ID = 999;
const ROOM_CHECK_TIMEOUT_MS = 3000;

const generateRoomId = () =>
  String(Math.floor(Math.random() * (MAX_ROOM_ID - MIN_ROOM_ID + 1)) + MIN_ROOM_ID);

const sanitizeRoomInput = (value: string) => value.replace(/\D/g, "").slice(0, 3);

const normalizeRoomId = (value: string): string | null => {
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }
  const numeric = Number.parseInt(cleaned, 10);
  if (!Number.isInteger(numeric) || numeric < MIN_ROOM_ID || numeric > MAX_ROOM_ID) {
    return null;
  }
  return String(numeric);
};

type RoomExistsAck = {
  exists?: boolean;
  error?: string;
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room") ?? "";

  const [roomInputDraft, setRoomInputDraft] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [roomCreationPromptId, setRoomCreationPromptId] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const isChatOpenRef = useRef(isChatOpen);
  const isTabActiveRef = useRef(
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible" && document.hasFocus()
  );
  const notificationAudioContextRef = useRef<AudioContext | null>(null);

  const hasName = displayName.trim().length > 0;
  const effectiveRoom = hasName ? activeRoom : null;
  const roomInput = roomInputDraft ?? sanitizeRoomInput(roomParam);

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
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

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

  const { messages, sendMessage } = useChat(effectiveRoom, {
    onIncomingMessage: handleIncomingMessage,
  });
  const hasUnreadMessages = unreadMessageCount > 0;
  const {
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
  } = useWebRTC(effectiveRoom, displayName.trim() || "Guest");

  const enterRoom = useCallback(
    (nextRoom: string) => {
      router.push(`/?room=${nextRoom}`);
      setActiveRoom(nextRoom);
      setRoomInputDraft(nextRoom);
      setIsChatOpen(false);
      isChatOpenRef.current = false;
      setUnreadMessageCount(0);
      setRoomError("");
    },
    [router]
  );

  const checkRoomExists = useCallback((roomId: string) => {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("Room lookup is only available in the browser."));
    }
    const socket = getSocket();
    socket.connect();
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Unable to check room right now. Please try again."));
      }, ROOM_CHECK_TIMEOUT_MS);

      socket.emit("room-exists", { roomId }, (response?: RoomExistsAck) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (!response) {
          reject(new Error("No response from room server."));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(Boolean(response.exists));
      });
    });
  }, []);

  const handleJoin = async () => {
    if (!hasName) {
      setNameError("Please enter your name to join.");
      return;
    }
    if (!roomInput.trim()) {
      setRoomError("Please enter a room ID.");
      return;
    }

    const nextRoom = normalizeRoomId(roomInput);
    if (!nextRoom) {
      setRoomError("Room ID must be a number between 1 and 999.");
      return;
    }

    setNameError("");
    setRoomError("");
    setRoomCreationPromptId(null);
    setIsJoining(true);
    try {
      const exists = await checkRoomExists(nextRoom);
      if (!exists) {
        setRoomCreationPromptId(nextRoom);
        setRoomInputDraft(nextRoom);
        return;
      }
      enterRoom(nextRoom);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to check room right now. Please try again.";
      setRoomError(message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!hasName) {
      setNameError("Please enter your name to join.");
      return;
    }

    setNameError("");
    setRoomError("");
    setRoomCreationPromptId(null);
    setIsCreatingRoom(true);
    const newRoom = generateRoomId();
    try {
      const exists = await checkRoomExists(newRoom);
      if (exists) {
        setRoomError(`Room ${newRoom} is already active. Click create again for a new ID.`);
        setRoomInputDraft(newRoom);
        return;
      }
      enterRoom(newRoom);
    } catch {
      setRoomError("Unable to create a room right now. Please try again.");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleLeaveRoom = () => {
    router.push("/");
    setActiveRoom(null);
    setRoomInputDraft("");
    setRoomError("");
    setRoomCreationPromptId(null);
    setIsChatOpen(false);
    isChatOpenRef.current = false;
    setUnreadMessageCount(0);
  };

  useEffect(() => {
    return () => {
      void notificationAudioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!activeRoom) {
      document.title = "VC Meet";
      return;
    }
    document.title = hasUnreadMessages ? "VC meet *" : "VC meet";
  }, [activeRoom, hasUnreadMessages]);

  // Landing / Join view
  if (!activeRoom) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <ConfirmDialog
          isOpen={Boolean(roomCreationPromptId)}
          title={
            roomCreationPromptId ? `Create room ${roomCreationPromptId}?` : "Create this room?"
          }
          description={
            roomCreationPromptId
              ? `Room ${roomCreationPromptId} does not exist yet. Create it now and join?`
              : ""
          }
          confirmLabel="Create and join"
          confirmButtonClassName="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          onConfirm={() => {
            if (!roomCreationPromptId) return;
            enterRoom(roomCreationPromptId);
            setRoomCreationPromptId(null);
          }}
          onCancel={() => setRoomCreationPromptId(null)}
        />

        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-lg font-semibold tracking-tight">VC meet</div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h1 className="mb-6 text-center text-2xl font-semibold">
              Join a meeting
            </h1>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Your name</label>
                <input
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setNameError("");
                  }}
                  placeholder="Enter your name"
                  className="rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700"
                />
                {nameError ? (
                  <span className="text-xs text-red-500">{nameError}</span>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Room ID</label>
                <input
                  value={roomInput}
                  onChange={(event) => {
                    setRoomInputDraft(sanitizeRoomInput(event.target.value));
                    setRoomError("");
                    setRoomCreationPromptId(null);
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  placeholder="Enter a room ID (1-999)"
                  className="rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700"
                />
                {roomError ? (
                  <span className="text-xs text-red-500">{roomError}</span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-col gap-3">
                <button
                  onClick={handleJoin}
                  disabled={!hasName || isJoining || isCreatingRoom}
                  className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isJoining ? "Joining..." : "Join room"}
                </button>
                <button
                  onClick={handleCreateRoom}
                  disabled={!hasName || isJoining || isCreatingRoom}
                  className="w-full rounded-full border border-zinc-300 px-5 py-3 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {isCreatingRoom ? "Creating..." : "Create new room"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // In-call view
  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <TopBar userName={displayName || "Guest"} />

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Video area - fills height, no vertical scroll */}
        <div
          className={`flex min-h-0 flex-1 transition-all ${
            isChatOpen ? "mr-80" : ""
          }`}
        >
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
              localDisplayName={displayName}
            />
          </div>
        </div>

        {/* Chat panel - only mount when open so it stays hidden on launch */}
        {isChatOpen && (
          <div className="absolute bottom-0 right-0 top-0 w-80 border-l border-zinc-800 bg-zinc-900">
            <ChatPanel
              messages={messages}
              onSend={(message) => sendMessage(message, displayName)}
            />
          </div>
        )}
      </main>

      <BottomBar
        roomId={activeRoom}
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
        onToggleChat={() =>
          setIsChatOpen((current) => {
            const next = !current;
            isChatOpenRef.current = next;
            if (next && isTabActiveRef.current) {
              setUnreadMessageCount(0);
            }
            return next;
          })
        }
        onEndCall={handleLeaveRoom}
      />
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-lg font-semibold tracking-tight">VC meet</div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="h-12 w-12 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
