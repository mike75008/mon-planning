import { useEffect, useRef } from "react";

function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jitsi-api="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.jitsiApi = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger Jitsi."));
    document.head.appendChild(script);
  });
}

async function ensureUnmuted(api) {
  try {
    const muted = await api.isAudioMuted();
    if (muted) api.executeCommand("toggleAudio");
  } catch {
    /* ignore */
  }
}

export default function JitsiCall({ roomName, displayName, audioOnly, onHangup }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        await loadJitsiScript();
        if (disposed || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: 360,
          userInfo: { displayName: displayName || "Utilisateur" },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: !!audioOnly,
            startSilent: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableNoisyMicDetection: false,
            enableNoAudioDetection: false,
            constraints: {
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: audioOnly ? false : { facingMode: "user" },
            },
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: ["microphone", "camera", "hangup", "fullscreen", "tileview"],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          },
        });

        api.addListener("readyToClose", () => onHangup?.());
        api.addListener("videoConferenceJoined", () => {
          setTimeout(() => ensureUnmuted(api), 600);
          setTimeout(() => ensureUnmuted(api), 2000);
        });
        api.addListener("audioMuteStatusChanged", ({ muted }) => {
          if (muted) setTimeout(() => ensureUnmuted(api), 300);
        });

        apiRef.current = api;
      } catch (e) {
        console.error("Jitsi:", e);
      }
    })();

    return () => {
      disposed = true;
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch {
          /* ignore */
        }
        apiRef.current = null;
      }
    };
  }, [roomName, displayName, audioOnly, onHangup]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", minHeight: 360, background: "#000", borderRadius: 8, overflow: "hidden" }}
    />
  );
}
