export const MIN_ROOM_ID = 1;
export const MAX_ROOM_ID = 999;

export const generateRoomId = () =>
  String(Math.floor(Math.random() * (MAX_ROOM_ID - MIN_ROOM_ID + 1)) + MIN_ROOM_ID);

export const sanitizeRoomInput = (value: string) => value.replace(/\D/g, "").slice(0, 3);

export const normalizeRoomId = (value: string): string | null => {
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }
  const numeric = Number.parseInt(cleaned, 10);
  if (!Number.isInteger(numeric) || numeric < MIN_ROOM_ID || numeric > MAX_ROOM_ID) {
    return null;
  }
  return String(numeric);
};
