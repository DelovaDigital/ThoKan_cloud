'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export function CapacitorProviders() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      document.body.classList.add('platform-web');
      return;
    }

    const platform = Capacitor.getPlatform();
    document.body.classList.add('platform-native', `platform-${platform}`);

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
          window.dispatchEvent(new CustomEvent('network-online'));
        } else {
          localStorage.setItem('isOnline', 'false');
          console.warn('[Network] No connection available at startup');
          window.dispatchEvent(new CustomEvent('network-offline'));
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

      } catch (error) {
        console.error('[Network] Setup error:', error);
        // Assume online if we can't check network status
        localStorage.setItem('isOnline', 'true');
      }
    };

    void setupListeners();

    return () => {
      document.body.classList.remove('platform-native', `platform-${platform}`);
      void appBackButtonListener?.remove();
      void appStateListener?.remove();
      void networkListener?.remove();
    };
  }, []);

  return null;
}
