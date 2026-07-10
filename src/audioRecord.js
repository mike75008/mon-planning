export async function startAudioRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Micro non disponible sur cet appareil ou navigateur.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];

  recorder.addEventListener("dataavailable", (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });

  const result = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = recorder.mimeType || "audio/webm";
      resolve({ blob: new Blob(chunks, { type }), mimeType: type });
    });
    recorder.addEventListener("error", () => {
      stream.getTracks().forEach((t) => t.stop());
      reject(new Error("Erreur d'enregistrement audio"));
    });
  });

  recorder.start();

  return {
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
    result,
  };
}
