'use client';

import React, { useSyncExternalStore } from 'react';
import { ToastContainer } from './ToastContainer';
import { useNotifications } from '@/contexts/NotificationContext';
import { ToastNotification } from '@/types/notifications';

const hydrationStore = (() => {
  let hydrated = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => hydrated,
    getServerSnapshot: () => false,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (typeof window !== 'undefined' && !hydrated) {
        queueMicrotask(() => {
          hydrated = true;
          notify();
        });
      }
      return () => listeners.delete(listener);
    },
  };
})();

const nowStore = (() => {
  let value = 0;
  const listeners = new Set<() => void>();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => value,
    getServerSnapshot: () => 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (typeof window !== 'undefined' && intervalId === null) {
        value = Date.now();
        intervalId = setInterval(() => {
          value = Date.now();
          notify();
        }, 1000);
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };
    },
  };
})();

export const NotificationSystem: React.FC = () => {
  const { notifications, dismissToast, preferences } = useNotifications();
  const isHydrated = useSyncExternalStore(
    hydrationStore.subscribe,
    hydrationStore.getSnapshot,
    hydrationStore.getServerSnapshot,
  );
  const now = useSyncExternalStore(
    nowStore.subscribe,
    nowStore.getSnapshot,
    nowStore.getServerSnapshot,
  );

  if (!isHydrated) {
    return null;
  }
  
  // Convert BaseNotifications to ToastNotifications for display
  const toastNotifications: ToastNotification[] = notifications
    .filter(n => 
      // Show notifications that are less than 30 seconds old or persistent
      n.persistent || (now - new Date(n.timestamp).getTime()) < 30000
    )
    .map(n => ({
      ...n,
      duration: preferences.autoHideDelay,
      dismissible: true,
      position: 'top-right' as const,
    }));

  return (
    <ToastContainer
      notifications={toastNotifications}
      onDismiss={dismissToast}
      position="top-right"
      maxNotifications={5}
    />
  );
};
