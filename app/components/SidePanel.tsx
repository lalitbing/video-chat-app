"use client";

import type { ReactNode } from "react";
import { CloseIcon } from "@/app/icons";

type SidePanelProps = {
  activeTab: "chat" | "participants";
  unreadMessageCount: number;
  participantCount: number;
  pendingParticipantCount: number;
  onSelectTab: (tab: "chat" | "participants") => void;
  onClose: () => void;
  children: ReactNode;
};

export const SidePanel = ({
  activeTab,
  unreadMessageCount,
  participantCount,
  pendingParticipantCount,
  onSelectTab,
  onClose,
  children,
}: SidePanelProps) => {
  const tabs = [
    {
      id: "chat" as const,
      label: "Chat",
      badge: unreadMessageCount > 0 ? String(unreadMessageCount) : null,
    },
    {
      id: "participants" as const,
      label: "People",
      badge: pendingParticipantCount > 0 ? `${pendingParticipantCount} waiting` : String(participantCount),
    },
  ];

  return (
    <aside className="absolute inset-0 z-30 flex animate-slide-in-right flex-col overflow-hidden rounded-[24px] bg-panel ring-1 ring-white/5 md:static md:w-[340px] md:shrink-0">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <div role="tablist" aria-label="Side panel" className="flex flex-1 gap-1 rounded-full bg-black/20 p-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectTab(tab.id)}
                className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition ${
                  isActive ? "bg-raised text-ink shadow-sm ring-1 ring-white/10" : "text-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {tab.badge ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      tab.id === "participants" && pendingParticipantCount > 0
                        ? "bg-danger text-white"
                        : tab.id === "chat"
                          ? "bg-accent text-white"
                          : "bg-white/10 text-ink/70"
                    }`}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          title="Close panel"
          aria-label="Close panel"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-white/[0.06] hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  );
};
