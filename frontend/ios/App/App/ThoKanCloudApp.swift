import SwiftUI
import UIKit
import UserNotifications

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
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 12) {
                        if hasLogo {
                            Image("Logo")
                                .resizable()
                                .scaledToFit()
                                .frame(height: 84)
                        } else {
                            Image(systemName: "icloud.fill")
                                .font(.system(size: 54, weight: .semibold))
                                .foregroundStyle(.tint)
                        }

                        Text("ThoKan Cloud")
                            .font(.largeTitle.bold())

                        Text("Connect directly to your cloud environment")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 24)

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

    private var isAdmin: Bool {
        authViewModel.currentUser?.roles.contains("admin") == true
    }
    
    var body: some View {
        TabView {
            DashboardTab()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            FilesTab()
                .tabItem {
                    Label("Files", systemImage: "folder")
                }

            ShopifyTab()
                .tabItem {
                    Label("Shopify", systemImage: "message")
                }

            EmailTab()
                .tabItem {
                    Label("Mail", systemImage: "envelope")
                }

            if isAdmin {
                AdminTab()
                    .tabItem {
                        Label("Admin", systemImage: "slider.horizontal.3")
                    }
            }

            SettingsTab()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
        }
        .tint(.blue)
        .task {
            notificationMonitor.start()
        }
        .onDisappear {
            notificationMonitor.stop()
        }
    }
}

final class AppNotificationMonitor: NSObject, UNUserNotificationCenterDelegate {
    private let apiClient = APIClient.shared
    private let notificationCenter = UNUserNotificationCenter.current()
    private var pollingTask: Task<Void, Never>?

    private let mailNotificationEnabledKey = "mailNotificationsEnabled"
    private let shopifyNotificationEnabledKey = "shopifyNotificationsEnabled"
    private let lastMailIdKey = "lastMailNotificationId"
    private let lastShopifyEventIdKey = "lastShopifyNotificationId"

    func start() {
        guard pollingTask == nil else { return }

        notificationCenter.delegate = self
        pollingTask = Task {
            await requestAuthorizationIfNeeded()

            while !Task.isCancelled {
                await pollIfNeeded()
                try? await Task.sleep(for: .seconds(60))
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
        guard isNotificationEnabled(forKey: mailNotificationEnabledKey) || isNotificationEnabled(forKey: shopifyNotificationEnabledKey) else {
            return
        }

        _ = try? await notificationCenter.requestAuthorization(options: [.alert, .badge, .sound])
    }

    private func pollIfNeeded() async {
        guard apiClient.isLoggedIn() else { return }

        if isNotificationEnabled(forKey: mailNotificationEnabledKey) {
            await pollMail()
        }

        if isNotificationEnabled(forKey: shopifyNotificationEnabledKey) {
            await pollShopify()
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
                    body: message.subject.isEmpty ? (message.snippet.isEmpty ? "Open ThoKan Cloud to read it." : message.snippet) : message.subject
                )
            }

            defaults.set(latestMessage.id, forKey: lastMailIdKey)
        } catch {
            return
        }
    }

    private func pollShopify() async {
        do {
            let response = try await apiClient.fetchShopifyChatFeed(limitOrders: 12, limitEvents: 40)
            guard let latestEvent = response.events.first else { return }

            let defaults = UserDefaults.standard
            guard let previousId = defaults.string(forKey: lastShopifyEventIdKey) else {
                defaults.set(latestEvent.id, forKey: lastShopifyEventIdKey)
                return
            }

            guard previousId != latestEvent.id else { return }

            let newEvents = response.events.prefix { $0.id != previousId }
            for event in Array(newEvents.reversed()).suffix(3) {
                let orderName = event.order_name.isEmpty ? "Order \(event.order_id)" : event.order_name
                await deliverNotification(
                    identifier: "shopify-\(event.id)",
                    title: "New Shopify event: \(orderName)",
                    body: "\(event.author): \(event.message)"
                )
            }

            defaults.set(latestEvent.id, forKey: lastShopifyEventIdKey)
        } catch {
            return
        }
    }

    private func deliverNotification(identifier: String, title: String, body: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        try? await notificationCenter.add(request)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }
}
