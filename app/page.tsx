"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GroupCallIllustration } from "@/app/components/GroupCallIllustration";
import { LandingShowcase } from "@/app/components/LandingShowcase";
import { BrandMark } from "@/app/components/ui/BrandMark";
import { Spinner } from "@/app/components/ui/Spinner";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "@/app/icons";
import { getRoomConnection } from "@/app/lib/roomConnection";
import { normalizeRoomId, sanitizeRoomInput } from "@/app/lib/room";
import { setPendingLandingLaunch } from "@/app/lib/landingLaunch";

const ROOM_SERVER_TIMEOUT_MS = 8000;

type RoomExistsAck = {
  exists?: boolean;
  error?: string;
};

type CreateRoomAck = {
  ok?: boolean;
  roomId?: string;
  error?: string;
};

type Capacity = { active: number; max: number };

// Sends a request over the room connection and resolves with its reply, or rejects on timeout.
const request = <T,>(event: string, payload: Record<string, unknown>) => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Rooms are only available in the browser."));
  }

  const connection = getRoomConnection();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Unable to reach the room server right now. Please try again."));
    }, ROOM_SERVER_TIMEOUT_MS);

    connection.emit(event, payload, (response?: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (!response) {
        reject(new Error("No response from room server."));
        return;
      }
      resolve(response);
    });
  });
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState("");
  const [startError, setStartError] = useState("");
  const [roomDraft, setRoomDraft] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [isJoinMode, setIsJoinMode] = useState(false);
  const roomInputRef = useRef<HTMLInputElement | null>(null);

  // Arriving from /?room=42 (old links) or back from a room that wasn't running.
  useEffect(() => {
    const queryRoom = searchParams.get("room");
    if (!queryRoom) return;

    const normalizedRoom = normalizeRoomId(queryRoom);
    if (!normalizedRoom) return;

    if (searchParams.get("missing") === "1") {
      const timeoutId = window.setTimeout(() => {
        setIsJoinMode(true);
        setRoomDraft(normalizedRoom);
        setRoomError(`Room ${normalizedRoom} isn't running. Check the number, or start a meeting.`);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    router.replace(`/room/${normalizedRoom}`);
  }, [router, searchParams]);

  useEffect(() => getRoomConnection().watchCapacity(setCapacity), []);

  const hasName = useMemo(() => displayName.trim().length > 0, [displayName]);
  const freeRooms = capacity ? Math.max(capacity.max - capacity.active, 0) : null;
  const isFull = freeRooms === 0;
  const isBusy = isJoining || isStarting;

  const requireName = () => {
    if (hasName) return true;
    setNameError("Please enter your name first.");
    return false;
  };

  const handleStartMeeting = async () => {
    if (!requireName()) return;

    setNameError("");
    setStartError("");
    setRoomError("");
    setIsStarting(true);

    try {
      const response = await request<CreateRoomAck>("create-random-room", { name: displayName });
      if (!response.ok || !response.roomId) {
        setStartError(response.error ?? "Unable to start a meeting right now. Please try again.");
        return;
      }

      setPendingLandingLaunch(response.roomId, displayName, "create");
      router.push(`/room/${response.roomId}`);
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Unable to start a meeting right now."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleJoin = async () => {
    if (!requireName()) return;

    const normalizedRoom = normalizeRoomId(roomDraft);
    if (!normalizedRoom) {
      setRoomError("Enter the room number you were given (1 to 999).");
      return;
    }

    setNameError("");
    setStartError("");
    setRoomError("");
    setIsJoining(true);

    try {
      const response = await request<RoomExistsAck>("room-exists", { roomId: normalizedRoom });
      if (response.error) {
        setRoomError(response.error);
        return;
      }
      if (!response.exists) {
        setRoomError(`Room ${normalizedRoom} isn't running. Check the number, or start a meeting.`);
        return;
      }

      setPendingLandingLaunch(normalizedRoom, displayName, "join");
      router.push(`/room/${normalizedRoom}`);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Unable to check room right now.");
    } finally {
      setIsJoining(false);
    }
  };

  // Enter (or Ctrl/Cmd+Enter) joins in join mode, otherwise starts a meeting.
  const submit = () => {
    if (isBusy) return;
    if (isJoinMode) {
      void handleJoin();
    } else if (!isFull) {
      void handleStartMeeting();
    }
  };

  const openJoinMode = () => {
    setStartError("");
    setIsJoinMode(true);
    window.setTimeout(() => roomInputRef.current?.focus(), 0);
  };

  const closeJoinMode = () => {
    setIsJoinMode(false);
    setRoomDraft("");
    setRoomError("");
  };

  const handleShortcutSubmit = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      event.preventDefault();
      event.currentTarget.requestSubmit();
    },
    []
  );

  return (
    <div className="app-backdrop flex min-h-dvh p-2 sm:p-5">
      <div className="app-shell mx-auto grid w-full max-w-[1320px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[28px] ring-1 ring-white/5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="hidden min-h-0 p-3 lg:block">
          <LandingShowcase />
        </section>

        <section className="flex min-h-0 flex-col px-5 py-5 sm:px-10 sm:py-8 lg:px-14">
          <header className="flex items-center justify-between">
            <BrandMark />
            <CapacityChip capacity={capacity} />
          </header>

          <main className="flex flex-1 flex-col justify-center py-4 sm:py-6 lg:py-10">
            {/* Small screens only get the illustration; large screens show the full left pane. */}
            <div className="relative mb-5 w-full max-w-[19rem] sm:mb-7 sm:max-w-[24rem] lg:hidden [@media(max-height:700px)]:max-w-[13rem] [@media(max-height:620px)]:hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[90%] animate-glow rounded-full bg-accent/25 blur-[60px]"
              />
              <GroupCallIllustration className="relative w-full animate-rise" />
            </div>

            <div className="animate-rise">
              <h1 className="text-[2rem] font-bold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[3.4rem]">
                Meet in one click.
                <br />
                <span className="bg-gradient-to-r from-[#8fb8ff] via-accent to-[#8fb8ff] bg-clip-text text-transparent">
                  Share one number.
                </span>
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:mt-4 sm:text-[15px]">
                We hand you a free room the moment you start. Send the number to whoever
                you&apos;re meeting, and let them in as they arrive.
              </p>
            </div>

            <form
              className="mt-6 flex max-w-md animate-rise flex-col gap-4 [animation-delay:80ms] sm:mt-9 sm:gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              onKeyDown={handleShortcutSubmit}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="landing-display-name" className="text-sm font-semibold text-ink">
                  Your name
                </label>
                <input
                  id="landing-display-name"
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
                  aria-invalid={Boolean(nameError)}
                  className="h-11 rounded-2xl bg-raised px-4 text-[15px] text-ink outline-none ring-1 ring-white/5 transition placeholder:text-faint focus:ring-2 focus:ring-accent aria-[invalid=true]:ring-danger/70 sm:h-12"
                />
                {nameError ? <FieldError message={nameError} /> : null}
              </div>

              <div className="flex flex-col gap-2">
                {isJoinMode ? (
                  // Keyed so React swaps in fresh elements; reusing the back button's DOM node
                  // as the "Start meeting" submit button would turn this click into a submit.
                  <div key="join-mode" className="flex animate-pop-in gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        closeJoinMode();
                      }}
                      title="Back"
                      aria-label="Back to start a meeting"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-muted ring-1 ring-white/10 transition hover:bg-white/10 hover:text-ink"
                    >
                      <ArrowLeftIcon className="h-[18px] w-[18px]" />
                    </button>
                    <label
                      htmlFor="landing-room-id"
                      className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-raised pl-4 pr-2 ring-1 ring-white/5 transition focus-within:ring-2 focus-within:ring-accent"
                    >
                      <span className="font-mono text-xl text-faint" aria-hidden>
                        #
                      </span>
                      <span className="sr-only">Room number</span>
                      <input
                        ref={roomInputRef}
                        id="landing-room-id"
                        name="roomId"
                        type="text"
                        value={roomDraft}
                        onChange={(event) => {
                          setRoomDraft(sanitizeRoomInput(event.target.value));
                          setRoomError("");
                        }}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        placeholder="Room number"
                        aria-invalid={Boolean(roomError)}
                        className="w-0 min-w-0 flex-1 bg-transparent font-mono text-xl tracking-[0.2em] text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:tracking-normal placeholder:text-faint"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!hasName || !roomDraft || isBusy}
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(47,123,246,0.8)] transition hover:bg-accent-strong disabled:bg-accent/40 disabled:text-white/60 disabled:shadow-none"
                    >
                      {isJoining ? <Spinner className="h-4 w-4" /> : null}
                      {isJoining ? "Checking..." : "Join"}
                      {isJoining ? null : <ArrowRightIcon className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <div key="start-mode" className="grid animate-pop-in grid-cols-2 gap-2 sm:gap-3">
                    <button
                      type="submit"
                      disabled={!hasName || isBusy || isFull}
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-accent px-3 text-[14px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(47,123,246,0.8)] transition hover:bg-accent-strong disabled:bg-accent/40 disabled:text-white/60 disabled:shadow-none sm:px-5 sm:text-[15px]"
                    >
                      {isStarting ? <Spinner className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                      {isStarting ? "Finding a room..." : isFull ? "All rooms busy" : "Start meeting"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        openJoinMode();
                      }}
                      disabled={isBusy}
                      className="flex h-12 items-center justify-center whitespace-nowrap rounded-2xl bg-white/[0.06] px-3 text-[14px] font-semibold text-ink ring-1 ring-white/10 transition hover:bg-white/10 disabled:text-faint sm:px-5 sm:text-[15px]"
                    >
                      Join existing
                      <span className="hidden min-[400px]:inline">&nbsp;meeting</span>
                    </button>
                  </div>
                )}
                {startError && !isJoinMode ? <FieldError message={startError} /> : null}
                {roomError && isJoinMode ? <FieldError message={roomError} /> : null}
              </div>

            </form>
          </main>

          <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-faint">
            <span>Video and audio go straight between browsers. They never touch our servers.</span>
            <a
              href="https://storyset.com/people"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] transition hover:text-muted lg:hidden"
            >
              Illustration by Storyset
            </a>
          </footer>
        </section>
      </div>
    </div>
  );
}

function CapacityChip({ capacity }: { capacity: Capacity | null }) {
  if (!capacity) {
    return <span className="h-7 w-32 animate-pulse rounded-full bg-white/5" aria-hidden />;
  }

  const free = Math.max(capacity.max - capacity.active, 0);
  return (
    <span
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
        free > 0
          ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20"
          : "bg-danger/10 text-[#ff8a8e] ring-danger/25"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${free > 0 ? "bg-emerald-400" : "bg-danger"}`} />
      {free > 0 ? `${free} of ${capacity.max} rooms free` : `All ${capacity.max} rooms busy`}
    </span>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-[#ff8a8e]">
      <AlertIcon className="h-3.5 w-3.5 shrink-0" />
      {message}
    </span>
  );
}

function HomeFallback() {
  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center p-5">
      <div className="flex flex-col items-center gap-4 text-muted">
        <BrandMark />
        <Spinner className="h-5 w-5 text-accent" />
      </div>
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
