"use client";

import {
  ChatIcon,
  EndCallIcon,
  MicIcon,
  MicOffIcon,
  RecordIcon,
  ScreenShareIcon,
  VideoOffIcon,
  VideoOnIcon,
} from "@/app/icons";

type BottomBarProps = {
  roomId: string;
  isMuted: boolean;
  onToggleMute: () => void;
  isVideoEnabled: boolean;
  onToggleVideo: () => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onEndCall: () => void;
};

export const BottomBar = ({
  roomId,
  isMuted,
  onToggleMute,
  isVideoEnabled,
  onToggleVideo,
  isScreenSharing,
  onToggleScreenShare,
  isRecording,
  onStartRecording,
  onStopRecording,
  isChatOpen,
  onToggleChat,
  onEndCall,
}: BottomBarProps) => {
  const controlButton =
    "flex h-12 w-12 items-center justify-center rounded-full transition";
  const neutralBtn =
    "bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600";
  const activeBtn = "bg-white text-zinc-900";
  const dangerBtn = "bg-red-500 text-white hover:bg-red-600";

  return (
    <footer className="flex items-center justify-between border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Left: Room ID */}
      <div className="hidden min-w-[120px] text-sm text-zinc-500 sm:block">
        Room: <span className="font-medium text-zinc-900 dark:text-zinc-100">{roomId}</span>
      </div>

      {/* Center: Controls */}
      <div className="flex flex-1 items-center justify-center gap-3">
        <button
          onClick={onToggleMute}
          title={isMuted ? "Unmute" : "Mute"}
          className={`${controlButton} ${isMuted ? activeBtn : neutralBtn}`}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button
          onClick={onToggleVideo}
          title={isVideoEnabled ? "Turn off video" : "Turn on video"}
          className={`${controlButton} ${!isVideoEnabled ? activeBtn : neutralBtn}`}
        >
          {isVideoEnabled ? <VideoOnIcon /> : <VideoOffIcon />}
        </button>
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
          className={`${controlButton} ${isScreenSharing ? activeBtn : neutralBtn}`}
        >
          <ScreenShareIcon />
        </button>
        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          title={isRecording ? "Stop recording" : "Record"}
          className={`${controlButton} ${isRecording ? dangerBtn : neutralBtn}`}
        >
          <RecordIcon />
        </button>
        <button
          onClick={onEndCall}
          title="End call"
          className={`${controlButton} ${dangerBtn}`}
        >
          <EndCallIcon />
        </button>
      </div>

      {/* Right: Chat toggle */}
      <div className="flex min-w-[120px] justify-end">
        <button
          onClick={onToggleChat}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
            isChatOpen
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          }`}
        >
          <ChatIcon />
          <span className="hidden sm:inline">Chat</span>
        </button>
      </div>
    </footer>
  );
};
