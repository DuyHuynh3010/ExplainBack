"use client";
import { useEffect, useRef, useState, type RefObject } from "react";

/** Keep the same graph DOM, selection and viewport in native and fallback modes. */
export function useGraphFullscreen(container: RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<"inline" | "native" | "overlay">("inline");
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => {
    const sync = () => setMode(previous => container.current && document.fullscreenElement === container.current
      ? "native" : previous === "native" ? "inline" : previous);
    document.addEventListener("fullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); };
  }, [container]);
  async function enter() {
    const element = container.current;
    if (!element || active.current) return;
    setError("");
    if (typeof element.requestFullscreen !== "function" || !document.fullscreenEnabled) {
      setMode("overlay"); return;
    }
    active.current = true; setPending(true);
    try {
      await element.requestFullscreen({ navigationUI: "hide" });
      if (document.fullscreenElement === element) setMode("native");
    } catch {
      setError("The browser denied fullscreen. Try again or allow fullscreen for this page.");
    } finally { active.current = false; setPending(false); }
  }
  async function exit() {
    setError("");
    if (container.current && document.fullscreenElement === container.current) {
      try { await document.exitFullscreen(); }
      catch { setError("Fullscreen could not close. Use the browser's Escape shortcut to exit."); }
    } else setMode("inline");
  }
  return { expanded: mode !== "inline", mode, pending, error, enter, exit };
}
