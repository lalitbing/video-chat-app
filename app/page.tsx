"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoGrid } from "@/app/components/VideoGrid";
import { ChatPanel } from "@/app/components/ChatPanel";
import { TopBar } from "@/app/components/TopBar";
import { BottomBar } from "@/app/components/BottomBar";
import { useWebRTC } from "@/app/hooks/useWebRTC";
import { useChat } from "@/app/hooks/useChat";

const generateRoomId = () => Math.random().toString(36).slice(2, 10);

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room") ?? "";

  const [roomInput, setRoomInput] = useState(roomParam);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);

  const hasName = displayName.trim().length > 0;
  const effectiveRoom = hasName ? activeRoom : null;

  useEffect(() => {
    if (roomParam && roomParam !== roomInput) {
      setRoomInput(roomParam);
    }
    if (!roomParam) {
      setActiveRoom(null);
    }
  }, [roomInput, roomParam]);

  const inviteUrl = useMemo(() => {
    if (!activeRoom || typeof window === "undefined") return "";
    return `${window.location.origin}/?room=${activeRoom}`;
  }, [activeRoom]);

  const { messages, sendMessage } = useChat(effectiveRoom);
  const {
    localStream,
    localCameraStream,
    remoteStreams,
    remoteScreenStreams,
    peerNames,
    peerScreenSharing,
    peerVideoEnabled,
    currentSharerId,
    isLocalSharer,
    isMuted,
    toggleMute,
    isVideoEnabled,
    toggleVideo,
    isScreenSharing,
    toggleScreenShare,
    isRecording,
    startRecording,
    stopRecording,
  } = useWebRTC(effectiveRoom, displayName.trim() || "Guest");

  const handleJoin = () => {
    if (!hasName) {
      setNameError("Please enter your name to join.");
      return;
    }
    if (!roomInput.trim()) return;
    const nextRoom = roomInput.trim();
    router.push(`/?room=${nextRoom}`);
    setActiveRoom(nextRoom);
  };

  const handleCreateRoom = () => {
    if (!hasName) {
      setNameError("Please enter your name to join.");
      return;
    }
    const newRoom = generateRoomId();
    router.push(`/?room=${newRoom}`);
    setActiveRoom(newRoom);
  };

  const handleLeaveRoom = () => {
    router.push("/");
    setActiveRoom(null);
    setIsChatOpen(false);
  };

  // Landing / Join view
  if (!activeRoom) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-lg font-semibold tracking-tight">VC Meet</div>
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
                  onChange={(event) => setRoomInput(event.target.value)}
                  placeholder="Enter a room ID"
                  className="rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700"
                />
              </div>
              <div className="mt-2 flex flex-col gap-3">
                <button
                  onClick={handleJoin}
                  disabled={!hasName}
                  className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Join room
                </button>
                <button
                  onClick={handleCreateRoom}
                  disabled={!hasName}
                  className="w-full rounded-full border border-zinc-300 px-5 py-3 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Create new room
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
              peerScreenSharing={peerScreenSharing}
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
        isVideoEnabled={isVideoEnabled}
        onToggleVideo={toggleVideo}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={toggleScreenShare}
        isRecording={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onEndCall={handleLeaveRoom}
      />
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-lg font-semibold tracking-tight">VC Meet</div>
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
