import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
    static let thokanOpenTab = Notification.Name("thokan.open.tab")
    static let thokanDeviceTokenUpdated = Notification.Name("thokan.device.token.updated")
}

enum AppAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system:
            return "System"
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system:
            return nil
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

@main
struct ThoKanCloudApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var authViewModel = AuthenticationViewModel()
    @AppStorage("preferredAppearance") private var preferredAppearance = AppAppearance.system.rawValue

    private var selectedAppearance: AppAppearance {
        AppAppearance(rawValue: preferredAppearance) ?? .system
    }
    
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authViewModel)
                .preferredColorScheme(selectedAppearance.colorScheme)
        }
    }
}

struct RootView: View {
    @Environment(AuthenticationViewModel.self) private var authViewModel

    var body: some View {
        Group {
            if authViewModel.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
    }
}

struct LoginView: View {
    @Environment(AuthenticationViewModel.self) private var authViewModel
    
    @State private var email = ""
    @State private var password = ""

    private var hasLogo: Bool {
        UIImage(named: "Logo") != nil
    }

    private let highlights: [(String, String, String)] = [
        ("icloud.and.arrow.down.fill", "Workspace cockpit", "Files, mail en commerce in een duidelijke native laag."),
        ("arrow.triangle.2.circlepath.circle.fill", "Cloud sync", "Instellingen en wachtrijen blijven gelijk met de cloudworkspace."),
        ("shippingbox.fill", "Shopify feed", "Orderevents en klantcontext zitten direct in de app.")
    ]
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 14) {
                        if hasLogo {
                            Image("Logo")
                                .resizable()
                                .scaledToFit()
                                .frame(height: 88)
                        } else {
                            Image(systemName: "icloud.fill")
                                .font(.system(size: 56, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 88, height: 88)
                                .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                        }

                        Text("ThoKan Cloud")
                            .font(.largeTitle.bold())
                            .foregroundStyle(.white)

                        Text("Werk native in dezelfde cockpit als web: files, mail, chat en commerce zonder losse flows.")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.84))
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        LinearGradient(
                            colors: [Color.blue.opacity(0.92), Color.indigo.opacity(0.82), Color.cyan.opacity(0.64)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: RoundedRectangle(cornerRadius: 28, style: .continuous)
                    )

                    VStack(spacing: 16) {
                        TextField("Email", text: $email)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textFieldStyle(.roundedBorder)

                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .textFieldStyle(.roundedBorder)

                        if let error = authViewModel.errorMessage {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            Task {
                                await authViewModel.login(email: email, password: password)
                            }
                        } label: {
                            if authViewModel.isLoading {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Sign In")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)
                    }
                    .padding(20)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    )

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Wat je meteen krijgt")
                            .font(.headline)

                        ForEach(Array(highlights.enumerated()), id: \.offset) { _, item in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: item.0)
                                    .font(.headline)
                                    .foregroundStyle(.blue)
                                    .frame(width: 38, height: 38)
                                    .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.1)
                                        .font(.subheadline.weight(.semibold))
                                    Text(item.2)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .cloudCardStyle()

                    VStack(alignment: .leading, spacing: 8) {
                        Label(APIConfig.baseURL, systemImage: "network")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(24)
            }
            .background(Color(uiColor: .systemGroupedBackground))
        }
    }
}

struct MainTabView: View {
    @Environment(AuthenticationViewModel.self) private var authViewModel
    @State private var notificationMonitor = AppNotificationMonitor()
    @State private var selectedTab = 0

    private var isAdmin: Bool {
        authViewModel.currentUser?.roles.contains("admin") == true
    }
    
    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardTab(selectedTab: $selectedTab)
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(0)

            FilesTab()
                .tabItem {
                    Label("Files", systemImage: "folder")
                }
                .tag(1)

            DirectMessagesTab()
                .tabItem {
                    Label("Chat", systemImage: "message")
                }
                .tag(2)

            EmailTab()
                .tabItem {
                    Label("Mail", systemImage: "envelope")
                }
                .tag(3)

            ShopifyTab()
                .tabItem {
                    Label("Shopify", systemImage: "shippingbox")
                }
                .tag(4)

            if isAdmin {
                AdminTab()
                    .tabItem {
                        Label("Admin", systemImage: "slider.horizontal.3")
                    }
                    .tag(5)
            }

            SettingsTab()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(isAdmin ? 6 : 5)
        }
        .tint(.blue)
        .task {
            notificationMonitor.start()
            _ = await BackgroundSyncCoordinator.shared.processQueuedActions()
        }
        .onDisappear {
            notificationMonitor.stop()
        }
        .onReceive(NotificationCenter.default.publisher(for: .thokanOpenTab)) { notification in
            guard let tab = notification.object as? Int else { return }
            selectedTab = tab
        }
        .onReceive(NotificationCenter.default.publisher(for: .thokanDeviceTokenUpdated)) { notification in
            guard let token = notification.object as? String, !token.isEmpty else { return }
            Task {
                try? await APIClient.shared.registerDeviceToken(token)
            }
        }
    }
}

final class AppNotificationMonitor: NSObject, UNUserNotificationCenterDelegate {
    private let apiClient = APIClient.shared
    private let notificationCenter = UNUserNotificationCenter.current()
    private var pollingTask: Task<Void, Never>?

