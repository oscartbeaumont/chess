import { isServer } from "@solidjs/web";

/** Registers the service worker that receives push messages. */
export function registerServiceWorker(): void {
  if (isServer || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail in private mode or unsupported browsers.
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/** True on iPhone, iPad and iPod (including iPadOS, which reports as a Mac). */
export function isIos(): boolean {
  if (isServer) return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** True when the app is running from the home screen or an installed window. */
export function isStandalone(): boolean {
  if (isServer) return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const VISITS_KEY = "chess:install-hint-visits";
const DISMISSED_KEY = "chess:install-hint-dismissed";

/** Counts one new top-level document load, for install-hint engagement. */
export function recordInstallVisit(): void {
  if (isServer || isStandalone()) return;
  try {
    const visits = Number(localStorage.getItem(VISITS_KEY) ?? "0");
    localStorage.setItem(VISITS_KEY, String(visits + 1));
  } catch {
    // Storage can be unavailable; the hint simply never appears.
  }
}

function installEligible(): boolean {
  if (isServer || !isIos() || isStandalone()) return false;
  // Safari only: other iOS browsers use a different menu than the copy names,
  // and in-app browsers cannot add to the Home Screen at all.
  if (/CriOS|FxiOS|GSA|FBAN|FBAV|Instagram/.test(navigator.userAgent)) return false;
  try {
    if (localStorage.getItem(DISMISSED_KEY) === "1") return false;
  } catch {
    return false;
  }
  return true;
}

/** Shows the hint only to engaged iOS Safari users who have not dismissed it. */
export function shouldShowInstallHint(): boolean {
  if (!installEligible()) return false;
  try {
    return Number(localStorage.getItem(VISITS_KEY) ?? "0") >= 2;
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Ignore.
  }
}
