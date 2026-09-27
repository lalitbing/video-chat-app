"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { VideoTile } from "@/app/components/VideoTile";
import { Avatar } from "@/app/components/ui/Avatar";
import { ScreenShareIcon } from "@/app/icons";

type VideoGridProps = {
  localStream: MediaStream | null;
  localCameraStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  remoteScreenStreams?: Record<string, MediaStream>;
  peerNames: Record<string, string>;
  peerVideoEnabled?: Record<string, boolean>;
  isLocalScreenSharing: boolean;
  currentSharerId: string | null;
  isLocalSharer: boolean;
  isVideoEnabled: boolean;
  localDisplayName: string;
  /** Call controls, floated over the featured tile. */
  controls?: ReactNode;
  onShowAllParticipants?: () => void;
};

type TileSpec = {
  key: string;
  stream: MediaStream | null;
  label: string;
  avatarName: string;
  muted: boolean;
  mirrored: boolean;
  videoOff: boolean;
};

// Tiles shown under the featured video before collapsing the rest into "+N more".
const MAX_STRIP_TILES = 4;

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

// Keeps audio playing for people collapsed into the "+N more" tile.
const HiddenAudio = ({ stream }: { stream: MediaStream | null }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
    if (stream?.active) {
      audioRef.current.play().catch(() => {});
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay className="hidden" />;
};

export const VideoGrid = ({
  localStream,
  localCameraStream,
  remoteStreams,
  remoteScreenStreams = {},
  peerNames,
  peerVideoEnabled = {},
  isLocalScreenSharing,
  currentSharerId,
  isLocalSharer,
  isVideoEnabled,
  localDisplayName,
  controls,
  onShowAllParticipants,
}: VideoGridProps) => {
  const localName = localDisplayName.trim() || "You";
  const remoteEntries = Object.entries(remoteStreams);
  const hasSharer = currentSharerId !== null;

  const renderTile = (tile: TileSpec, options: { fill?: boolean; className?: string } = {}) => (
    <VideoTile
      key={tile.key}
      stream={tile.stream}
      label={tile.label}
      avatarName={tile.avatarName}
      muted={tile.muted}
      mirrored={tile.mirrored}
      size="small"
      fill={options.fill}
      objectFit="cover"
      showVideoOffPlaceholder={tile.videoOff}
      placeholderLetter={initialOf(tile.avatarName)}
      className={options.className}
    />
  );

  const controlsDock = controls ? (
    <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-3 sm:bottom-5">{controls}</div>
  ) : null;

  if (hasSharer) {
    const sharerStream = isLocalSharer
      ? localStream
      : remoteScreenStreams[currentSharerId] ?? remoteStreams[currentSharerId] ?? null;
    const sharerName = isLocalSharer ? "You" : peerNames[currentSharerId] ?? "Someone";

    const cameraTiles: TileSpec[] = [
      {
        key: "you-camera",
        stream: isLocalSharer ? localCameraStream : localStream,
        label: "You",
        avatarName: localName,
        muted: true,
        mirrored: isLocalSharer || !isLocalScreenSharing,
        videoOff: !isVideoEnabled,
      },
    ];

    remoteEntries.forEach(([peerId, stream], index) => {
      const name = peerNames[peerId] ?? `Participant ${index + 1}`;
      cameraTiles.push({
        key: peerId === currentSharerId ? `${peerId}-camera` : peerId,
        stream: peerId === currentSharerId ? remoteStreams[peerId] ?? null : stream,
        label: name,
        avatarName: name,
        muted: false,
        mirrored: false,
        videoOff: peerVideoEnabled[peerId] === false,
      });
    });

    return (
      <div className="flex h-full w-full flex-col gap-3 md:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1">
          <VideoTile
            key={isLocalSharer ? "local-share" : `remote-share-${currentSharerId}`}
            stream={sharerStream}
            label={isLocalSharer ? "Your screen" : `${sharerName}'s screen`}
            muted={isLocalSharer}
            mirrored={false}
            size="large"
            objectFit="contain"
            detectSpeaking={false}
            hideLabel
          />
          <div className="glass pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-xs font-semibold text-white ring-1 ring-white/10">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent">
              <ScreenShareIcon className="h-3 w-3" />
            </span>
            {isLocalSharer ? "You're presenting" : `${sharerName} is presenting`}
          </div>
          {controlsDock}
        </div>

        <div className="flex h-28 shrink-0 gap-3 overflow-x-auto md:h-auto md:w-[min(28vw,18rem)] md:flex-col md:overflow-y-auto md:overflow-x-hidden">
          {cameraTiles.map((tile) => renderTile(tile, { className: "w-44 md:w-full" }))}
        </div>
      </div>
    );
  }

  const localTile: TileSpec = {
    key: "local",
    stream: localStream,
    label: "You",
    avatarName: localName,
    muted: true,
    mirrored: !isLocalScreenSharing,
    videoOff: !isVideoEnabled,
  };

  const remoteTiles: TileSpec[] = remoteEntries.map(([peerId, stream], index) => {
    const name = peerNames[peerId] ?? `Participant ${index + 1}`;
    return {
      key: peerId,
      stream,
      label: name,
      avatarName: name,
      muted: false,
      mirrored: false,
      videoOff: peerVideoEnabled[peerId] === false,
    };
  });

  const featured = remoteTiles[0] ?? localTile;
  const isAlone = remoteTiles.length === 0;
  const showPictureInPicture = remoteTiles.length === 1;
  const stripTiles = remoteTiles.length >= 2 ? [localTile, ...remoteTiles.slice(1)] : [];
  const overflowCount =
    stripTiles.length > MAX_STRIP_TILES ? stripTiles.length - (MAX_STRIP_TILES - 1) : 0;
  const visibleStripTiles = overflowCount ? stripTiles.slice(0, MAX_STRIP_TILES - 1) : stripTiles;
  const hiddenStripTiles = overflowCount ? stripTiles.slice(MAX_STRIP_TILES - 1) : [];
  const stripColumns = visibleStripTiles.length + (overflowCount ? 1 : 0);

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="relative min-h-0 flex-[1.7]">
        <VideoTile
          stream={featured.stream}
          label={featured.label}
          avatarName={featured.avatarName}
          muted={featured.muted}
          mirrored={featured.mirrored}
          size="large"
          objectFit="cover"
          showVideoOffPlaceholder={featured.videoOff}
          placeholderLetter={initialOf(featured.avatarName)}
        />

        {isAlone ? (
          <div className="glass pointer-events-none absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-white/10 sm:top-5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-warn" />
            Waiting for others to join...
          </div>
        ) : null}

        {showPictureInPicture ? (
          <div className="absolute right-3 top-3 z-10 w-36 overflow-hidden rounded-[18px] shadow-[0_18px_40px_-10px_rgba(0,0,0,0.75)] ring-1 ring-white/15 sm:right-4 sm:top-4 sm:w-56">
            {renderTile(localTile)}
          </div>
        ) : null}

        {controlsDock}
      </div>

      {stripColumns > 0 ? (
        <div
          className="grid min-h-[96px] flex-1 gap-3"
          style={{ gridTemplateColumns: `repeat(${stripColumns}, minmax(0, 1fr))` }}
        >
          {visibleStripTiles.map((tile) => renderTile(tile, { fill: true }))}
          {overflowCount ? (
            <button
              type="button"
              onClick={onShowAllParticipants}
              className="group flex min-h-0 flex-col items-center justify-center gap-2 rounded-[20px] bg-gradient-to-br from-[#26324a] to-[#1a2335] text-ink ring-1 ring-white/5 transition hover:ring-accent/60"
            >
              <span className="flex -space-x-2">
                {stripTiles.slice(MAX_STRIP_TILES - 1, MAX_STRIP_TILES + 2).map((tile) => (
                  <Avatar key={tile.key} name={tile.avatarName} size="sm" className="ring-2 ring-[#222c40]" />
                ))}
              </span>
              <span className="text-base font-semibold sm:text-lg">+{overflowCount} more</span>
            </button>
          ) : null}
          {hiddenStripTiles
            .filter((tile) => !tile.muted)
            .map((tile) => (
              <HiddenAudio key={`audio-${tile.key}`} stream={tile.stream} />
            ))}
        </div>
      ) : null}
    </div>
  );
};
