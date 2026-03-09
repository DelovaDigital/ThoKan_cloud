'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export function CapacitorProviders() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Prevent default back button behavior on Android
    const handleAppBackButton = async () => {
      try {
        await App.exitApp();
      } catch (e) {
        console.error('Back button handler error:', e);
      }
    };

    let appBackButtonListener: { remove: () => Promise<void> } | undefined;
    let networkListener: { remove: () => Promise<void> } | undefined;

    const setupListeners = async () => {
      if (Capacitor.getPlatform() === 'android') {
        appBackButtonListener = await App.addListener('backButton', handleAppBackButton);
      }

      networkListener = await Network.addListener('networkStatusChange', (status) => {
        if (status.connected) {
          localStorage.setItem('isOnline', 'true');
        } else {
          localStorage.setItem('isOnline', 'false');
        }
      });
    };

    void setupListeners();

    return () => {
      void appBackButtonListener?.remove();
      void networkListener?.remove();
    };
  }, []);

  return null;
}
