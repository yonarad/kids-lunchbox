import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-prompt-dismissed-at";
const DISMISS_DAYS = 7;

function wasRecentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ageMs = Date.now() - Number(v);
    return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    if (isIOS()) {
      // Show iOS hint after a short delay
      const t = setTimeout(() => setShowIos(true), 1500);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBIP);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  if (dismissed) return null;
  if (!deferred && !showIos) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-pop">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" width={48} height={48} className="rounded-xl" />
        <div className="flex-1">
          <p className="font-bold text-foreground">התקינו את האפליקציה</p>
          {deferred ? (
            <p className="text-sm text-muted-foreground">שמרו את קופסת האוכל למסך הבית לגישה מהירה.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              לחצו על כפתור השיתוף בספארי ואז על "הוסף למסך הבית".
            </p>
          )}
          {deferred && (
            <Button onClick={install} size="sm" className="mt-2 gap-2">
              <Download className="h-4 w-4" />
              התקנה
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
