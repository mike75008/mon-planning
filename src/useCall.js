import { useCallback, useEffect, useRef, useState } from "react";
import {
  attachLocalTracks,
  createPeerConnection,
  getLocalStream,
  normalizeSdp,
} from "./webrtcCall.js";

async function callApi(path, { token, method = "GET", body } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API appels indisponible — attends le déploiement Render ou redémarre le serveur.");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Erreur appel");
  return json;
}

export function useCallManager({ getToken, userId, enabled, peopleById, onIncoming }) {
  const [callState, setCallState] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callError, setCallError] = useState("");
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const lastEventIdRef = useRef(0);
  const iceQueueRef = useRef([]);
  const offerSentRef = useRef(false);
  const roleRef = useRef(null);

  const cleanupMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceQueueRef.current = [];
    offerSentRef.current = false;
    roleRef.current = null;
  }, []);

  const endCall = useCallback(async () => {
    const callId = callState?.id;
    cleanupMedia();
    setCallState(null);
    setIncomingCall(null);
    lastEventIdRef.current = 0;
    if (callId) {
      try {
        const token = await getToken();
        await callApi(`/api/chat/calls/${callId}/end`, { token, method: "POST" });
      } catch {
        /* ignore */
      }
    }
  }, [callState?.id, cleanupMedia, getToken]);

  const flushIceQueue = useCallback(async (pc) => {
    const queue = [...iceQueueRef.current];
    iceQueueRef.current = [];
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const addIceCandidateSafe = useCallback(async (pc, candidate) => {
    if (!candidate) return;
    if (!pc.remoteDescription?.type) {
      iceQueueRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      iceQueueRef.current.push(candidate);
    }
  }, []);

  const setupPeerConnection = useCallback(async (call, token, stream) => {
    if (pcRef.current) return pcRef.current;
    const pc = createPeerConnection(
      (remote) => {
        setCallState((s) =>
          s ? { ...s, remoteReady: true, remoteStream: remote, ringing: false, connState: "connected" } : s
        );
      },
      async (candidate) => {
        await callApi(`/api/chat/calls/${call.id}/signal`, {
          token,
          method: "POST",
          body: { type: "ice", payload: candidate },
        });
      },
      (connState, iceState) => {
        setCallState((s) => (s ? { ...s, connState, iceState } : s));
        if (connState === "failed" || iceState === "failed") {
          setCallError("Connexion impossible — réseau bloqué. Réessaie en 4G ou autre Wi‑Fi.");
        }
      }
    );
    pcRef.current = pc;
    await attachLocalTracks(pc, stream);
    return pc;
  }, []);

  const sendOffer = useCallback(
    async (call, token) => {
      if (offerSentRef.current || !localStreamRef.current) return;
      offerSentRef.current = true;
      const pc = await setupPeerConnection(call, token, localStreamRef.current);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: call.mode === "video",
      });
      await pc.setLocalDescription(offer);
      await callApi(`/api/chat/calls/${call.id}/signal`, {
        token,
        method: "POST",
        body: { type: "offer", payload: pc.localDescription },
      });
      setCallState((s) => (s ? { ...s, connState: "connecting" } : s));
    },
    [setupPeerConnection]
  );

  const handleOffer = useCallback(
    async (ev, call, token) => {
      if (pcRef.current) return;
      const sdp = normalizeSdp(ev.payload);
      if (!sdp) {
        setCallError("Offre d'appel invalide — réessaie.");
        return;
      }
      try {
        let stream = localStreamRef.current;
        if (!stream) {
          stream = await getLocalStream(call.mode === "video");
          localStreamRef.current = stream;
        }
        const pc = await setupPeerConnection(call, token, stream);
        await pc.setRemoteDescription(sdp);
        await flushIceQueue(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await callApi(`/api/chat/calls/${call.id}/signal`, {
          token,
          method: "POST",
          body: { type: "answer", payload: pc.localDescription },
        });
        setCallState((s) =>
          s
            ? { ...s, localStream: stream, ringing: false, connState: "connecting" }
            : {
                id: call.id,
                mode: call.mode,
                role: "callee",
                otherId: call.callerId,
                localStream: stream,
                remoteReady: false,
                ringing: false,
                connState: "connecting",
              }
        );
      } catch (e) {
        setCallError(e.message);
      }
    },
    [flushIceQueue, setupPeerConnection]
  );

  const processSignalEvent = useCallback(
    async (ev, call, token) => {
      if (ev.userId === userId) return;
      try {
        if (ev.type === "offer") {
          await handleOffer(ev, call, token);
        } else if (ev.type === "answer" && pcRef.current) {
          const sdp = normalizeSdp(ev.payload);
          if (!sdp) return;
          await pcRef.current.setRemoteDescription(sdp);
          await flushIceQueue(pcRef.current);
          setCallState((s) => (s ? { ...s, ringing: false, connState: "connecting" } : s));
        } else if (ev.type === "ice" && pcRef.current) {
          await addIceCandidateSafe(pcRef.current, ev.payload);
        }
      } catch (e) {
        setCallError(e.message);
      }
    },
    [addIceCandidateSafe, flushIceQueue, handleOffer, userId]
  );

  const pollSignals = useCallback(
    async (callId) => {
      const token = await getToken();
      if (!token) return;
      const json = await callApi(`/api/chat/calls/${callId}/signals?after=${lastEventIdRef.current}`, { token });
      const call = json.call;

      if (call?.status === "ended") {
        cleanupMedia();
        setCallState(null);
        setIncomingCall(null);
        return;
      }

      // Appelant : n'envoie l'offre WebRTC qu'après acceptation (status active)
      if (roleRef.current === "caller" && call?.status === "active" && !offerSentRef.current) {
        await sendOffer(call, token);
      }

      for (const ev of json.events || []) {
        lastEventIdRef.current = Math.max(lastEventIdRef.current, ev.id);
        await processSignalEvent(ev, call, token);
      }
    },
    [cleanupMedia, getToken, processSignalEvent, sendOffer]
  );

  const startOutgoingCall = useCallback(
    async (otherUserId, mode) => {
      setCallError("");
      cleanupMedia();
      try {
        const token = await getToken();
        const video = mode === "video";
        const stream = await getLocalStream(video);
        localStreamRef.current = stream;

        const { call } = await callApi("/api/chat/calls", {
          token,
          method: "POST",
          body: { otherUserId, mode: video ? "video" : "phone" },
        });

        lastEventIdRef.current = 0;
        offerSentRef.current = false;
        roleRef.current = "caller";

        setCallState({
          id: call.id,
          mode: call.mode,
          role: "caller",
          otherId: otherUserId,
          localStream: stream,
          remoteReady: false,
          ringing: true,
          connState: "waiting",
        });
      } catch (e) {
        setCallError(e.message);
        cleanupMedia();
        setCallState(null);
      }
    },
    [cleanupMedia, getToken]
  );

  const acceptIncoming = useCallback(async () => {
    if (!incomingCall) return;
    setCallError("");
    try {
      const token = await getToken();
      const video = incomingCall.mode === "video";
      const stream = await getLocalStream(video);
      localStreamRef.current = stream;

      lastEventIdRef.current = 0;
      offerSentRef.current = false;
      roleRef.current = "callee";

      await callApi(`/api/chat/calls/${incomingCall.id}/accept`, { token, method: "POST" });
      const callId = incomingCall.id;
      const callerId = incomingCall.callerId;
      const callMode = incomingCall.mode;
      setIncomingCall(null);

      setCallState({
        id: callId,
        mode: callMode,
        role: "callee",
        otherId: callerId,
        localStream: stream,
        remoteReady: false,
        ringing: true,
        connState: "waiting",
      });

      await pollSignals(callId);
    } catch (e) {
      setCallError(e.message);
    }
  }, [getToken, incomingCall, pollSignals]);

  const declineIncoming = useCallback(async () => {
    if (!incomingCall) return;
    try {
      const token = await getToken();
      await callApi(`/api/chat/calls/${incomingCall.id}/decline`, { token, method: "POST" });
    } catch {
      /* ignore */
    }
    setIncomingCall(null);
  }, [getToken, incomingCall]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const checkIncoming = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled || callState) return;
        const json = await callApi("/api/chat/calls/incoming", { token });
        if (json.call && !cancelled) {
          const name = peopleById[json.call.callerId]?.name || "Quelqu'un";
          const next = { ...json.call, callerName: name };
          setIncomingCall((prev) => {
            if (prev?.id === next.id) return prev;
            onIncoming?.(next);
            return next;
          });
        }
      } catch {
        /* ignore */
      }
    };
    checkIncoming();
    const t = setInterval(checkIncoming, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, getToken, callState, peopleById, onIncoming]);

  useEffect(() => {
    if (!callState?.id) return;
    pollSignals(callState.id);
    const t = setInterval(() => pollSignals(callState.id), 500);
    return () => clearInterval(t);
  }, [callState?.id, pollSignals]);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  return {
    callState,
    incomingCall,
    callError,
    startOutgoingCall,
    acceptIncoming,
    declineIncoming,
    endCall,
  };
}
