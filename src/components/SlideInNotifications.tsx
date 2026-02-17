"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheckSquare, FiX } from "react-icons/fi";

type NotificationItem = {
  id: string;
  text: string;
};

const NOTIFICATION_TTL = 5000;

const NAMES = [
  "John Anderson",
  "Emily Peterson",
  "Frank Daniels",
  "Laura Williams",
  "Donald Sanders",
  "Tom Smith",
  "Alexandra Black",
];

const buildNotificationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const generateRandomNotif = (): NotificationItem => {
  const randomIndex = Math.floor(Math.random() * NAMES.length);
  return {
    id: buildNotificationId(),
    text: `New notification from ${NAMES[randomIndex]}`,
  };
};

const Notification = ({
  text,
  id,
  removeNotif,
}: {
  text: string;
  id: string;
  removeNotif: (id: string) => void;
}) => {
  useEffect(() => {
    const timeoutRef = window.setTimeout(() => {
      removeNotif(id);
    }, NOTIFICATION_TTL);

    return () => window.clearTimeout(timeoutRef);
  }, [id, removeNotif]);

  return (
    <motion.div
      layout
      initial={{ y: -15, scale: 0.95 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="pointer-events-auto flex items-start gap-2 rounded bg-indigo-500 p-2 text-xs font-medium text-white shadow-lg"
    >
      <FiCheckSquare className="mt-0.5" />
      <span>{text}</span>
      <button type="button" onClick={() => removeNotif(id)} className="ml-auto mt-0.5">
        <FiX />
      </button>
    </motion.div>
  );
};

export default function SlideInNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const removeNotif = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <div className="flex min-h-[200px] items-center justify-center bg-white">
      <button
        type="button"
        onClick={() => {
          setNotifications((prev) => [generateRandomNotif(), ...prev]);
        }}
        className="rounded bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-600 active:scale-95"
      >
        Add notification
      </button>
      <div className="pointer-events-none fixed right-2 top-2 z-50 flex w-72 flex-col gap-1">
        <AnimatePresence>
          {notifications.map((notification) => (
            <Notification
              key={notification.id}
              id={notification.id}
              text={notification.text}
              removeNotif={removeNotif}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

