import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Enregistrement d'un message vocal depuis le navigateur.
 *
 * Le micro n'est ouvert que pendant l'enregistrement et relâché dès l'arrêt :
 * un onglet ne doit pas garder la pastille « micro actif » une fois le message
 * envoyé. Le format dépend du navigateur (webm sur Chrome et Firefox, mp4 sur
 * iOS) — le serveur accepte les deux.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

export interface VoiceRecording {
  file: File;
  url: string;
  seconds: number;
}

export function useVoiceRecorder(maxSeconds = 300) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const resolveRef = useRef<((r: VoiceRecording | null) => void) | null>(null);
  const secondsRef = useRef(0);

  const supported =
    typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!supported || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      secondsRef.current = 0;
      setSeconds(0);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        setRecording(false);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        // Un appui involontaire ne produit pas un message : sous une seconde,
        // on jette l'enregistrement.
        if (!resolve) return;
        if (blob.size === 0 || secondsRef.current < 1) {
          resolve(null);
          return;
        }
        const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `message-vocal-${Date.now()}.${extension}`, { type });
        resolve({ file, url: URL.createObjectURL(blob), seconds: secondsRef.current });
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);

      tickRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= maxSeconds) recorder.stop();
      }, 1000);
    } catch (e) {
      cleanup();
      setRecording(false);
      setError(
        e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? "Le micro est bloqué par le navigateur. Autorisez-le pour envoyer un message vocal."
          : "Aucun micro disponible.",
      );
    }
  }, [cleanup, maxSeconds, recording, supported]);

  /** Arrête et rend l'enregistrement, ou null s'il est trop court. */
  const stop = useCallback((): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(null);
    }

    return new Promise<VoiceRecording | null>((resolve) => {
      resolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  /** Abandonne l'enregistrement en cours : rien n'est envoyé. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    resolveRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setRecording(false);
    setSeconds(0);
  }, [cleanup]);

  return { supported, recording, seconds, error, start, stop, cancel };
}

/** 75 → « 1:15 ». */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
