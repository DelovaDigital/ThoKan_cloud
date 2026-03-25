import UIKit
import BackgroundTasks
import UserNotifications

class AppDelegate: UIResponder, UIApplicationDelegate {
    private let syncTaskIdentifier = "com.thokan.cloud.sync"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: syncTaskIdentifier, using: nil) { task in
            self.handleSyncTask(task: task as! BGProcessingTask)
        }

        // Set the notification delegate early so taps on banners work even when
        // the app was killed (AppNotificationMonitor will take over once logged in).
        UNUserNotificationCenter.current().delegate = self

        scheduleSyncTask()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        scheduleSyncTask()
    }

    private func scheduleSyncTask() {
        let request = BGProcessingTaskRequest(identifier: syncTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            return
        }
    }

    private func handleSyncTask(task: BGProcessingTask) {
        scheduleSyncTask()

        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        Task {
            let result = await BackgroundSyncCoordinator.shared.processQueuedActions()
            let hasFailure = result.failedMail > 0 || result.failedUploads > 0
            task.setTaskCompleted(success: !hasFailure)
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        NotificationCenter.default.post(name: .thokanDeviceTokenUpdated, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .thokanDeviceTokenUpdated, object: "")
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }
        let userInfo = response.notification.request.content.userInfo
        guard let tab = userInfo["target_tab"] as? Int else { return }
        NotificationCenter.default.post(name: .thokanOpenTab, object: tab)
        if let userId = userInfo["chat_user_id"] as? String, !userId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenChatUser, object: userId)
        }
        if let messageId = userInfo["mail_message_id"] as? String, !messageId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenMailMessage, object: messageId)
        }
        if let orderId = userInfo["shopify_order_id"] as? String, !orderId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenShopifyOrder, object: orderId)
        }
        if let conversationId = userInfo["shopify_chat_conversation_id"] as? String, !conversationId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenShopifyConversation, object: conversationId)
        }
    }
}
