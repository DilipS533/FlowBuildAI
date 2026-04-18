import { useEffect, useRef } from "react";

export function useSpeechGuide(onStateChange) {
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const lastSpeechTextRef = useRef("");
  const lastSpeechAtRef = useRef(0);
  const restartTimerRef = useRef(null);

  function pumpQueue() {
    if (
      !("speechSynthesis" in window) ||
      speakingRef.current ||
      !queueRef.current.length
    ) {
      return;
    }

    const nextMessage = queueRef.current.shift();
    const now = Date.now();

    if (
      nextMessage === lastSpeechTextRef.current &&
      now - lastSpeechAtRef.current < 3000
    ) {
      pumpQueue();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(nextMessage);
    utterance.lang = "en-US";
    utterance.rate = 1.02;
    utterance.pitch = 0.96;

    utterance.onstart = () => {
      speakingRef.current = true;
      lastSpeechTextRef.current = nextMessage;
      lastSpeechAtRef.current = Date.now();
      onStateChange("Speaking");
    };

    utterance.onend = () => {
      speakingRef.current = false;
      onStateChange("Listening");
      pumpQueue();
    };

    utterance.onerror = () => {
      speakingRef.current = false;
      onStateChange("Ready");
      pumpQueue();
    };

    window.speechSynthesis.speak(utterance);
  }

  function cancelSpeech() {
    if (!("speechSynthesis" in window)) {
      return;
    }

    queueRef.current = [];
    speakingRef.current = false;
    window.speechSynthesis.cancel();

    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function speakSequence(messages, { interrupt = false } = {}) {
    if (!("speechSynthesis" in window)) {
      onStateChange("Unavailable");
      return;
    }

    const items = messages.map((message) => message.trim()).filter(Boolean);

    if (!items.length) {
      return;
    }

    if (interrupt) {
      cancelSpeech();
      queueRef.current = items;
      restartTimerRef.current = window.setTimeout(pumpQueue, 120);
      return;
    }

    queueRef.current.push(...items);
    pumpQueue();
  }

  useEffect(() => cancelSpeech, []);

  return {
    cancelSpeech,
    speakSequence,
  };
}
