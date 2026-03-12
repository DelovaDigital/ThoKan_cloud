export function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission(): NotificationPermission {
  if (!browserNotificationsSupported()) {
    return "denied";
  }

  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!browserNotificationsSupported()) {
    return "denied";
  }

  return Notification.requestPermission();
}

export function sendBrowserNotification(title: string, options?: NotificationOptions): void {
  if (!browserNotificationsSupported() || Notification.permission !== "granted") {
    return;
  }

  new Notification(title, options);
}