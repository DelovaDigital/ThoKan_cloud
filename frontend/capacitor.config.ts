import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thokan.cloud',
  appName: 'ThoKan Cloud',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['*'],
  },
  plugins: {
    App: {
      packageName: 'com.thokan.cloud',
    },
  },
};

export default config;
