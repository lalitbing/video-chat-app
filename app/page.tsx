"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GroupCallIllustration } from "@/app/components/GroupCallIllustration";
import {
  ClosingCta,
  FeatureBento,
  HowItWorks,
  PrivacyAndRooms,
  type Capacity,
} from "@/app/components/LandingSections";
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
  const nameInputRef = useRef<HTMLInputElement | null>(null);

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

  const startFromBottom = () => {
    closeJoinMode();
    nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(900px_520px_at_85%_-10%,rgb(38_104_245/0.28),transparent_65%)]"
        />

        <header className="relative mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:h-[72px] sm:px-8">
          <BrandMark />
          <CapacityChip capacity={capacity} />
        </header>

        <main className="relative mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 px-4 pb-16 pt-8 sm:px-8 md:pt-12 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-12 lg:gap-8 lg:pb-20 lg:pt-4">
          <div className="lg:col-span-6">
            <h1 className="animate-rise text-[2.6rem] font-bold leading-[1.02] tracking-[-0.04em] text-ink sm:text-6xl lg:text-[4.1rem]">
              Start a call.
              <br />
              <span className="text-accent">Share a number.</span>
            </h1>
            <p className="mt-5 max-w-[26rem] animate-rise text-base leading-relaxed text-muted [animation-delay:60ms] sm:text-[17px]">
              Get a free room in one click. Send the number, let people in, talk. No accounts, no
              downloads.
            </p>

            <form
              className="mt-8 flex max-w-md animate-rise flex-col gap-4 [animation-delay:120ms] sm:mt-10 sm:gap-5"
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
                  ref={nameInputRef}
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
                  placeholder="How others will see you"
                  aria-invalid={Boolean(nameError)}
                  className="h-12 rounded-2xl bg-raised px-4 text-[15px] text-ink outline-none ring-1 ring-white/10 transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent aria-[invalid=true]:ring-danger/70"
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
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-muted ring-1 ring-white/10 transition hover:bg-white/10 hover:text-ink active:scale-[0.98]"
                    >
                      <ArrowLeftIcon className="h-[18px] w-[18px]" />
                    </button>
                    <label
                      htmlFor="landing-room-id"
                      className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-raised pl-4 pr-2 ring-1 ring-white/10 transition focus-within:ring-2 focus-within:ring-accent"
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
                        className="w-0 min-w-0 flex-1 bg-transparent font-mono text-xl tracking-[0.2em] text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:tracking-normal placeholder:text-muted/70"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!hasName || !roomDraft || isBusy}
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(47,123,246,0.8)] transition hover:bg-accent-strong active:scale-[0.98] disabled:bg-accent/40 disabled:text-white/60 disabled:shadow-none"
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
                      className="flex h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-accent px-3 text-[14px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(47,123,246,0.8)] transition hover:bg-accent-strong active:scale-[0.98] disabled:bg-accent/40 disabled:text-white/60 disabled:shadow-none sm:px-5 sm:text-[15px]"
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
                      className="flex h-12 items-center justify-center whitespace-nowrap rounded-2xl bg-white/[0.06] px-3 text-[14px] font-semibold text-ink ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98] disabled:text-faint sm:px-5 sm:text-[15px]"
                    >
                      Join with a number
                    </button>
                  </div>
                )}
                {startError && !isJoinMode ? <FieldError message={startError} /> : null}
                {roomError && isJoinMode ? <FieldError message={roomError} /> : null}
              </div>
            </form>
          </div>

          <div className="relative animate-fade-in [animation-delay:200ms] lg:col-span-6">
            <div className="relative overflow-hidden rounded-[28px] bg-panel ring-1 ring-white/5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgb(47_123_246/0.22),transparent_70%)]"
              />
              <GroupCallIllustration className="relative mx-auto w-full max-w-[600px] px-4 pt-6 sm:px-8" />
            </div>
          </div>
        </main>
      </div>

      <HowItWorks />
      <FeatureBento />
      <PrivacyAndRooms capacity={capacity} />
      <ClosingCta onStart={startFromBottom} />

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandMark />
          <a
            href="https://storyset.com/people"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-ink"
          >
            Illustration by Storyset
          </a>
        </div>
      </footer>
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
          ? "bg-accent-soft text-[#8fb8ff] ring-accent/25"
          : "bg-danger/10 text-[#ff8a8e] ring-danger/25"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${free > 0 ? "bg-accent" : "bg-danger"}`} />
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
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-5">
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
