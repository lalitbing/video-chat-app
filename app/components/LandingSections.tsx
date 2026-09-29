"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import { SpeakingBars } from "@/app/components/ui/SpeakingBars";
import {
  ArrowRightIcon,
  ChatIcon,
  MicIcon,
  MicOffIcon,
  RecordIcon,
  ScreenShareIcon,
  VideoOnIcon,
} from "@/app/icons";

export type Capacity = { active: number; max: number };

// Fades a block up the first time it scrolls into view. Reduced motion is handled globally in CSS.
export const Reveal = ({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
};

const steps = [
  {
    title: "Start",
    body: "Type your name and hit Start meeting. We hand you the first free room.",
  },
  {
    title: "Share",
    body: "Send the room number, or copy the link from inside the call.",
  },
  {
    title: "Admit",
    body: "Guests land in a waiting room. You decide who comes in.",
  },
];

export const HowItWorks = () => (
  <section className="mx-auto w-full max-w-[1200px] px-4 py-20 sm:px-8 md:py-28">
    <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-12 md:gap-10">
      <Reveal className="md:col-span-5">
        <h2 className="max-w-md text-3xl font-bold leading-[1.1] tracking-[-0.03em] text-ink md:text-[2.6rem]">
          One number is the whole invite.
        </h2>
        <div
          aria-hidden
          className="mt-8 select-none font-mono text-[7rem] font-semibold leading-none tracking-[-0.04em] text-ink/90 md:text-[9.5rem]"
        >
          <span className="text-faint/60">0</span>42
        </div>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
          Rooms run from 1 to 999. Short enough to read out loud on a phone call.
        </p>
      </Reveal>

      <ol className="flex flex-col md:col-span-6 md:col-start-7">
        {steps.map((step, index) => (
          <Reveal key={step.title} delay={index * 90}>
            <li className="relative border-l border-line py-6 pl-8">
              <span
                aria-hidden
                className="absolute -left-[5px] top-8 h-[9px] w-[9px] rounded-full bg-accent ring-4 ring-canvas"
              />
              <h3 className="text-xl font-semibold tracking-tight text-ink">{step.title}</h3>
              <p className="mt-1.5 max-w-[42ch] text-[15px] leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  </section>
);

const waitingGuests = ["Priya Raman", "Tomás Okafor"];

export const FeatureBento = () => (
  <section className="mx-auto w-full max-w-[1200px] px-4 pb-20 sm:px-8 md:pb-28">
    <Reveal>
      <h2 className="max-w-xl text-3xl font-bold leading-[1.1] tracking-[-0.03em] text-ink md:text-[2.6rem]">
        Everything a call needs. Nothing to install.
      </h2>
    </Reveal>

    <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-6 md:grid-rows-[auto_auto_auto]">
      {/* Waiting room: tall anchor tile */}
      <Reveal className="md:col-span-4 md:row-span-2">
        <article className="flex h-full flex-col justify-between gap-10 overflow-hidden rounded-[28px] bg-panel p-7 ring-1 ring-white/5 md:p-9">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight text-ink">
              Nobody walks in unannounced.
            </h3>
            <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-muted">
              Whoever starts the room is the host. Everyone else knocks, and the host lets them in
              or turns them away.
            </p>
          </div>

          <ul aria-hidden className="flex max-w-md flex-col gap-2">
            {waitingGuests.map((name, index) => (
              <li
                key={name}
                className="flex items-center gap-3 rounded-2xl bg-raised/70 p-3 ring-1 ring-white/5"
              >
                <Avatar name={name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{name}</div>
                  <div className="text-xs text-[#8fb8ff]">Asking to join</div>
                </div>
                <span className="rounded-xl px-3 py-2 text-xs font-semibold text-muted ring-1 ring-white/10">
                  Deny
                </span>
                <span
                  className={`rounded-xl px-3 py-2 text-xs font-bold text-white ${
                    index === 0 ? "bg-accent" : "bg-accent/80"
                  }`}
                >
                  Admit
                </span>
              </li>
            ))}
          </ul>
        </article>
      </Reveal>

      {/* Screen share: the one accent-filled tile */}
      <Reveal className="md:col-span-2" delay={80}>
        <article className="relative flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br from-accent to-[#1447b8] p-7 text-white">
          <ScreenShareIcon className="h-9 w-9" />
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Share your screen</h3>
            <p className="mt-1 text-sm leading-relaxed text-white/80">
              It takes over the main tile so everyone sees the same thing.
            </p>
          </div>
        </article>
      </Reveal>

      {/* Chat */}
      <Reveal className="md:col-span-2" delay={140}>
        <article className="flex h-full min-h-[220px] flex-col justify-between gap-6 rounded-[28px] bg-panel p-7 ring-1 ring-white/5">
          <div aria-hidden className="flex items-end gap-2">
            <Avatar name="Theo" size="xs" />
            <div className="rounded-2xl rounded-bl-md bg-raised px-3 py-2 text-xs text-ink">
              Link to the doc?
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <ChatIcon className="h-4 w-4 text-accent" />
              <h3 className="text-lg font-semibold tracking-tight text-ink">Chat on the side</h3>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Paste links without interrupting whoever is talking.
            </p>
          </div>
        </article>
      </Reveal>

      {/* Recording */}
      <Reveal className="md:col-span-3" delay={80}>
        <article className="flex h-full items-center gap-5 rounded-[28px] bg-panel p-7 ring-1 ring-white/5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-danger/15 text-danger">
            <RecordIcon className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">Record the screen</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Saved straight to your computer as a WebM file.
            </p>
          </div>
        </article>
      </Reveal>

      {/* Mic and camera */}
      <Reveal className="md:col-span-3" delay={140}>
        <article className="flex h-full items-center gap-5 rounded-[28px] bg-[radial-gradient(120%_140%_at_100%_0%,rgb(47_123_246/0.18),transparent_60%)] bg-panel p-7 ring-1 ring-white/5">
          <div aria-hidden className="flex shrink-0 items-center gap-1.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-accent">
              <SpeakingBars className="h-4" />
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-ink">
              <MicIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger text-white">
              <MicOffIcon className="h-[18px] w-[18px]" />
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">See who is talking</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Speaker bars light up. Mute and camera are one tap away.
            </p>
          </div>
        </article>
      </Reveal>
    </div>
  </section>
);

export const PrivacyAndRooms = ({ capacity }: { capacity: Capacity | null }) => {
  const free = capacity ? Math.max(capacity.max - capacity.active, 0) : null;

  return (
    <section className="border-y border-line bg-shell/60">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-12 px-4 py-20 sm:px-8 md:grid-cols-12 md:gap-10 md:py-28">
        <Reveal className="md:col-span-6">
          <VideoOnIcon className="h-7 w-7 text-accent" />
          <h2 className="mt-5 max-w-lg text-3xl font-bold leading-[1.1] tracking-[-0.03em] text-ink md:text-[2.6rem]">
            Your video goes browser to browser.
          </h2>
          <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-muted">
            Audio and video travel directly between the people in the call. Our server only passes
            along the handshake and the chat.
          </p>
        </Reveal>

        <Reveal className="md:col-span-5 md:col-start-8" delay={100}>
          <div className="rounded-[28px] bg-panel p-7 ring-1 ring-white/5 md:p-8">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-lg font-semibold tracking-tight text-ink">Rooms right now</h3>
              <span className="text-sm text-muted" aria-live="polite">
                {capacity === null
                  ? "Checking..."
                  : free === 0
                    ? "All busy"
                    : `${free} of ${capacity.max} free`}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-5 gap-2" aria-hidden>
              {capacity === null
                ? Array.from({ length: 5 }, (_, index) => (
                    <span key={index} className="h-16 animate-pulse rounded-2xl bg-white/5" />
                  ))
                : Array.from({ length: capacity.max }, (_, index) => {
                    const isBusy = index < capacity.active;
                    return (
                      <span
                        key={index}
                        className={`flex h-16 items-end rounded-2xl p-2.5 transition-colors duration-500 ${
                          isBusy ? "bg-accent/85" : "bg-raised ring-1 ring-white/5"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-semibold ${isBusy ? "text-white" : "text-faint"}`}
                        >
                          {isBusy ? "In use" : "Free"}
                        </span>
                      </span>
                    );
                  })}
            </div>

            <p className="mt-6 text-sm leading-relaxed text-muted">
              We run {capacity?.max ?? 5} meetings at a time. When one ends, its room frees up for
              the next person.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export const ClosingCta = ({ onStart }: { onStart: () => void }) => (
  <section className="mx-auto w-full max-w-[1200px] px-4 py-24 sm:px-8 md:py-32">
    <Reveal className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
      <h2 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-[-0.035em] text-ink md:text-[3.5rem] text-balance">
        Your room is one click away.
      </h2>
      <button
        type="button"
        onClick={onStart}
        className="group flex h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl bg-accent px-7 text-base font-semibold text-white shadow-[0_16px_40px_-14px_rgba(47,123,246,0.9)] transition hover:bg-accent-strong active:scale-[0.98]"
      >
        Start meeting
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </Reveal>
  </section>
);
