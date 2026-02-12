"use client";

import { useMemo, useState } from "react";
import type { PendingParticipant, RoomParticipant, RoomRole } from "@/app/hooks/useWebRTC";

type ParticipantsPanelProps = {
  participants: RoomParticipant[];
  pendingParticipants: PendingParticipant[];
  localDisplayName: string;
  localRole: RoomRole | null;
  isHost: boolean;
  admittingParticipantId: string | null;
  onAdmitParticipant: (participantId: string) => Promise<{ ok: boolean; error?: string }>;
};

const roleLabel = (role: RoomRole) => (role === "host" ? "Host" : "Participant");

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
    <div className="flex h-full flex-col bg-zinc-900 p-4">
      <div className="mb-3 text-sm font-semibold text-zinc-100">Participants</div>

      <div className="space-y-2 text-sm text-zinc-200">
        {participantRows.length === 0 ? (
          <div className="rounded-lg bg-zinc-800 px-3 py-2 text-zinc-400">
            No one has joined yet.
          </div>
        ) : (
          participantRows.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-100">
                  {participant.name}
                  {participant.isCurrentUser ? " (You)" : ""}
                </div>
                <div className="text-xs text-zinc-400">{roleLabel(participant.role)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {isHost ? (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Waiting for approval
          </div>

          {pendingParticipants.length === 0 ? (
            <div className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400">
              No one is waiting right now.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingParticipants.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2"
                >
                  <div className="min-w-0 pr-2 text-sm text-zinc-100">{request.name}</div>
                  <button
                    onClick={async () => {
                      setAdmissionError("");
                      const response = await onAdmitParticipant(request.id);
                      if (!response.ok) {
                        setAdmissionError(response.error ?? "Unable to admit participant.");
                      }
                    }}
                    disabled={admittingParticipantId === request.id}
                    className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {admittingParticipantId === request.id ? "Admitting..." : "Admit"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {admissionError ? <div className="mt-2 text-xs text-red-400">{admissionError}</div> : null}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
          {localRole === "participant"
            ? "Only the host can admit new participants."
            : "Host controls participant admission."}
        </div>
      )}
    </div>
  );
};
