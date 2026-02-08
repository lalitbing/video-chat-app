"use client";

import { useEffect, useRef } from "react";

type VideoTileProps = {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  size?: "large" | "small";
  objectFit?: "cover" | "contain";
  showVideoOffPlaceholder?: boolean;
  placeholderLetter?: string;
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
}: VideoTileProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    if (stream?.active) {
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const containerClass =
    size === "small"
      ? "relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-zinc-900"
      : "relative h-full w-full min-h-0 overflow-hidden rounded-2xl bg-zinc-900";

  const videoClass =
    objectFit === "contain" ? "h-full w-full object-contain" : "h-full w-full object-cover";

  const showPlaceholder = Boolean(showVideoOffPlaceholder && placeholderLetter);

  return (
    <div className={containerClass}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`${videoClass} ${mirrored ? "-scale-x-100" : ""} ${showPlaceholder ? "opacity-0 absolute" : ""}`}
      />
      {showPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-700 text-xl font-semibold text-white sm:h-16 sm:w-16 sm:text-2xl"
            aria-hidden
          >
            {placeholderLetter}
          </span>
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
        {label}
      </div>
    </div>
  );
};