    private let mailNotificationEnabledKey = "mailNotificationsEnabled"
    private let shopifyNotificationEnabledKey = "shopifyNotificationsEnabled"
    private let chatNotificationEnabledKey = "chatNotificationsEnabled"
    private let lastMailIdKey = "lastMailNotificationId"
    private let lastShopifyEventIdKey = "lastShopifyNotificationId"
    private let lastChatMessageByUserKey = "lastChatMessageByUser"

    func start() {
        guard pollingTask == nil else { return }

        notificationCenter.delegate = self
        pollingTask = Task {
            await requestAuthorizationIfNeeded()

            while !Task.isCancelled {
                await pollIfNeeded()
                try? await Task.sleep(for: .seconds(8))
            }
        }
    }

    func stop() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func isNotificationEnabled(forKey key: String) -> Bool {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: key) == nil {
            return true
        }

        return defaults.bool(forKey: key)
    }

    private func requestAuthorizationIfNeeded() async {
        guard isNotificationEnabled(forKey: mailNotificationEnabledKey)
            || isNotificationEnabled(forKey: shopifyNotificationEnabledKey)
            || isNotificationEnabled(forKey: chatNotificationEnabledKey) else {
            return
        }

        let granted = (try? await notificationCenter.requestAuthorization(options: [.alert, .badge, .sound])) == true
        guard granted else { return }

        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    private func pollIfNeeded() async {
        guard apiClient.isLoggedIn() else { return }

        if isNotificationEnabled(forKey: mailNotificationEnabledKey) {
            await pollMail()
        }

        if isNotificationEnabled(forKey: shopifyNotificationEnabledKey) {
            await pollShopify()
        }

        if isNotificationEnabled(forKey: chatNotificationEnabledKey) {
            await pollChat()
        }
    }

    private func pollMail() async {
        do {
            let response = try await apiClient.fetchMailInbox()
            guard let latestMessage = response.messages.first else { return }

            let defaults = UserDefaults.standard
            guard let previousId = defaults.string(forKey: lastMailIdKey) else {
                defaults.set(latestMessage.id, forKey: lastMailIdKey)
                return
            }

            guard previousId != latestMessage.id else { return }

            let newMessages = response.messages.prefix { $0.id != previousId }
            for message in Array(newMessages.reversed()).suffix(3) {
                await deliverNotification(
                    identifier: "mail-\(message.id)",
                    title: "New mail from \(message.from)",
                    body: message.subject.isEmpty ? (message.snippet.isEmpty ? "Open ThoKan Cloud to read it." : message.snippet) : message.subject,
                    targetTab: 3
                )
            }

            defaults.set(latestMessage.id, forKey: lastMailIdKey)
        } catch {
            return
        }
    }

    private func pollShopify() async {
        do {
            let response = try await apiClient.fetchShopifyChatFeed()
            guard let latestEvent = response.events.first else { return }

            let defaults = UserDefaults.standard
            guard let previousId = defaults.string(forKey: lastShopifyEventIdKey) else {
                defaults.set(latestEvent.id, forKey: lastShopifyEventIdKey)
                return
            }

            guard previousId != latestEvent.id else { return }

            let newEvents = response.events.prefix { $0.id != previousId }
            for event in Array(newEvents.reversed()).suffix(3) {
                let orderTitle = event.order_name.isEmpty ? "Order \(event.order_id)" : event.order_name
                let customerTitle = event.customer_name.isEmpty ? event.email : event.customer_name
                await deliverNotification(
                    identifier: "shopify-\(event.id)",
                    title: "Nieuw Shopify event voor \(orderTitle)",
                    body: "\(customerTitle): \(event.message)",
                    targetTab: 4
                )
            }

            defaults.set(latestEvent.id, forKey: lastShopifyEventIdKey)
        } catch {
            return
        }
    }

    private func pollChat() async {
        do {
            let currentUser = try await apiClient.fetchCurrentUser()
            let users = try await apiClient.fetchDirectChatUsers()

            let defaults = UserDefaults.standard
            var lastMessageByUser = defaults.dictionary(forKey: lastChatMessageByUserKey) as? [String: String] ?? [:]
            var changed = false

            for user in users {
                let conversation = try await apiClient.fetchDirectChatConversation(userId: user.id)
                guard let latestIncoming = conversation.messages.reversed().first(where: { $0.sender_id != currentUser.id }) else {
                    continue
                }

                guard let previousId = lastMessageByUser[user.id] else {
                    lastMessageByUser[user.id] = latestIncoming.id
                    changed = true
                    continue
                }

                guard previousId != latestIncoming.id else { continue }

                await deliverNotification(
                    identifier: "chat-\(user.id)-\(latestIncoming.id)",
                    title: "Nieuw chatbericht van \(user.full_name)",
                    body: latestIncoming.body,
                    targetTab: 2
                )

                lastMessageByUser[user.id] = latestIncoming.id
                changed = true
            }

            if changed {
                defaults.set(lastMessageByUser, forKey: lastChatMessageByUserKey)
            }
        } catch {
            return
        }
    }

    private func deliverNotification(identifier: String, title: String, body: String, targetTab: Int) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.userInfo = ["target_tab": targetTab]

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        try? await notificationCenter.add(request)
    }

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
        let info = response.notification.request.content.userInfo
        guard let tab = info["target_tab"] as? Int else { return }
        NotificationCenter.default.post(name: .thokanOpenTab, object: tab)
    }
}
