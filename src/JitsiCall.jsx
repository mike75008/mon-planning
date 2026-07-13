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
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: ["microphone", "camera", "hangup", "fullscreen"],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
          },
        });

        api.addListener("readyToClose", () => onHangup?.());
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
