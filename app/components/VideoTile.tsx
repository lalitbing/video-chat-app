"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import { SpeakingBars } from "@/app/components/ui/SpeakingBars";
import { useSpeaking } from "@/app/hooks/useSpeaking";

type VideoTileProps = {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  size?: "large" | "small";
  objectFit?: "cover" | "contain";
  showVideoOffPlaceholder?: boolean;
  placeholderLetter?: string;
  /** Name used for the avatar colour; defaults to the label. */
  avatarName?: string;
  /** Fill the parent instead of keeping a 16:9 box (small tiles only). */
  fill?: boolean;
  detectSpeaking?: boolean;
  hideLabel?: boolean;
  className?: string;
};

export const VideoTile = ({
  stream,
  label,
  muted,
  mirrored,
  size = "large",
  objectFit = "contain",
  showVideoOffPlaceholder,
  placeholderLetter,
  avatarName,
  fill = false,
  detectSpeaking = true,
  hideLabel = false,
  className = "",
}: VideoTileProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isSpeaking = useSpeaking(stream, detectSpeaking);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPortraitVideo, setIsPortraitVideo] = useState(false);
  const [isPortraitBox, setIsPortraitBox] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setIsPortraitBox(height > width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Phones held upright send portrait video; track it so we show the whole frame
  // instead of cropping it to fill a landscape tile.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.videoWidth && video.videoHeight) {
        setIsPortraitVideo(video.videoHeight > video.videoWidth * 1.05);
      }
    };
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    update();
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, [stream]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    if (stream?.active) {
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const isLarge = size === "large";
  const containerClass = isLarge
    ? "h-full w-full min-h-0 rounded-[24px]"
    : fill
      ? "h-full w-full min-h-0 rounded-[20px]"
      : isPortraitVideo
        ? "aspect-[3/4] w-full shrink-0 rounded-[18px]"
        : "aspect-video w-full shrink-0 rounded-[18px]";

  // Only zoom-to-fill when the video and its box have the same orientation;
  // otherwise show the whole frame so a phone feed isn't cropped to its middle.
  const effectiveFit = isPortraitVideo !== isPortraitBox ? "contain" : objectFit;
  const videoClass =
    effectiveFit === "contain" ? "h-full w-full object-contain" : "h-full w-full object-cover";

  const showPlaceholder = Boolean(showVideoOffPlaceholder && placeholderLetter);
  const personName = avatarName ?? label;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-gradient-to-br from-[#1b2536] to-[#121925] ring-1 transition-[box-shadow] duration-200 ${
        isSpeaking ? "ring-2 ring-accent shadow-[0_0_0_4px_rgba(47,123,246,0.18)]" : "ring-white/5"
      } ${containerClass} ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`${videoClass} ${mirrored ? "-scale-x-100" : ""} ${showPlaceholder ? "absolute opacity-0" : ""}`}
      />
      {showPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_45%,rgba(47,123,246,0.18),transparent_60%)]">
          <div className={isSpeaking ? "pulse-ring rounded-full" : "rounded-full"}>
            <Avatar
              name={personName}
              size={isLarge ? "xl" : "lg"}
              className={isLarge ? "ring-8 ring-white/5" : "ring-4 ring-white/5"}
            />
          </div>
        </div>
      )}
      <div className="tile-scrim pointer-events-none absolute inset-0" />
      {isLarge ? (
        // Featured tile: name top-left (clear of the control dock), like the brand shots.
        hideLabel ? null : (
          <div className="pointer-events-none absolute left-4 top-4 flex max-w-[70%] items-center gap-2 rounded-full bg-black/35 py-1.5 pl-3.5 pr-3 text-sm font-semibold text-white backdrop-blur-md sm:left-5 sm:top-5">
            <span className="truncate">{label}</span>
            {isSpeaking ? <SpeakingBars className="h-3 text-[#8fb8ff]" /> : null}
          </div>
        )
      ) : (
        <>
          {hideLabel ? null : (
            <div className="pointer-events-none absolute bottom-2.5 left-3 max-w-[75%] truncate text-xs font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
              {label}
            </div>
          )}
          {isSpeaking ? (
            <div className="pointer-events-none absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white shadow-lg">
              <SpeakingBars className="h-2.5" />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
