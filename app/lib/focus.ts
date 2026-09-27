// Keyboard focus helpers shared by popovers, menus and dialogs.

export const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const getFocusableElements = (container: HTMLElement | null) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.offsetParent !== null
  );
};

export const trapTabWithinContainer = (event: KeyboardEvent, container: HTMLElement | null) => {
  if (event.key !== "Tab") return;

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement as HTMLElement | null;

  if (!container?.contains(activeElement)) {
    event.preventDefault();
    if (event.shiftKey) {
      last.focus();
    } else {
      first.focus();
    }
    return;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
