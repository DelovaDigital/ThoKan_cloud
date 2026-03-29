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

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return routeIncomingURL(url)
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL else {
            return false
        }
        return routeIncomingURL(url)
    }

    @discardableResult
    private func routeIncomingURL(_ url: URL) -> Bool {
        let host = (url.host ?? "").lowercased()
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        let tabPath: String = {
            if !host.isEmpty && host != "open" {
                return host
            }
            return pathComponents.first?.lowercased() ?? "workspace"
        }()

        let tabIndex: Int
        switch tabPath {
        case "workspace", "home", "dashboard":
            tabIndex = 0
        case "files":
            tabIndex = 1
        case "chat":
            tabIndex = 2
        case "mail":
            tabIndex = 3
        case "shopify", "orders":
            tabIndex = 4
        case "admin":
            tabIndex = 5
        case "settings":
            tabIndex = 6
        default:
            tabIndex = 0
        }

        NotificationCenter.default.post(name: .thokanOpenTab, object: tabIndex)

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return true
        }

        let queryItems = components.queryItems ?? []
        let queryValue = { (key: String) -> String? in
            queryItems.first(where: { $0.name == key })?.value
        }

        if let userId = queryValue("chat_user_id") ?? queryValue("user_id"), !userId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenChatUser, object: userId)
        }

        if let messageId = queryValue("mail_message_id") ?? queryValue("message_id"), !messageId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenMailMessage, object: messageId)
        }

        if let orderId = queryValue("shopify_order_id") ?? queryValue("order_id"), !orderId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenShopifyOrder, object: orderId)
        }

        if let conversationId = queryValue("shopify_chat_conversation_id") ?? queryValue("conversation_id"), !conversationId.isEmpty {
            NotificationCenter.default.post(name: .thokanOpenShopifyConversation, object: conversationId)
        }

        return true
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
