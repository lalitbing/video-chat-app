const LANDING_NAME_TTL_MS = 5 * 60 * 1000;

type PendingLandingName = {
  displayName: string;
  createdAt: number;
};

const pendingLandingNames = new Map<string, PendingLandingName>();

export const setPendingLandingName = (roomId: string, displayName: string) => {
  const trimmedName = displayName.trim().slice(0, 60);
  if (!roomId || !trimmedName) {
    return;
  }

  pendingLandingNames.set(roomId, {
    displayName: trimmedName,
    createdAt: Date.now(),
  });
};

export const consumePendingLandingName = (roomId: string) => {
  if (!roomId) {
    return "";
  }

  const pending = pendingLandingNames.get(roomId);
  pendingLandingNames.delete(roomId);

  if (!pending) {
    return "";
  }

  if (Date.now() - pending.createdAt > LANDING_NAME_TTL_MS) {
    return "";
  }

  return pending.displayName;
};

