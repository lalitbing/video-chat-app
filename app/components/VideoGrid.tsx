"use client";

import { VideoTile } from "@/app/components/VideoTile";

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
}: VideoGridProps) => {
  const localInitial = localDisplayName.trim().charAt(0).toUpperCase() || "?";
  const remoteEntries = Object.entries(remoteStreams);
  const hasSharer = currentSharerId !== null;

  if (hasSharer) {
    const sharerStream = isLocalSharer
      ? localStream
      : remoteScreenStreams[currentSharerId] ?? remoteStreams[currentSharerId] ?? null;
    const sharerName = isLocalSharer
      ? "You (shared screen)"
      : `${peerNames[currentSharerId] ?? "Someone"} (shared screen)`;

    const cameraTiles: Array<{
      key: string;
      stream: MediaStream | null;
      label: string;
      muted: boolean;
      mirrored: boolean;
      showVideoOffPlaceholder?: boolean;
      placeholderLetter?: string;
    }> = [];

    if (isLocalSharer) {
      cameraTiles.push({
        key: "you-camera",
        stream: localCameraStream,
        label: "You",
        muted: true,
        mirrored: true,
      });
    } else {
      cameraTiles.push({
        key: "you-camera",
        stream: localStream,
        label: "You",
        muted: true,
        mirrored: !isLocalScreenSharing,
      });
    }

    remoteEntries.forEach(([peerId, stream], index) => {
      const name = peerNames[peerId] ?? `Participant ${index + 1}`;
      const peerInitial = name.trim().charAt(0).toUpperCase() || "?";
      const videoOff = peerVideoEnabled[peerId] === false;
      if (peerId === currentSharerId) {
        const cam = remoteStreams[peerId] ?? null;
        if (cam) {
          cameraTiles.push({
            key: `${peerId}-camera`,
            stream: cam,
            label: name,
            muted: false,
            mirrored: false,
            showVideoOffPlaceholder: videoOff,
            placeholderLetter: peerInitial,
          });
        }
        return;
      }
      cameraTiles.push({
        key: peerId,
        stream,
        label: name,
        muted: false,
        mirrored: false,
        showVideoOffPlaceholder: videoOff,
        placeholderLetter: peerInitial,
      });
    });

    return (
      <div className="flex h-full w-full flex-row gap-0">
        {/* Shared content - left, max height/width, object-contain */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950 p-2">
          <div className="relative max-h-full max-w-full flex-1 min-w-0 min-h-0 overflow-hidden rounded-xl bg-zinc-900">
            <VideoTile
              key={isLocalSharer ? "local-share" : `remote-share-${currentSharerId}`}
              stream={sharerStream}
              label={sharerName}
              muted={isLocalSharer}
              mirrored={false}
              size="large"
              objectFit="contain"
            />
          </div>
        </div>
        {/* Video feeds - right, fixed width, scrollable, centered when few */}
        <div className="flex h-full w-[min(35vw,22rem)] min-w-[16rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-3">
          {cameraTiles.map(
            ({
              key,
              stream,
              label,
              muted,
              mirrored,
              showVideoOffPlaceholder,
              placeholderLetter,
            }) => (
              <VideoTile
                key={key}
                stream={stream}
                label={label}
                muted={muted}
                mirrored={mirrored}
                size="small"
                showVideoOffPlaceholder={
                  showVideoOffPlaceholder ??
                  (label === "You" ? !isVideoEnabled : undefined)
                }
                placeholderLetter={
                  placeholderLetter ?? (label === "You" ? localInitial : undefined)
                }
              />
            )
          )}
        </div>
      </div>
    );
  }

  const stageEntry = remoteEntries.length > 0 ? remoteEntries[0] : null;
  const stagePeerId = stageEntry?.[0] ?? null;
  const stageStream = stageEntry?.[1] ?? localStream;
  const stageLabel = stagePeerId ? peerNames[stagePeerId] ?? "Participant 1" : "You";
  const stageInitial = stageLabel.trim().charAt(0).toUpperCase() || "?";
  const stageVideoOff = stagePeerId
    ? peerVideoEnabled[stagePeerId] === false
    : !isVideoEnabled;
  const secondaryRemoteEntries = stagePeerId
    ? remoteEntries.filter(([peerId]) => peerId !== stagePeerId)
    : [];

  return (
    <div className="h-full w-full p-3">
      <div className="relative h-full w-full overflow-hidden rounded-3xl bg-zinc-950">
        <VideoTile
          stream={stageStream}
          label={stageLabel}
          muted={!stagePeerId}
          mirrored={!stagePeerId && !isLocalScreenSharing}
          size="large"
          objectFit="contain"
          showVideoOffPlaceholder={stageVideoOff}
          placeholderLetter={stageVideoOff ? stageInitial : undefined}
        />

        {remoteEntries.length === 0 ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-zinc-200">
            Waiting for others to join...
          </div>
        ) : (
          <div className="absolute bottom-4 right-4 z-20 flex max-h-[72%] w-56 flex-col gap-2 overflow-y-auto sm:w-64 rounded-2xl">
            <div className="rounded-2xl border border-white/20 bg-zinc-900/60 p-[2px] shadow-[0_14px_36px_rgba(0,0,0,0.62)]">
              <VideoTile
                stream={localStream}
                label="You"
                muted
                mirrored={!isLocalScreenSharing}
                size="small"
                showVideoOffPlaceholder={!isVideoEnabled}
                placeholderLetter={localInitial}
              />
            </div>

            {secondaryRemoteEntries.map(([peerId, stream], index) => {
              const name = peerNames[peerId] ?? `Participant ${index + 2}`;
              const peerInitial = name.trim().charAt(0).toUpperCase() || "?";
              const videoOff = peerVideoEnabled[peerId] === false;

              return (
                <VideoTile
                  key={peerId}
                  stream={stream}
                  label={name}
                  mirrored={false}
                  size="small"
                  showVideoOffPlaceholder={videoOff || undefined}
                  placeholderLetter={videoOff ? peerInitial : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
