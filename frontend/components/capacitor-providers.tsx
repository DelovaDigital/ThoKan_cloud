'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

export function CapacitorProviders() {
  useEffect(() => {
    // Prevent default back button behavior on Android
    const handleAppBackButton = async () => {
      try {
        await App.exitApp();
      } catch (e) {
        console.error('Back button handler error:', e);
      }
    };

    if (typeof window !== 'undefined' && 'Capacitor' in window) {
      App.addListener('backButton', handleAppBackButton);

      // Monitor network status
      const unsubscribe = Network.addListener('networkStatusChange', (status) => {
        if (status.connected) {
          localStorage.setItem('isOnline', 'true');
        } else {
          localStorage.setItem('isOnline', 'false');
        }
      });

      return () => {
        App.removeAllListeners();
        unsubscribe?.remove?.();
      };
    }
  }, []);

  return null;
}
