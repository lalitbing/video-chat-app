const LANDING_NAME_TTL_MS = 5 * 60 * 1000;

export type LandingJoinIntent = "create" | "join";

type PendingLandingLaunch = {
  displayName: string;
  intent: LandingJoinIntent;
  createdAt: number;
};

const pendingLandingLaunches = new Map<string, PendingLandingLaunch>();

export const setPendingLandingLaunch = (
  roomId: string,
  displayName: string,
  intent: LandingJoinIntent
) => {
  const trimmedName = displayName.trim().slice(0, 60);
  if (!roomId || !trimmedName) {
    return;
  }

  pendingLandingLaunches.set(roomId, {
    displayName: trimmedName,
    intent,
    createdAt: Date.now(),
  });
};

export const consumePendingLandingLaunch = (roomId: string) => {
  if (!roomId) {
    return null;
  }

  const pending = pendingLandingLaunches.get(roomId);
  pendingLandingLaunches.delete(roomId);

  if (!pending) {
    return null;
  }

  if (Date.now() - pending.createdAt > LANDING_NAME_TTL_MS) {
    return null;
  }

  return {
    displayName: pending.displayName,
    intent: pending.intent,
  };
};
