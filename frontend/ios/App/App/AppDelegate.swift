import UIKit
import BackgroundTasks

class AppDelegate: UIResponder, UIApplicationDelegate {
    private let syncTaskIdentifier = "com.thokan.cloud.sync"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: syncTaskIdentifier, using: nil) { task in
            self.handleSyncTask(task: task as! BGProcessingTask)
        }

        scheduleSyncTask()
        true
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
