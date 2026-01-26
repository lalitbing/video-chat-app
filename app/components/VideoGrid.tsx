"use client";

import { VideoTile } from "@/app/components/VideoTile";

type VideoGridProps = {
  localStream: MediaStream | null;
  localCameraStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  remoteScreenStreams?: Record<string, MediaStream>;
  peerNames: Record<string, string>;
  peerScreenSharing: Record<string, boolean>;
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
  peerScreenSharing,
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
              stream={sharerStream}
              label={sharerName}
              muted={false}
              mirrored={false}
              size="large"
              objectFit="contain"
            />
          </div>
        </div>
        {/* Video feeds - right, fixed width, scrollable, centered when few */}
        <div className="flex h-full w-72 shrink-0 flex-col justify-center gap-2 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-2">
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

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="grid w-full max-w-5xl grid-cols-2 gap-4">
        <VideoTile
          stream={localStream}
          label="You"
          muted
          mirrored={!isLocalScreenSharing}
          size="large"
          objectFit="cover"
          showVideoOffPlaceholder={!isVideoEnabled}
          placeholderLetter={localInitial}
        />
        {remoteEntries.length === 0 ? (
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900 text-sm text-zinc-400">
            Waiting for others to join...
          </div>
        ) : (
          remoteEntries.map(([peerId, stream], index) => {
            const name = peerNames[peerId] ?? `Participant ${index + 1}`;
            const peerInitial = name.trim().charAt(0).toUpperCase() || "?";
            const videoOff = peerVideoEnabled[peerId] === false;
            return (
              <VideoTile
                key={peerId}
                stream={stream}
                label={name}
                mirrored={false}
                size="large"
                objectFit="cover"
                showVideoOffPlaceholder={videoOff || undefined}
                placeholderLetter={videoOff ? peerInitial : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
