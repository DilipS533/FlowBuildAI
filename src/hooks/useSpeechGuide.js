import { useEffect, useRef } from "react";

function pickPreferredVoice() {
  const list = window.speechSynthesis?.getVoices?.() ?? [];
  if (!list.length) {
    return null;
  }

  const rank = (v) => {
    const n = `${v.name} ${v.voiceURI || ""}`.toLowerCase();
    let score = 0;
    if (/neural|premium|enhanced|natural/.test(n)) {
      score += 6;
    }
    if (/female|woman|samantha|victoria|karen|zira|jenny|aria|moira|fiona|serena/.test(n)) {
      score += 4;
    }
    if (/google|microsoft|apple/.test(n)) {
      score += 2;
    }
    if (v.lang?.toLowerCase().startsWith("en")) {
      score += 1;
    }
    return score;
  };

  return [...list].sort((a, b) => rank(b) - rank(a))[0] ?? list[0];
}

export function useSpeechGuide(onStateChange) {
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const lastSpeechTextRef = useRef("");
  const lastSpeechAtRef = useRef(0);
  const restartTimerRef = useRef(null);
  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return undefined;
    }

    const warm = () => {
      window.speechSynthesis.getVoices();
    };

    warm();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warm);
    };
  }, []);

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

    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }

    const utterance = new SpeechSynthesisUtterance(nextMessage);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    utterance.pitch = 1.04;
    utterance.volume = 0.9;

    const voice = pickPreferredVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      speakingRef.current = true;
      lastSpeechTextRef.current = nextMessage;
      lastSpeechAtRef.current = Date.now();
      onStateChange("Speaking");
    };

    utterance.onend = () => {
      speakingRef.current = false;
      if (!queueRef.current.length) {
        onStateChange("Ready");
      } else {
        onStateChange("Listening");
      }
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
