const ICE_SERVERS = [
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
];

export function createPeerConnection(onRemoteTrack, onIce, onConnectionState) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 });
  pc.ontrack = (ev) => {
    if (ev.streams?.[0]) onRemoteTrack(ev.streams[0]);
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) onIce(ev.candidate.toJSON());
  };
  pc.onconnectionstatechange = () => {
    onConnectionState?.(pc.connectionState, pc.iceConnectionState);
  };
  return pc;
}

export async function getLocalStream(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Micro/caméra indisponible — ouvre l'app en HTTPS (pas localhost entre appareils).");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  } catch (e) {
    if (e.name === "NotAllowedError") throw new Error("Autorise le micro (et la caméra) dans le navigateur.");
    if (e.name === "NotFoundError") throw new Error("Micro ou caméra introuvable.");
    throw new Error(e.message || "Accès micro/caméra refusé.");
  }
}

export async function attachLocalTracks(pc, stream) {
  for (const track of stream.getTracks()) {
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
    /* autoplay policy — user already interacted */
  }
}
