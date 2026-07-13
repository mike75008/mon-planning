import { useCallback, useEffect, useRef, useState } from "react";
import { attachLocalTracks, createPeerConnection, getLocalStream, normalizeSdp } from "./webrtcCall.js";

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
    throw new Error("API appels indisponible.");
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
  const handlingOfferRef = useRef(false);

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
    handlingOfferRef.current = false;
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

  const ensurePeerConnection = useCallback(
    async (call, token, stream) => {
      if (pcRef.current) return pcRef.current;
      const pc = await createPeerConnection(
        getToken,
        (remote) => {
          setCallState((s) =>
            s ? { ...s, remoteReady: true, remoteStream: remote, ringing: false } : s
          );
        },
        async (candidate) => {
          await callApi(`/api/chat/calls/${call.id}/signal`, {
            token,
            method: "POST",
            body: { type: "ice", payload: candidate },
          });
        },
        (state) => {
          if (state === "failed" || state === "disconnected") {
            setCallError("Connexion perdue — raccroche et rappelle.");
          }
        }
      );
      pcRef.current = pc;
      attachLocalTracks(pc, stream);
      return pc;
    },
    [getToken]
  );

  const handleOffer = useCallback(
    async (ev, call, token) => {
      if (pcRef.current || handlingOfferRef.current) return;
      const sdp = normalizeSdp(ev.payload);
      if (!sdp) return;
      handlingOfferRef.current = true;
      try {
        let stream = localStreamRef.current;
        if (!stream) {
          const video = call.mode === "video";
          stream = await getLocalStream(video);
          localStreamRef.current = stream;
        }
        const pc = await ensurePeerConnection(call, token, stream);
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
            ? { ...s, localStream: stream, remoteReady: false, ringing: false }
            : {
                id: call.id,
                mode: call.mode,
                role: "callee",
                otherId: call.callerId,
                localStream: stream,
                remoteReady: false,
                ringing: false,
              }
        );
      } finally {
        handlingOfferRef.current = false;
      }
    },
    [ensurePeerConnection, flushIceQueue]
  );

  const processSignalEvent = useCallback(
    async (ev, call, token) => {
      if (ev.userId === userId) return;
      if (ev.type === "offer") {
        await handleOffer(ev, call, token);
      } else if (ev.type === "answer" && pcRef.current) {
        const sdp = normalizeSdp(ev.payload);
        if (!sdp) return;
        await pcRef.current.setRemoteDescription(sdp);
        await flushIceQueue(pcRef.current);
        setCallState((s) => (s ? { ...s, ringing: false } : s));
      } else if (ev.type === "ice" && pcRef.current) {
        await addIceCandidateSafe(pcRef.current, ev.payload);
      }
    },
    [addIceCandidateSafe, flushIceQueue, handleOffer, userId]
  );

  const pollSignals = useCallback(
    async (callId) => {
      const token = await getToken();
      if (!token) return;
      const json = await callApi(`/api/chat/calls/${callId}/signals?after=${lastEventIdRef.current}`, { token });
      if (json.call?.status === "ended") {
        cleanupMedia();
        setCallState(null);
        setIncomingCall(null);
        return;
      }
      for (const ev of json.events || []) {
        lastEventIdRef.current = Math.max(lastEventIdRef.current, ev.id);
        await processSignalEvent(ev, json.call, token);
      }
    },
    [cleanupMedia, getToken, processSignalEvent]
  );

  const startOutgoingCall = useCallback(
    async (otherUserId, mode) => {
      setCallError("");
      cleanupMedia();
      try {
        const video = mode === "video";
        const stream = await getLocalStream(video);
        localStreamRef.current = stream;
        const token = await getToken();
        const { call } = await callApi("/api/chat/calls", {
          token,
          method: "POST",
          body: { otherUserId, mode: video ? "video" : "phone" },
        });
        lastEventIdRef.current = 0;
        const pc = await ensurePeerConnection(call, token, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await callApi(`/api/chat/calls/${call.id}/signal`, {
          token,
          method: "POST",
          body: { type: "offer", payload: pc.localDescription },
        });
        setCallState({
          id: call.id,
          mode: call.mode,
          role: "caller",
          otherId: otherUserId,
          localStream: stream,
          remoteReady: false,
          ringing: true,
        });
      } catch (e) {
        setCallError(e.message);
        cleanupMedia();
        setCallState(null);
      }
    },
    [cleanupMedia, ensurePeerConnection, getToken]
  );

  const acceptIncoming = useCallback(async () => {
    if (!incomingCall) return;
    setCallError("");
    const snap = incomingCall;
    setIncomingCall(null);
    try {
      const video = snap.mode === "video";
      const stream = await getLocalStream(video);
      localStreamRef.current = stream;
      const token = await getToken();
      lastEventIdRef.current = 0;
      await callApi(`/api/chat/calls/${snap.id}/accept`, { token, method: "POST" });
      setCallState({
        id: snap.id,
        mode: snap.mode,
        role: "callee",
        otherId: snap.callerId,
        localStream: stream,
        remoteReady: false,
        ringing: true,
      });
      await pollSignals(snap.id);
    } catch (e) {
      setCallError(e.message);
      cleanupMedia();
      setCallState(null);
    }
  }, [cleanupMedia, getToken, incomingCall, pollSignals]);

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
    const t = setInterval(checkIncoming, 1200);
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
