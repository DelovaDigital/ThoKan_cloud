import Foundation
import UserNotifications

final class CacheStore {
    static let shared = CacheStore()

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {}

    func save<T: Encodable>(_ value: T, forKey key: String) {
        do {
            let data = try encoder.encode(value)
            UserDefaults.standard.set(data, forKey: key)
        } catch {
            return
        }
    }

    func load<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    func remove(forKey key: String) {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

struct QueuedMailAction: Codable, Identifiable {
    let id: UUID
    let to: String
    let subject: String
    let body: String
    let createdAt: Date
}

struct QueuedUploadAction: Codable, Identifiable {
    let id: UUID
    let localFilePath: String
    let folderId: String?
    let createdAt: Date
}

struct QueueSnapshot: Codable {
    var mailActions: [QueuedMailAction] = []
    var uploadActions: [QueuedUploadAction] = []
}

actor OfflineActionQueue {
    static let shared = OfflineActionQueue()

    private let queueKey = "offline.action.queue"
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {}

    func snapshot() -> QueueSnapshot {
        guard let data = UserDefaults.standard.data(forKey: queueKey),
              let queue = try? decoder.decode(QueueSnapshot.self, from: data) else {
            return QueueSnapshot()
        }
        return queue
    }

    func enqueueMail(to: String, subject: String, body: String) {
        var queue = snapshot()
        queue.mailActions.append(
            QueuedMailAction(
                id: UUID(),
                to: to,
                subject: subject,
                body: body,
                createdAt: Date()
            )
        )
        save(queue)
    }

    func enqueueUpload(localFilePath: String, folderId: String?) {
        var queue = snapshot()
        queue.uploadActions.append(
            QueuedUploadAction(
                id: UUID(),
                localFilePath: localFilePath,
                folderId: folderId,
                createdAt: Date()
            )
        )
        save(queue)
    }

    func replace(_ queue: QueueSnapshot) {
        save(queue)
    }

    private func save(_ queue: QueueSnapshot) {
        guard let data = try? encoder.encode(queue) else { return }
        UserDefaults.standard.set(data, forKey: queueKey)
    }
}

enum OfflineFileStager {
    static func stageFileForRetry(sourceURL: URL) throws -> URL {
        let fileManager = FileManager.default
        let appSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let queueDir = appSupport.appendingPathComponent("OfflineQueue", isDirectory: true)
        if !fileManager.fileExists(atPath: queueDir.path) {
            try fileManager.createDirectory(at: queueDir, withIntermediateDirectories: true)
        }

        let target = queueDir.appendingPathComponent("\(UUID().uuidString)-\(sourceURL.lastPathComponent)")
        if fileManager.fileExists(atPath: target.path) {
            try fileManager.removeItem(at: target)
        }
        try fileManager.copyItem(at: sourceURL, to: target)
        return target
    }
}

struct QueueProcessResult {
    let processedMail: Int
    let processedUploads: Int
    let failedMail: Int
    let failedUploads: Int
}

actor BackgroundSyncCoordinator {
    static let shared = BackgroundSyncCoordinator()

    private let notificationCenter = UNUserNotificationCenter.current()

    private init() {}

    func processQueuedActions() async -> QueueProcessResult {
        var queue = await OfflineActionQueue.shared.snapshot()

        var processedMail = 0
        var processedUploads = 0
        var failedMail = 0
        var failedUploads = 0

        var remainingMail: [QueuedMailAction] = []
        for action in queue.mailActions {
            do {
                _ = try await APIClient.shared.sendMail(MailSendRequest(to: action.to, subject: action.subject, body: action.body))
                processedMail += 1
            } catch {
                failedMail += 1
                remainingMail.append(action)
            }
        }

        var remainingUploads: [QueuedUploadAction] = []
        for action in queue.uploadActions {
            let fileURL = URL(fileURLWithPath: action.localFilePath)
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                continue
            }

            do {
                _ = try await APIClient.shared.uploadFile(fileURL: fileURL, folderId: action.folderId)
                processedUploads += 1
                try? FileManager.default.removeItem(at: fileURL)
            } catch {
                failedUploads += 1
                remainingUploads.append(action)
            }
        }

        queue.mailActions = remainingMail
        queue.uploadActions = remainingUploads
        await OfflineActionQueue.shared.replace(queue)

        if failedMail > 0 || failedUploads > 0 {
            await notifySyncFailure(failedMail: failedMail, failedUploads: failedUploads)
        }

        return QueueProcessResult(
            processedMail: processedMail,
            processedUploads: processedUploads,
            failedMail: failedMail,
            failedUploads: failedUploads
        )
    }

    private func notifySyncFailure(failedMail: Int, failedUploads: Int) async {
        let content = UNMutableNotificationContent()
        content.title = "Sync retry pending"
        content.body = "Mail retries: \(failedMail), upload retries: \(failedUploads). Open the app to retry."
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "thokan.sync.failure",
            content: content,
            trigger: nil
        )
        try? await notificationCenter.add(request)
    }
}
