const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:numb.viagenie.ca",
    username: "webrtc@live.com",
    credential: "webrtc",
  },
];

let iceServersPromise = null;

export function loadIceServers(getToken) {
  if (!iceServersPromise) {
    iceServersPromise = (async () => {
      try {
        const token = await getToken?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch("/api/chat/calls/ice", { headers });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.iceServers) && json.iceServers.length > 0) {
            return json.iceServers;
          }
        }
      } catch {
        /* fallback */
      }
      return DEFAULT_ICE_SERVERS;
    })();
  }
  return iceServersPromise;
}

export async function createPeerConnection(getToken, onRemoteTrack, onIce, onConnectionState) {
  const iceServers = await loadIceServers(getToken);
  const pc = new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
  });
  pc.ontrack = (ev) => {
    if (ev.track) onRemoteTrack(ev.track);
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) onIce(ev.candidate.toJSON());
  };
  pc.onconnectionstatechange = () => {
    onConnectionState?.(pc.connectionState, pc.iceConnectionState);
  };
  return pc;
}

export function waitIceGathering(pc, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    }, timeoutMs);
  });
}

export async function getLocalStream(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Micro ou caméra indisponible — utilise l'app en HTTPS sur Render.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  } catch (e) {
    if (e.name === "NotAllowedError") throw new Error("Autorise le micro (et la caméra) quand le navigateur le demande.");
    if (e.name === "NotFoundError") throw new Error("Micro ou caméra introuvable sur cet appareil.");
    throw new Error(e.message || "Accès micro/caméra refusé.");
  }
}

export async function attachLocalTracks(pc, stream) {
  for (const track of stream.getTracks()) {
    track.enabled = true;
    pc.addTrack(track, stream);
  }
}

export function normalizeSdp(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.type && payload.sdp) return { type: payload.type, sdp: payload.sdp };
  return null;
}

export async function playMediaElement(el, stream) {
  if (!el || !stream) return;
  el.srcObject = stream;
  try {
    await el.play();
  } catch {
    /* l'utilisateur a déjà cliqué */
  }
}
