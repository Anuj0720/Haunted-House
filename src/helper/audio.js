const SRC = "/sounds/background.mp3";

let el = null;
let wanted = false;
let listening = false;

function ensure() {
  if (!el) {
    el = new Audio(SRC);
    el.loop = true;
    el.volume = 0.6;
    el.preload = "auto";
  }
  if (!listening && typeof document !== "undefined") {
    listening = true;
    // Don't keep playing (or decoding) audio in a background tab.
    document.addEventListener("visibilitychange", () => {
      if (!el) return;
      if (document.hidden) el.pause();
      else if (wanted) el.play().catch(() => {});
    });
  }
  return el;
}

// Must be called from a click/tap handler so the browser allows playback.
export function enableSound() {
  wanted = true;
  return ensure()
    .play()
    .catch(() => {
      // File missing or playback blocked: report "off" so the UI stays honest.
      wanted = false;
    });
}

export function disableSound() {
  wanted = false;
  el?.pause();
}

export async function toggleSound() {
  if (wanted) disableSound();
  else await enableSound();
  return wanted;
}

export const isSoundOn = () => wanted;
