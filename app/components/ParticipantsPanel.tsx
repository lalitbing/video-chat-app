"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import { Spinner } from "@/app/components/ui/Spinner";
import type { PendingParticipant, RoomParticipant, RoomRole } from "@/app/hooks/useWebRTC";
import { AlertIcon } from "@/app/icons";

type ParticipantsPanelProps = {
  participants: RoomParticipant[];
  pendingParticipants: PendingParticipant[];
  localDisplayName: string;
  localRole: RoomRole | null;
  isHost: boolean;
  admittingParticipantId: string | null;
  onAdmitParticipant: (participantId: string) => Promise<{ ok: boolean; error?: string }>;
};

const SectionLabel = ({ label, count }: { label: string; count: number }) => (
  <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
    {label}
    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-ink/70">{count}</span>
  </div>
);

export const ParticipantsPanel = ({
  participants,
  pendingParticipants,
  localDisplayName,
  localRole,
  isHost,
  admittingParticipantId,
  onAdmitParticipant,
}: ParticipantsPanelProps) => {
  const [admissionError, setAdmissionError] = useState("");

  const participantRows = useMemo(
    () =>
      participants.map((participant) => {
        const isCurrentUser = participant.name === localDisplayName;
        return {
          ...participant,
          isCurrentUser,
        };
      }),
    [localDisplayName, participants]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-4">
      {isHost ? (
        <section>
          <SectionLabel label="Waiting to join" count={pendingParticipants.length} />
          {pendingParticipants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-muted">
              No one is waiting right now.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingParticipants.map((request) => {
                const isAdmitting = admittingParticipantId === request.id;
                return (
                  <div
                    key={request.id}
                    className="flex animate-pop-in items-center gap-3 rounded-2xl bg-accent-soft p-2.5 pl-3 ring-1 ring-accent/30"
                  >
                    <Avatar name={request.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">{request.name}</div>
                      <div className="text-[11px] text-[#8fb8ff]">Asking to join</div>
                    </div>
                    <button
                      onClick={async () => {
                        setAdmissionError("");
                        const response = await onAdmitParticipant(request.id);
                        if (!response.ok) {
                          setAdmissionError(response.error ?? "Unable to admit participant.");
                        }
                      }}
                      disabled={isAdmitting}
                      className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-bold text-white transition hover:bg-accent-strong disabled:opacity-60"
                    >
                      {isAdmitting ? <Spinner className="h-3.5 w-3.5" /> : null}
                      {isAdmitting ? "Admitting..." : "Admit"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {admissionError ? (
            <div className="mt-2 flex items-center gap-1.5 px-1 text-xs font-medium text-[#ff8a8e]">
              <AlertIcon className="h-3.5 w-3.5" />
              {admissionError}
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <SectionLabel label="In the call" count={participantRows.length} />
        {participantRows.length === 0 ? (
          <div className="rounded-2xl bg-raised px-4 py-3 text-sm text-muted">No one has joined yet.</div>
        ) : (
          <div className="space-y-1">
            {participantRows.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.04]"
              >
                <Avatar name={participant.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">
                    {participant.name}
                    {participant.isCurrentUser ? <span className="font-medium text-muted"> (You)</span> : ""}
                  </div>
                  <div className="text-xs text-muted">
                    {participant.role === "host" ? "Host" : "Participant"}
                  </div>
                </div>
                {participant.role === "host" ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8fb8ff]">
                    Host
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {!isHost ? (
        <div className="mt-auto rounded-2xl bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-muted ring-1 ring-white/5">
          {localRole === "participant"
            ? "Only the host can admit new participants."
            : "Host controls participant admission."}
        </div>
      ) : null}
    </div>
  );
};
