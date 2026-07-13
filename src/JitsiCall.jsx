import { useEffect, useRef } from "react";

let jitsiLoadPromise = null;

export function preloadJitsi() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (jitsiLoadPromise) return jitsiLoadPromise;
  jitsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.jitsiApi = "1";
    script.onload = () => resolve();
    script.onerror = () => {
      jitsiLoadPromise = null;
      reject(new Error("Impossible de charger le moteur d'appel."));
    };
    document.head.appendChild(script);
  });
  return jitsiLoadPromise;
}

export default function JitsiCall({ roomName, displayName, audioOnly, onHangup, onReady }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    let disposed = false;

    preloadJitsi()
      .then(() => {
        if (disposed || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: displayName || "Utilisateur" },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: !!audioOnly,
            startSilent: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableClosePage: false,
            hideConferenceSubject: true,
            hideConferenceTimer: true,
            disableInviteFunctions: true,
            disableRemoteMute: true,
            enableNoisyMicDetection: false,
            enableNoAudioDetection: false,
            subject: " ",
            constraints: {
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: audioOnly ? false : { facingMode: "user" },
            },
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: ["microphone", "camera", "hangup", "fullscreen"],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            HIDE_INVITE_MORE_HEADER: true,
            DISPLAY_WELCOME_PAGE_CONTENT: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            filmStripOnly: false,
            TILE_VIEW_MAX_COLUMNS: 2,
          },
        });

        api.addListener("readyToClose", () => onHangup?.());
        api.addListener("videoConferenceJoined", () => {
          onReady?.();
          setTimeout(async () => {
            try {
              if (await api.isAudioMuted()) api.executeCommand("toggleAudio");
            } catch {
              /* ignore */
            }
          }, 500);
        });

        apiRef.current = api;
      })
      .catch((e) => console.error("Jitsi:", e));

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
  }, [roomName, displayName, audioOnly, onHangup, onReady]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: 340, background: "#000", borderRadius: 8, overflow: "hidden" }}
    />
  );
}
