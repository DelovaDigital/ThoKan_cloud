import Foundation
import Observation
import UserNotifications

private enum CacheKeys {
    static let dashboard = "cache.dashboard"
    static let files = "cache.files"
    static let folders = "cache.folders"
    static let mailInbox = "cache.mail.inbox"
    static let shopifyFeed = "cache.shopify.feed"
}

private func isLikelyNetworkError(_ error: Error) -> Bool {
    if case APIError.network = error {
        return true
    }
    let message = error.localizedDescription.lowercased()
    return message.contains("network") || message.contains("offline") || message.contains("cannot reach") || message.contains("timed out")
}

@Observable
class AuthenticationViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared
    
    var isLoggedIn = false
    var isLoading = false
    var errorMessage: String?
    var currentUser: UserResponse?
    
    init() {
        self.isLoggedIn = apiClient.isLoggedIn()
        if isLoggedIn {
            Task {
                await fetchCurrentUser()
            }
        }
    }
    
    func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        
        do {
            _ = try await apiClient.login(email: email, password: password)
            await MainActor.run {
                self.isLoggedIn = true
                self.isLoading = false
            }
            
            await fetchCurrentUser()
        } catch {
            await MainActor.run {
                self.errorMessage = error.localizedDescription
                self.isLoading = false
            }
        }
    }
    
    func logout() {
        apiClient.logout()
        isLoggedIn = false
        currentUser = nil
        errorMessage = nil
    }
    
    @MainActor
    private func fetchCurrentUser() async {
        do {
            let user = try await apiClient.fetchCurrentUser()
            self.currentUser = user
        } catch {
            if case APIError.unauthorized = error {
                self.isLoggedIn = false
            }
        }
    }
}

@Observable
class DashboardViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared
    
    var dashboard: DashboardResponse?
    var isLoading = false
    var errorMessage: String?
    
    @MainActor
    func fetchDashboard() async {
        isLoading = true
        errorMessage = nil
        
        do {
            let data = try await apiClient.fetchDashboard()
            self.dashboard = data
            CacheStore.shared.save(data, forKey: CacheKeys.dashboard)
        } catch {
            if let cached: DashboardResponse = CacheStore.shared.load(DashboardResponse.self, forKey: CacheKeys.dashboard) {
                self.dashboard = cached
                self.errorMessage = "Offline modus: cached dashboard getoond"
            } else {
                self.errorMessage = error.localizedDescription
            }
        }
        
        isLoading = false
    }
}

@Observable
class ShopifyViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared

    var events: [ShopifyChatEvent] = []
    var ordersChecked = 0
    var isLoading = false
    var errorMessage: String?

    @MainActor
    func fetchFeed() async {
        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.fetchShopifyChatFeed()
            events = response.events
            ordersChecked = response.orders_checked
            CacheStore.shared.save(response, forKey: CacheKeys.shopifyFeed)
        } catch {
            if let cached: ShopifyChatFeedResponse = CacheStore.shared.load(ShopifyChatFeedResponse.self, forKey: CacheKeys.shopifyFeed) {
                events = cached.events
                ordersChecked = cached.orders_checked
                errorMessage = "Offline modus: cached Shopify feed getoond"
            } else {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }
}

