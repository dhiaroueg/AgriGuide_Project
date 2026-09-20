import { useCallback, useEffect, useState } from "react";

export type MessageFeedback = "up" | "down";

const STORAGE_KEY = "agriguide.chat-feedback";

type FeedbackMap = Record<string, MessageFeedback>;

function readFeedback(): FeedbackMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FeedbackMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFeedback(map: FeedbackMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function useMessageFeedback(agent: string) {
  const [feedback, setFeedback] = useState<FeedbackMap>({});

  useEffect(() => {
    setFeedback(readFeedback());
  }, []);

  const getFeedback = useCallback(
    (messageId: string): MessageFeedback | null => {
      return feedback[`${agent}:${messageId}`] ?? null;
    },
    [agent, feedback],
  );

  const setMessageFeedback = useCallback(
    (messageId: string, value: MessageFeedback) => {
      const key = `${agent}:${messageId}`;
      setFeedback((prev) => {
        const next = { ...prev, [key]: value };
        writeFeedback(next);
        return next;
      });
    },
    [agent],
  );

  return { getFeedback, setMessageFeedback };
}
