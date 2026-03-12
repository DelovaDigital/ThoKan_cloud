import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://thokan.cloud';

function resolveAllowedHosts(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return Array.from(
      new Set([
        hostname,
        hostname.startsWith('www.') ? hostname.slice(4) : `www.${hostname}`,
      ]),
    );
  } catch {
    return ['thokan.cloud', 'www.thokan.cloud'];
  }
}

const config: CapacitorConfig = {
  appId: 'com.thokan.cloud',
  appName: 'ThoKan Cloud',
  webDir: 'out',
  server: {
    url: serverUrl,
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: resolveAllowedHosts(serverUrl),
  },
  plugins: {
    App: {
      packageName: 'com.thokan.cloud',
    },
  },
};

export default config;