@Observable
class FilesViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared
    
    var files: [FileItem] = []
    var folders: [FolderItem] = []
    var isLoading = false
    var errorMessage: String?
    var currentFolderId: String?

    var operationMessage: String?
    
    @MainActor
    func fetchFiles(folderId: String? = nil) async {
        isLoading = true
        errorMessage = nil
        
        do {
            let data = try await apiClient.fetchFiles(folderId: folderId)
            self.files = data.files
            self.folders = data.folders
            self.currentFolderId = folderId
            CacheStore.shared.save(data.files, forKey: CacheKeys.files)
            CacheStore.shared.save(data.folders, forKey: CacheKeys.folders)
        } catch {
            let cachedFiles: [FileItem] = CacheStore.shared.load([FileItem].self, forKey: CacheKeys.files) ?? []
            let cachedFolders: [FolderItem] = CacheStore.shared.load([FolderItem].self, forKey: CacheKeys.folders) ?? []

            if !cachedFiles.isEmpty || !cachedFolders.isEmpty {
                if let folderId {
                    self.files = cachedFiles.filter { $0.folder_id == folderId }
                    self.folders = cachedFolders.filter { $0.parent_id == folderId }
                } else {
                    self.files = cachedFiles.filter { $0.folder_id == nil }
                    self.folders = cachedFolders.filter { $0.parent_id == nil }
                }
                self.currentFolderId = folderId
                self.errorMessage = "Offline modus: cached bestanden getoond"
            } else {
                self.errorMessage = error.localizedDescription
            }
        }
        
        isLoading = false
    }

    @MainActor
    func createFolder(name: String, parentId: String?) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isLoading = true
        errorMessage = nil
        operationMessage = nil

        do {
            _ = try await apiClient.createFolder(name: trimmed, parentId: parentId)
            operationMessage = "Folder created"
            await fetchFiles(folderId: parentId)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    @MainActor
    func moveFile(fileId: String, to folderId: String?) async {
        errorMessage = nil
        operationMessage = nil
        do {
            _ = try await apiClient.moveFile(fileId: fileId, folderId: folderId)
            operationMessage = "File moved"
            await fetchFiles(folderId: currentFolderId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func uploadFile(from url: URL, to folderId: String?) async {
        isLoading = true
        errorMessage = nil
        operationMessage = nil

        do {
            _ = try await apiClient.uploadFile(fileURL: url, folderId: folderId)
            operationMessage = "File uploaded"
            await fetchFiles(folderId: folderId)
        } catch {
            if isLikelyNetworkError(error) {
                do {
                    let staged = try OfflineFileStager.stageFileForRetry(sourceURL: url)
                    await OfflineActionQueue.shared.enqueueUpload(localFilePath: staged.path, folderId: folderId)
                    operationMessage = "Offline: upload queued for retry"
                } catch {
                    errorMessage = "Upload failed and queue staging failed: \(error.localizedDescription)"
                }
            } else {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }
    
    var usedStorage: String {
        let bytes = files.reduce(0) { $0 + $1.size_bytes }
        return formatBytes(bytes)
    }
    
    private func formatBytes(_ bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(bytes))
    }
}

@Observable
class EmailViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared
    
    var mailConfig: MailConfigResponse?
    var messages: [MailMessage] = []
    var selectedMessage: MailDetail?
    var isLoading = false
    var errorMessage: String?
    var statusMessage: String?
    
    @MainActor
    func fetchMailConfig() async {
        do {
            let config = try await apiClient.fetchMailConfig()
            self.mailConfig = config
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }
    
    @MainActor
    func fetchInbox() async {
        isLoading = true
        errorMessage = nil
        statusMessage = nil
        
        do {
            let response = try await apiClient.fetchMailInbox()
            self.messages = response.messages
            CacheStore.shared.save(response, forKey: CacheKeys.mailInbox)
        } catch {
            if let cached: MailInboxResponse = CacheStore.shared.load(MailInboxResponse.self, forKey: CacheKeys.mailInbox) {
                self.messages = cached.messages
                self.errorMessage = "Offline modus: cached inbox getoond"
            } else {
                self.errorMessage = error.localizedDescription
            }
        }
        
        isLoading = false
    }

    @MainActor
    func sendMail(to: String, subject: String, body: String) async -> Bool {
        let recipient = to.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !recipient.isEmpty else {
            errorMessage = "Recipient is required"
            return false
        }

        isLoading = true
        errorMessage = nil
        statusMessage = nil

        do {
            let response = try await apiClient.sendMail(MailSendRequest(to: recipient, subject: subject, body: body))
            statusMessage = response.message
            isLoading = false
            return true
        } catch {
            if isLikelyNetworkError(error) {
                await OfflineActionQueue.shared.enqueueMail(to: recipient, subject: subject, body: body)
                statusMessage = "Offline: message queued and will retry automatically"
                isLoading = false
                return true
            }
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
    
    @MainActor
    func fetchMessageDetail(id: String) async {
        isLoading = true
        errorMessage = nil
        
        do {
            let detail = try await apiClient.fetchMailDetail(messageId: id)
            self.selectedMessage = detail
        } catch {
            self.errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }

    @MainActor
    func deleteSelectedMessage() async -> Bool {
        guard let message = selectedMessage else { return false }

        isLoading = true
        errorMessage = nil
        statusMessage = nil

        do {
            let response = try await apiClient.deleteMail(messageId: message.id)
            statusMessage = response.message
            selectedMessage = nil
            await fetchInbox()
            isLoading = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }

    @MainActor
    func reply(to detail: MailDetail, body: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        statusMessage = nil

        do {
            let response = try await apiClient.replyToMail(
                MailReplyRequest(
                    reply_to: detail.reply_to ?? detail.from,
                    from: detail.from,
                    subject: detail.subject,
                    body: body,
                    message_id: detail.message_id ?? "",
                    in_reply_to: detail.in_reply_to ?? "",
                    references: detail.references ?? ""
                )
            )
            statusMessage = response.message
            isLoading = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
}

@Observable
class AdminViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared
    
    var users: [AdminUserResponse] = []
    var storageUsage: [StorageUsageResponse] = []
    var isLoading = false
    var errorMessage: String?
    var statusMessage: String?
    var auditLogs: [AdminAuditLog] = []
    
    @MainActor
    func fetchAdminData() async {
        isLoading = true
        errorMessage = nil
        statusMessage = nil
        
        async let usersTask = apiClient.fetchAdminUsers()
        async let storageTask = apiClient.fetchStorageUsage()
        async let auditTask = apiClient.fetchAuditLogs(limit: 60)
        
        do {
            self.users = try await usersTask
            self.storageUsage = try await storageTask
            self.auditLogs = try await auditTask
        } catch {
            self.errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }

    @MainActor
    func createUser(email: String, fullName: String, password: String, role: String) async {
        errorMessage = nil
        statusMessage = nil

        do {
            let response = try await apiClient.createAdminUser(
                AdminCreateUserRequest(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    full_name: fullName.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password,
                    role: role
                )
            )
            statusMessage = response.message
            await fetchAdminData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func deleteUser(_ user: AdminUserResponse) async {
        errorMessage = nil
        statusMessage = nil

        do {
            let response = try await apiClient.deleteAdminUser(userId: user.id)
            statusMessage = response.message
            await fetchAdminData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@Observable
class DirectChatViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared

    var messages: [DirectChatMessage] = []
    var isLoading = false
    var isSending = false
    var errorMessage: String?

    @MainActor
    func loadConversation(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.fetchDirectChatConversation(userId: userId)
            messages = response.messages
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    @MainActor
    func sendMessage(userId: String, body: String) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Message is required"
            return false
        }

        isSending = true
        errorMessage = nil

        do {
            _ = try await apiClient.sendDirectChatMessage(userId: userId, body: trimmed)
            await loadConversation(userId: userId)
            isSending = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isSending = false
            return false
        }
    }
}

@Observable
class SettingsViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared

    var isLoading = false
    var isSaving = false
    var isTesting = false
    var isCheckingUpdates = false
    var isFetchingLatestUpdate = false
    var isApplyingUpdate = false
    var errorMessage: String?
    var statusMessage: String?

    var email = ""
    var username = ""
    var password = ""
    var imapHost = ""
    var imapPort = "993"
    var imapUseSSL = true
    var smtpHost = ""
    var smtpPort = "587"
    var smtpUseTLS = true
    var smtpUseSSL = false
    var emailSignature = ""
    var applyToAll = false
    var cloudVersion = "Unknown"
    var currentInstalledVersion = "Unknown"
    var systemHostname = ""
    var pythonVersion = ""
    var availableUpdatePackages: [UpdatePackageInfo] = []
    var availableUpdateCandidate: UpdatePackageInfo?
    var updateStatus: UpdateStatusResponse?
    var lastNotifiedUpdateCount = UserDefaults.standard.integer(forKey: "lastUpdateNotificationCount")

    @MainActor
    func load() async {
        isLoading = true
        errorMessage = nil

        async let configTask = apiClient.fetchMailConfig()
        async let versionTask = apiClient.fetchCloudVersion()

        do {
            let config = try await configTask
            apply(config: config)
        } catch {
            errorMessage = error.localizedDescription
        }

        do {
            cloudVersion = try await versionTask
            if currentInstalledVersion == "Unknown" || currentInstalledVersion.isEmpty {
                currentInstalledVersion = cloudVersion
            }
        } catch {
            if errorMessage == nil {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }

    @MainActor
    func loadAdminUpdateInfo() async {
        isCheckingUpdates = true

        do {
            async let systemTask = apiClient.fetchSystemInfo()
            async let packagesTask = apiClient.fetchUpdatePackages()
            async let statusTask = apiClient.fetchUpdateStatus()

            let system = try await systemTask
            let packages = try await packagesTask
            let status = try await statusTask

            systemHostname = system.hostname
            pythonVersion = system.python_version
            availableUpdatePackages = packages
            updateStatus = status
            if let installedVersion = status.installed_version, !installedVersion.isEmpty {
                currentInstalledVersion = installedVersion
            } else if currentInstalledVersion == "Unknown" || currentInstalledVersion.isEmpty {
                currentInstalledVersion = cloudVersion
            }
            await notifyIfNeeded(packages: packages)
        } catch {
            errorMessage = error.localizedDescription
        }

        isCheckingUpdates = false
    }

    @MainActor
    func save() async {
        isSaving = true
        errorMessage = nil
        statusMessage = nil

        do {
            let payload = MailConfigUpdateRequest(
                email: email,
                username: username,
                password: password,
                imap_host: imapHost,
                imap_port: Int(imapPort) ?? 993,
                imap_use_ssl: imapUseSSL,
                smtp_host: smtpHost,
                smtp_port: Int(smtpPort) ?? 587,
                smtp_use_tls: smtpUseTLS,
                smtp_use_ssl: smtpUseSSL,
                email_signature: emailSignature,
                apply_to_all: applyToAll
            )
            let response = try await apiClient.saveMailConfig(payload)
            password = ""
            statusMessage = response.message
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    @MainActor
    func testConnection() async {
        isTesting = true
        errorMessage = nil
        statusMessage = nil

        do {
            let response = try await apiClient.testMailConfig()
            statusMessage = response.message
        } catch {
            errorMessage = error.localizedDescription
        }

        isTesting = false
    }

    @MainActor
    func fetchLatestStableUpdate() async {
        isFetchingLatestUpdate = true
        statusMessage = nil
        errorMessage = nil

        do {
            let package = try await apiClient.fetchLatestUpdate(channel: "stable")
            let current = normalizeVersion(currentInstalledVersion) ?? normalizeVersion(cloudVersion)
            let incoming = normalizeVersion(package.version) ?? normalizeVersion(extractVersionFromPackageName(package.name))

            guard let incoming else {
                availableUpdateCandidate = nil
                statusMessage = "No newer version available."
                isFetchingLatestUpdate = false
                return
            }

            if let current,
               !isVersionNewer(incoming, than: current) {
                availableUpdateCandidate = nil
                statusMessage = "You're already on version \(currentInstalledVersion)."
            } else {
                availableUpdateCandidate = package
                statusMessage = nil
            }

            await loadAdminUpdateInfo()
        } catch {
            errorMessage = error.localizedDescription
        }

        isFetchingLatestUpdate = false
    }

    @MainActor
    func applyLatestUpdate() async {
        guard let latestPackage = availableUpdateCandidate ?? availableUpdatePackages.first else {
            errorMessage = "No update package available"
            return
        }

        isApplyingUpdate = true
        errorMessage = nil

        do {
            let status = try await apiClient.applyUpdate(packageName: latestPackage.name, channel: latestPackage.channel)
            updateStatus = status
            availableUpdateCandidate = nil
            if let installedVersion = status.installed_version, !installedVersion.isEmpty {
                currentInstalledVersion = installedVersion
            }
            statusMessage = "Update started for \(latestPackage.name)"
        } catch {
            errorMessage = error.localizedDescription
        }

        isApplyingUpdate = false
    }

    @MainActor
    func cancelAvailableUpdate() {
        availableUpdateCandidate = nil
        statusMessage = nil
        errorMessage = nil
    }

    @MainActor
    private func apply(config: MailConfigResponse) {
        email = config.email
        username = config.username
        imapHost = config.imap_host
        imapPort = String(config.imap_port)
        imapUseSSL = config.imap_use_ssl
        smtpHost = config.smtp_host
        smtpPort = String(config.smtp_port)
        smtpUseTLS = config.smtp_use_tls
        smtpUseSSL = config.smtp_use_ssl
        emailSignature = config.email_signature ?? ""
        applyToAll = config.is_global ?? false
    }

    @MainActor
    private func notifyIfNeeded(packages: [UpdatePackageInfo]) async {
        let packageCount = countNewerPackages(in: packages)
        guard packageCount > 0, packageCount > lastNotifiedUpdateCount else {
            if packageCount == 0 {
                let center = UNUserNotificationCenter.current()
                center.removePendingNotificationRequests(withIdentifiers: ["thokan-cloud-updates"])
                center.removeDeliveredNotifications(withIdentifiers: ["thokan-cloud-updates"])
                lastNotifiedUpdateCount = 0
                UserDefaults.standard.set(0, forKey: "lastUpdateNotificationCount")
            }
            return
        }

        let center = UNUserNotificationCenter.current()
        let permission = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        guard permission == true else { return }

        let content = UNMutableNotificationContent()
        content.title = "ThoKan Cloud updates available"
        content.body = "\(packageCount) new update version(s) are available."

        let request = UNNotificationRequest(identifier: "thokan-cloud-updates", content: content, trigger: nil)
        try? await center.add(request)

        lastNotifiedUpdateCount = packageCount
        UserDefaults.standard.set(packageCount, forKey: "lastUpdateNotificationCount")
    }

    private func normalizeVersion(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        let withoutPrefix = trimmed.hasPrefix("v") ? String(trimmed.dropFirst()) : trimmed
        let core = withoutPrefix.split(separator: "-", maxSplits: 1).first.map(String.init) ?? withoutPrefix
        return core
    }

    private func extractVersionFromPackageName(_ packageName: String) -> String? {
        let matches = packageName.matches(of: /\d+(?:\.\d+)+/)
        guard let last = matches.last else { return nil }
        return String(last.output)
    }

    private func isVersionNewer(_ incoming: String, than current: String) -> Bool {
        let incomingParts = incoming.split(separator: ".").map { Int($0) ?? 0 }
        let currentParts = current.split(separator: ".").map { Int($0) ?? 0 }
        let count = max(incomingParts.count, currentParts.count)

        for index in 0..<count {
            let left = index < incomingParts.count ? incomingParts[index] : 0
            let right = index < currentParts.count ? currentParts[index] : 0
            if left != right {
                return left > right
            }
        }

        return false
    }

    private func countNewerPackages(in packages: [UpdatePackageInfo]) -> Int {
        guard let current = normalizeVersion(currentInstalledVersion) ?? normalizeVersion(cloudVersion) else {
            return 0
        }

        return packages.reduce(into: 0) { count, package in
            let incoming = normalizeVersion(package.version) ?? normalizeVersion(extractVersionFromPackageName(package.name))
            if let incoming, isVersionNewer(incoming, than: current) {
                count += 1
            }
        }
    }
}

@Observable
class WorkspaceStatusViewModel {
    @ObservationIgnored
    private let apiClient = APIClient.shared

    var cloudReachable = false
    var healthStatus = "Unknown"
    var hostName = "-"
    var pythonVersion = "-"
    var updateState = "unknown"
    var lastUpdatedAt = "Never"
    var lastRefreshedAt = "Never"
    var queuedMailCount = 0
    var queuedUploadCount = 0
    var isRefreshing = false
    var errorMessage: String?

    @MainActor
    func refresh() async {
        isRefreshing = true
        errorMessage = nil
        var partialErrors: [String] = []

        do {
            let health = try await apiClient.fetchHealthStatus()
            cloudReachable = health.status.lowercased() == "ok"
            healthStatus = health.status
        } catch {
            cloudReachable = false
            healthStatus = "Unavailable"
            partialErrors.append("Health: \(error.localizedDescription)")
        }

        do {
            let system = try await apiClient.fetchSystemInfo()
            hostName = system.hostname
            pythonVersion = system.python_version
        } catch {
            hostName = "-"
            pythonVersion = "-"
            partialErrors.append("System: \(error.localizedDescription)")
        }

        do {
            let update = try await apiClient.fetchUpdateStatus()
            updateState = update.state
            if let finishedAt = update.finished_at, !finishedAt.isEmpty {
                lastUpdatedAt = finishedAt
            }
        } catch {
            updateState = "unknown"
            partialErrors.append("Update: \(error.localizedDescription)")
        }

        let queue = await OfflineActionQueue.shared.snapshot()
        queuedMailCount = queue.mailActions.count
        queuedUploadCount = queue.uploadActions.count

        if !partialErrors.isEmpty {
            errorMessage = partialErrors.joined(separator: " | ")
        }

        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        lastRefreshedAt = formatter.string(from: Date())

        isRefreshing = false
    }
}
