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

export function useCallManager({ getToken, enabled, peopleById, onIncoming }) {
  const [callState, setCallState] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callError, setCallError] = useState("");

  const endCall = useCallback(async () => {
    const callId = callState?.id;
    setCallState(null);
    setIncomingCall(null);
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
          inRoom: false,
          ringing: true,
          canJoin: false,
        });
      } catch (e) {
        setCallError(e.message);
      }
    },
    [getToken]
  );

  // Décrocher = monte Jitsi tout de suite (geste utilisateur encore valide)
  const acceptIncoming = useCallback(() => {
    if (!incomingCall) return;
    setCallError("");
    const snap = incomingCall;
    setIncomingCall(null);
    setCallState({
      id: snap.id,
      mode: snap.mode,
      role: "callee",
      otherId: snap.callerId,
      roomName: roomForCall(snap.id),
      inRoom: true,
      ringing: false,
    });
    getToken().then((token) => {
      if (!token) return;
      callApi(`/api/chat/calls/${snap.id}/accept`, { token, method: "POST" }).catch((e) => {
        setCallError(e.message);
      });
    });
  }, [getToken, incomingCall]);

  const decrocher = useCallback(() => {
    if (!callState || callState.inRoom) return;
    setCallError("");
    setCallState((s) => (s ? { ...s, inRoom: true, ringing: false } : s));
  }, [callState]);

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

  // Appelant : sait quand l'autre a décroché
  useEffect(() => {
    if (!callState?.id || callState.role !== "caller" || callState.inRoom) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const json = await callApi(`/api/chat/calls/${callState.id}`, { token });
        if (json.call?.status === "ended") {
          setCallState(null);
        } else if (json.call?.status === "active") {
          setCallState((s) => (s && !s.canJoin ? { ...s, canJoin: true, ringing: false } : s));
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
  }, [callState?.id, callState?.role, callState?.inRoom, getToken]);

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
    startOutgoingCall,
    acceptIncoming,
    decrocher,
    declineIncoming,
    endCall,
  };
}
