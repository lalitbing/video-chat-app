"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { getSocket } from "@/app/lib/socket";
import { generateRoomId, normalizeRoomId, sanitizeRoomInput } from "@/app/lib/room";
import { setPendingLandingName } from "@/app/lib/landingLaunch";

const ROOM_CHECK_TIMEOUT_MS = 3000;
const MAX_CREATE_ROOM_RETRIES = 10;

type RoomExistsAck = {
  exists?: boolean;
  error?: string;
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState("");
  const [roomDraft, setRoomDraft] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomCreationPromptId, setRoomCreationPromptId] = useState<string | null>(null);

  useEffect(() => {
    const queryRoom = searchParams.get("room");
    const shouldPromptCreate = searchParams.get("promptCreate") === "1";
    if (!queryRoom) return;

    const normalizedRoom = normalizeRoomId(queryRoom);
    if (!normalizedRoom) return;

    if (shouldPromptCreate) {
      setRoomDraft(normalizedRoom);
      setRoomCreationPromptId(normalizedRoom);
      return;
    }

    router.replace(`/room/${normalizedRoom}`);
  }, [router, searchParams]);

  const hasName = useMemo(() => displayName.trim().length > 0, [displayName]);

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

  const buildRoomRoute = useCallback(
    (roomId: string, intent: "create" | "join") =>
      `/room/${roomId}?${new URLSearchParams({
        intent,
        origin: "landing",
      }).toString()}`,
    []
  );

  const routeToCreateRoom = useCallback(
    (roomId: string) => {
      setPendingLandingName(roomId, displayName);
      router.push(buildRoomRoute(roomId, "create"));
    },
    [buildRoomRoute, displayName, router]
  );

  const handleJoin = async () => {
    if (!hasName) {
      setNameError("Please enter your name to join.");
      return;
    }

    const normalizedRoom = normalizeRoomId(roomDraft);
    if (!normalizedRoom) {
      setRoomError("Room ID must be a number between 1 and 999.");
      return;
    }

    setNameError("");
    setRoomError("");
    setRoomCreationPromptId(null);
    setIsJoining(true);

    try {
      const exists = await checkRoomExists(normalizedRoom);
      if (!exists) {
        setRoomCreationPromptId(normalizedRoom);
        return;
      }

      setPendingLandingName(normalizedRoom, displayName);
      router.push(buildRoomRoute(normalizedRoom, "join"));
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

    try {
      const requestedRoom = roomDraft.trim();
      const normalizedRequestedRoom = requestedRoom ? normalizeRoomId(requestedRoom) : null;

      if (requestedRoom && !normalizedRequestedRoom) {
        setRoomError("Room ID must be a number between 1 and 999.");
        return;
      }

      if (normalizedRequestedRoom) {
        const exists = await checkRoomExists(normalizedRequestedRoom);
        if (exists) {
          setRoomError(
            `Room ${normalizedRequestedRoom} already exists. Join it or choose a different room ID.`
          );
          return;
        }
        routeToCreateRoom(normalizedRequestedRoom);
        return;
      }

      let attempts = 0;
      let generatedRoomId = generateRoomId();
      while (attempts < MAX_CREATE_ROOM_RETRIES) {
        const exists = await checkRoomExists(generatedRoomId);
        if (!exists) {
          routeToCreateRoom(generatedRoomId);
          return;
        }
        attempts += 1;
        generatedRoomId = generateRoomId();
      }

      setRoomError("Unable to generate an available room right now. Please try again.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create a room right now. Please try again.";
      setRoomError(message);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-lg font-semibold tracking-tight">VC meet</div>
      </header>

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
          if (!hasName) {
            setNameError("Please enter your name to join.");
            return;
          }
          routeToCreateRoom(roomCreationPromptId);
          setRoomCreationPromptId(null);
        }}
        onCancel={() => setRoomCreationPromptId(null)}
      />

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-6 text-center text-2xl font-semibold">Join a meeting</h1>
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
              {nameError ? <span className="text-xs text-red-500">{nameError}</span> : null}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Room ID</label>
              <input
                value={roomDraft}
                onChange={(event) => {
                  setRoomDraft(sanitizeRoomInput(event.target.value));
                  setRoomError("");
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                placeholder="Enter a room ID (1-999)"
                className="rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700"
              />
              {roomError ? <span className="text-xs text-red-500">{roomError}</span> : null}
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
