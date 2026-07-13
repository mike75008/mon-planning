import { useCallback, useEffect, useState } from "react";

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

function roomForCall(callId) {
  return `MonPlanning-${callId}`;
}

async function requestCallPermissions(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Micro indisponible — utilise Chrome ou Safari récent.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: video ? { facingMode: "user" } : false,
  });
  stream.getTracks().forEach((t) => t.stop());
}

export function useCallManager({ getToken, enabled, peopleById, onIncoming }) {
  const [callState, setCallState] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callError, setCallError] = useState("");
  const [joining, setJoining] = useState(false);

  const endCall = useCallback(async () => {
    const callId = callState?.id;
    setCallState(null);
    setIncomingCall(null);
    setJoining(false);
    if (callId) {
      try {
        const token = await getToken();
        await callApi(`/api/chat/calls/${callId}/end`, { token, method: "POST" });
      } catch {
        /* ignore */
      }
    }
  }, [callState?.id, getToken]);

  const startOutgoingCall = useCallback(
    async (otherUserId, mode) => {
      setCallError("");
      try {
        const token = await getToken();
        const video = mode === "video";
        const { call } = await callApi("/api/chat/calls", {
          token,
          method: "POST",
          body: { otherUserId, mode: video ? "video" : "phone" },
        });
        setCallState({
          id: call.id,
          mode: call.mode,
          role: "caller",
          otherId: otherUserId,
          roomName: roomForCall(call.id),
          canJoin: false,
          inRoom: false,
          ringing: true,
        });
      } catch (e) {
        setCallError(e.message);
      }
    },
    [getToken]
  );

  const acceptIncoming = useCallback(async () => {
    if (!incomingCall) return;
    setCallError("");
    try {
      const token = await getToken();
      await callApi(`/api/chat/calls/${incomingCall.id}/accept`, { token, method: "POST" });
      setCallState({
        id: incomingCall.id,
        mode: incomingCall.mode,
        role: "callee",
        otherId: incomingCall.callerId,
        roomName: roomForCall(incomingCall.id),
        canJoin: true,
        inRoom: false,
        ringing: false,
      });
      setIncomingCall(null);
    } catch (e) {
      setCallError(e.message);
    }
  }, [getToken, incomingCall]);

  const joinCall = useCallback(async () => {
    if (!callState?.canJoin || callState.inRoom || joining) return;
    setCallError("");
    setJoining(true);
    try {
      await requestCallPermissions(callState.mode === "video");
      setCallState((s) => (s ? { ...s, inRoom: true } : s));
    } catch (e) {
      if (e.name === "NotAllowedError") {
        setCallError("Autorise le micro (et la caméra) quand le navigateur le demande.");
      } else {
        setCallError(e.message);
      }
    } finally {
      setJoining(false);
    }
  }, [callState, joining]);

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
    if (!callState?.id || callState.role !== "caller" || callState.canJoin) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const json = await callApi(`/api/chat/calls/${callState.id}`, { token });
        if (json.call?.status === "ended") {
          setCallState(null);
          return;
        }
        if (json.call?.status === "active") {
          setCallState((s) => (s ? { ...s, canJoin: true, ringing: false } : s));
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const t = setInterval(poll, 800);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [callState?.id, callState?.role, callState?.canJoin, getToken]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = async () => {
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
    check();
    const t = setInterval(check, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, getToken, callState, peopleById, onIncoming]);

  return {
    callState,
    incomingCall,
    callError,
    joining,
    startOutgoingCall,
    acceptIncoming,
    joinCall,
    declineIncoming,
    endCall,
  };
}
