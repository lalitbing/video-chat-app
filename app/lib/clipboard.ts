// Copies text to the clipboard, falling back to execCommand for browsers that block the API.
export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "absolute";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    return true;
  } catch {
    return false;
  }
};

export const getRoomShareLink = (roomId: string) =>
  typeof window === "undefined" ? `/room/${roomId}` : `${window.location.origin}/room/${roomId}`;
