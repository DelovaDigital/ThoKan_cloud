'use client';

import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export function CapacitorProviders() {
  const [isNetworkReady, setIsNetworkReady] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setIsNetworkReady(true);
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
    let appStateListener: { remove: () => Promise<void> } | undefined;
    let networkListener: { remove: () => Promise<void> } | undefined;

    const setupListeners = async () => {
      try {
        // Check initial network status on app startup
        const status = await Network.getStatus();
        if (status.connected) {
          localStorage.setItem('isOnline', 'true');
          console.log('[Network] Connected to thokan.cloud on startup');
        } else {
          localStorage.setItem('isOnline', 'false');
          console.warn('[Network] No connection available at startup');
        }

        if (Capacitor.getPlatform() === 'android') {
          appBackButtonListener = await App.addListener('backButton', handleAppBackButton);
        }

        appStateListener = await App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            window.dispatchEvent(new CustomEvent('app-active'));
          }
        });

        // Listen for network changes
        networkListener = await Network.addListener('networkStatusChange', (status) => {
          if (status.connected) {
            localStorage.setItem('isOnline', 'true');
            console.log('[Network] Connected to thokan.cloud');
            // Trigger potential auth refresh or data sync on reconnection
            window.dispatchEvent(new CustomEvent('network-online'));
          } else {
            localStorage.setItem('isOnline', 'false');
            console.warn('[Network] Disconnected from thokan.cloud');
            window.dispatchEvent(new CustomEvent('network-offline'));
          }
        });

        setIsNetworkReady(true);
      } catch (error) {
        console.error('[Network] Setup error:', error);
        // Assume online if we can't check network status
        localStorage.setItem('isOnline', 'true');
        setIsNetworkReady(true);
      }
    };

    void setupListeners();

    return () => {
      void appBackButtonListener?.remove();
      void appStateListener?.remove();
      void networkListener?.remove();
    };
  }, []);

  return null;
}
