import Foundation
import Observation
import UserNotifications

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
        } catch {
            self.errorMessage = error.localizedDescription
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
        } catch {
            errorMessage = error.localizedDescription
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
    
    @MainActor
    func fetchFiles(folderId: String? = nil) async {
        isLoading = true
        errorMessage = nil
        
        do {
            let data = try await apiClient.fetchFiles(folderId: folderId)
            self.files = data.files
            self.folders = data.folders
            self.currentFolderId = folderId
        } catch {
            self.errorMessage = error.localizedDescription
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
        } catch {
            self.errorMessage = error.localizedDescription
        }
        
        isLoading = false
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
    
    @MainActor
    func fetchAdminData() async {
        isLoading = true
        errorMessage = nil
        
        async let usersTask = apiClient.fetchAdminUsers()
        async let storageTask = apiClient.fetchStorageUsage()
        
        do {
            self.users = try await usersTask
            self.storageUsage = try await storageTask
        } catch {
            self.errorMessage = error.localizedDescription
        }
        
        isLoading = false
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
    var systemHostname = ""
    var pythonVersion = ""
    var availableUpdatePackages: [UpdatePackageInfo] = []
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
            await notifyIfNeeded(packageCount: packages.count)
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
        errorMessage = nil

        do {
            let package = try await apiClient.fetchLatestUpdate(channel: "stable")
            statusMessage = "Fetched update: \(package.name)"
            await loadAdminUpdateInfo()
        } catch {
            errorMessage = error.localizedDescription
        }

        isFetchingLatestUpdate = false
    }

    @MainActor
    func applyLatestUpdate() async {
        guard let latestPackage = availableUpdatePackages.first else {
            errorMessage = "No update package available"
            return
        }

        isApplyingUpdate = true
        errorMessage = nil

        do {
            let status = try await apiClient.applyUpdate(packageName: latestPackage.name, channel: latestPackage.channel)
            updateStatus = status
            statusMessage = "Update started for \(latestPackage.name)"
        } catch {
            errorMessage = error.localizedDescription
        }

        isApplyingUpdate = false
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
    private func notifyIfNeeded(packageCount: Int) async {
        guard packageCount > 0, packageCount > lastNotifiedUpdateCount else { return }

        let center = UNUserNotificationCenter.current()
        let permission = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        guard permission == true else { return }

        let content = UNMutableNotificationContent()
        content.title = "ThoKan Cloud updates available"
        content.body = "\(packageCount) update package(s) are ready on the server."
        content.sound = .default

        let request = UNNotificationRequest(identifier: "thokan-cloud-updates", content: content, trigger: nil)
        try? await center.add(request)

        lastNotifiedUpdateCount = packageCount
        UserDefaults.standard.set(packageCount, forKey: "lastUpdateNotificationCount")
    }
}
