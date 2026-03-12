import SwiftUI
import UIKit
import UniformTypeIdentifiers
import QuickLook
import WebKit

// MARK: - Dashboard Tab

struct DashboardTab: View {
    @State private var viewModel = DashboardViewModel()
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading dashboard...")
                } else if let dashboard = viewModel.dashboard {
                    List {
                        Section("Storage") {
                            LabeledContent("Used") {
                                Text(ByteCountFormatter().string(fromByteCount: Int64(dashboard.used_bytes)))
                            }

                            LabeledContent("Files") {
                                Text("\(dashboard.files_count)")
                            }

                            if let totalStorage = dashboard.system_info?.storage_total_gb {
                                ProgressView(value: Double(dashboard.used_bytes), total: totalStorage * 1_000_000_000)
                            }
                        }

                        if let sysInfo = dashboard.system_info {
                            Section("System") {
                                InfoRow(label: "Hostname", value: sysInfo.hostname ?? "Unknown")
                                InfoRow(label: "Platform", value: sysInfo.platform ?? "Unknown")
                                InfoRow(label: "CPU Cores", value: "\(sysInfo.cpu_cores ?? 0)")
                            }
                        }

                        if let files = dashboard.recent_files, !files.isEmpty {
                            Section("Recent Files") {
                                ForEach(files, id: \.id) { file in
                                    FileRow(file: file)
                                }
                            }
                        }
                    }
                } else {
                    ContentUnavailableView("No dashboard data", systemImage: "rectangle.stack", description: Text("Pull to refresh or try again later."))
                }
            }
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: {
                        Task {
                            await viewModel.fetchDashboard()
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task {
            await viewModel.fetchDashboard()
        }
    }
}

// MARK: - Files Tab

struct FilesTab: View {
    @State private var viewModel = FilesViewModel()
    @State private var folderStack: [FolderItem] = []

    private var currentTitle: String {
        folderStack.last?.name ?? "Files"
    }
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading files...")
                } else if viewModel.files.isEmpty && viewModel.folders.isEmpty {
                    ContentUnavailableView("No items here", systemImage: "folder", description: Text("This folder is empty."))
                } else {
                    List {
                        if !viewModel.folders.isEmpty {
                            Section("Folders") {
                                ForEach(viewModel.folders, id: \.id) { folder in
                                    Button {
                                        Task {
                                            folderStack.append(folder)
                                            await viewModel.fetchFiles(folderId: folder.id)
                                        }
                                    } label: {
                                        FolderRow(folder: folder)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        if !viewModel.files.isEmpty {
                            Section("Files") {
                                ForEach(viewModel.files, id: \.id) { file in
                                    NavigationLink {
                                        FileDetailView(file: file)
                                    } label: {
                                        FileRow(file: file)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle(currentTitle)
            .toolbar {
                if !folderStack.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Back") {
                            Task {
                                _ = folderStack.popLast()
                                await viewModel.fetchFiles(folderId: folderStack.last?.id)
                            }
                        }
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await viewModel.fetchFiles(folderId: folderStack.last?.id)
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task {
            await viewModel.fetchFiles()
        }
    }
}

// MARK: - Shopify Tab

struct ShopifyTab: View {
    @State private var viewModel = ShopifyViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading Shopify feed...")
                } else if viewModel.events.isEmpty {
                    ContentUnavailableView(
                        "No Shopify events",
                        systemImage: "message",
                        description: Text("Connect Shopify and refresh to see recent order activity. Shopify Inbox conversations are not exposed through this API route.")
                    )
                } else {
                    List(viewModel.events, id: \.id) { event in
                        NavigationLink {
                            ShopifyEventDetailView(event: event)
                        } label: {
                            ShopifyEventRow(event: event)
                        }
                    }
                }
            }
            .navigationTitle("Shopify")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await viewModel.fetchFeed()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !viewModel.events.isEmpty {
                    HStack {
                        Label("\(viewModel.ordersChecked) orders checked", systemImage: "shippingbox")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                }
            }
        }
        .task {
            await viewModel.fetchFeed()
        }
    }
}

// MARK: - Email Tab

struct EmailTab: View {
    @State private var viewModel = EmailViewModel()
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading mail...")
                } else if viewModel.messages.isEmpty {
                    ContentUnavailableView("No messages", systemImage: "envelope")
                } else {
                    List(viewModel.messages, id: \.id) { message in
                        NavigationLink(destination: EmailDetailView(viewModel: viewModel, messageId: message.id)) {
                            MailMessageRow(message: message)
                        }
                    }
                }
            }
            .navigationTitle("Email")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await viewModel.fetchInbox()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task {
            await viewModel.fetchMailConfig()
            await viewModel.fetchInbox()
        }
    }
}

struct EmailDetailView: View {
    let viewModel: EmailViewModel
    let messageId: String
    @Environment(\.dismiss) private var dismiss
    @State private var replyBody = ""
    @State private var isShowingReplyComposer = false
    @State private var isDeleting = false
    
    var body: some View {
        Group {
            if let message = viewModel.selectedMessage {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(message.subject.isEmpty ? "(No subject)" : message.subject)
                            .font(.title3.weight(.semibold))

                        LabeledContent("From", value: message.from)
                        LabeledContent("To", value: message.to)
                        LabeledContent("Date", value: message.date)

                        Divider()

                        if let htmlBody = message.html_body, !htmlBody.isEmpty {
                            MailPreviewView(html: htmlBody)
                                .frame(minHeight: 320)
                        } else {
                            Text(message.text_body)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if let statusMessage = viewModel.statusMessage {
                            Text(statusMessage)
                                .font(.footnote)
                                .foregroundStyle(.green)
                        }

                        if let errorMessage = viewModel.errorMessage {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                    }
                    .padding()
                }
            } else {
                ProgressView("Loading message...")
            }
        }
        .navigationTitle("Message")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    isShowingReplyComposer = true
                } label: {
                    Image(systemName: "arrowshape.turn.up.left")
                }
                .disabled(viewModel.selectedMessage == nil)

                Button(role: .destructive) {
                    Task {
                        isDeleting = true
                        let deleted = await viewModel.deleteSelectedMessage()
                        isDeleting = false
                        if deleted {
                            dismiss()
                        }
                    }
                } label: {
                    if isDeleting {
                        ProgressView()
                    } else {
                        Image(systemName: "trash")
                    }
                }
                .disabled(viewModel.selectedMessage == nil || isDeleting)
            }
        }
        .sheet(isPresented: $isShowingReplyComposer) {
            if let detail = viewModel.selectedMessage {
                MailReplyComposerView(viewModel: viewModel, detail: detail)
            }
        }
        .task {
            await viewModel.fetchMessageDetail(id: messageId)
        }
    }
}

// MARK: - Admin Tab

struct AdminTab: View {
    @State private var viewModel = AdminViewModel()
    @State private var selectedSegment: Int = 0
    
    var body: some View {
        NavigationStack {
            VStack {
                Picker("Admin", selection: $selectedSegment) {
                    Text("Users").tag(0)
                    Text("Storage").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if viewModel.isLoading {
                    Spacer()
                    ProgressView("Loading admin data...")
                    Spacer()
                } else {
                    List {
                        if selectedSegment == 0 {
                            ForEach(viewModel.users, id: \.id) { user in
                                UserRow(user: user)
                            }
                        } else {
                            ForEach(viewModel.storageUsage, id: \.email) { usage in
                                StorageRow(usage: usage)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Admin")
        }
        .task {
            await viewModel.fetchAdminData()
        }
    }
}

// MARK: - Settings Tab

struct SettingsTab: View {
    @Environment(AuthenticationViewModel.self) private var authViewModel
    @State private var viewModel = SettingsViewModel()
    @AppStorage("preferredAppearance") private var preferredAppearance = AppAppearance.system.rawValue
    @AppStorage("mailNotificationsEnabled") private var mailNotificationsEnabled = true
    @AppStorage("shopifyNotificationsEnabled") private var shopifyNotificationsEnabled = true

    private var currentAppearance: AppAppearance {
        AppAppearance(rawValue: preferredAppearance) ?? .system
    }

    private var isAdmin: Bool {
        authViewModel.currentUser?.roles.contains("admin") == true
    }

    @State private var isMailSettingsExpanded = false
    
    var body: some View {
        NavigationStack {
            Form {
                if let user = authViewModel.currentUser {
                    Section("Account") {
                        LabeledContent("Name", value: user.full_name)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Roles", value: user.roles.joined(separator: ", "))
                    }
                }

                Section("Appearance") {
                    Picker("Theme", selection: $preferredAppearance) {
                        ForEach(AppAppearance.allCases) { appearance in
                            Text(appearance.title).tag(appearance.rawValue)
                        }
                    }
                    .pickerStyle(.navigationLink)

                    LabeledContent("Current") {
                        Text(currentAppearance.title)
                    }
                }

                Section("Connection") {
                    LabeledContent("Server") {
                        Text(APIConfig.baseURL)
                            .multilineTextAlignment(.trailing)
                    }

                    LabeledContent("Cloud version") {
                        Text(viewModel.cloudVersion)
                    }
                }

                Section("Notifications") {
                    Toggle("New mail notifications", isOn: $mailNotificationsEnabled)
                    Toggle("New Shopify event notifications", isOn: $shopifyNotificationsEnabled)

                    Text("Notifications are checked automatically while the app is open.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    DisclosureGroup(isExpanded: $isMailSettingsExpanded) {
                        TextField("Mailbox email", text: $viewModel.email)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        TextField("Username", text: $viewModel.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        SecureField("Password", text: $viewModel.password)

                        TextField("IMAP host", text: $viewModel.imapHost)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        TextField("IMAP port", text: $viewModel.imapPort)
                            .keyboardType(.numberPad)

                        Toggle("IMAP SSL", isOn: $viewModel.imapUseSSL)

                        TextField("SMTP host", text: $viewModel.smtpHost)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        TextField("SMTP port", text: $viewModel.smtpPort)
                            .keyboardType(.numberPad)

                        Toggle("SMTP TLS", isOn: $viewModel.smtpUseTLS)
                        Toggle("SMTP SSL", isOn: $viewModel.smtpUseSSL)

                        TextField("Email signature", text: $viewModel.emailSignature, axis: .vertical)
                            .lineLimit(3...8)

                        if isAdmin {
                            Toggle("Apply to all accounts", isOn: $viewModel.applyToAll)
                        }

                        Button {
                            Task {
                                await viewModel.testConnection()
                            }
                        } label: {
                            if viewModel.isTesting {
                                ProgressView()
                            } else {
                                Text("Test mail connection")
                            }
                        }

                        Button {
                            Task {
                                await viewModel.save()
                            }
                        } label: {
                            if viewModel.isSaving {
                                ProgressView()
                            } else {
                                Text("Save mail settings")
                            }
                        }
                    } label: {
                        Label("Mail settings", systemImage: "envelope.badge")
                    }
                }

                if isAdmin {
                    Section("Updates") {
                        LabeledContent("Host") {
                            Text(viewModel.systemHostname.isEmpty ? "Unknown" : viewModel.systemHostname)
                        }

                        LabeledContent("Python") {
                            Text(viewModel.pythonVersion.isEmpty ? "Unknown" : viewModel.pythonVersion)
                        }

                        LabeledContent("Available packages") {
                            Text("\(viewModel.availableUpdatePackages.count)")
                        }

                        if let updateStatus = viewModel.updateStatus {
                            LabeledContent("Last update") {
                                Text(updateStatus.state.capitalized)
                            }

                            if let packageName = updateStatus.package_name {
                                LabeledContent("Package") {
                                    Text(packageName)
                                        .lineLimit(1)
                                }
                            }
                        }

                        Button {
                            Task {
                                await viewModel.loadAdminUpdateInfo()
                            }
                        } label: {
                            if viewModel.isCheckingUpdates {
                                ProgressView()
                            } else {
                                Text("Refresh update status")
                            }
                        }

                        Button {
                            Task {
                                await viewModel.fetchLatestStableUpdate()
                            }
                        } label: {
                            if viewModel.isFetchingLatestUpdate {
                                ProgressView()
                            } else {
                                Text("Fetch latest stable update")
                            }
                        }

                        Button {
                            Task {
                                await viewModel.applyLatestUpdate()
                            }
                        } label: {
                            if viewModel.isApplyingUpdate {
                                ProgressView()
                            } else {
                                Text("Apply latest update")
                            }
                        }
                        .disabled(viewModel.availableUpdatePackages.isEmpty)
                    }
                }

                if let statusMessage = viewModel.statusMessage {
                    Section {
                        Text(statusMessage)
                            .foregroundStyle(.green)
                    }
                }

                if let errorMessage = viewModel.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section("Session") {
                    Button(role: .destructive) {
                        authViewModel.logout()
                    } label: {
                        Text("Log Out")
                    }
                }
            }
            .navigationTitle("Settings")
            .task {
                await viewModel.load()
                if isAdmin {
                    await viewModel.loadAdminUpdateInfo()
                }
            }
        }
    }
}

// MARK: - Helper Views

struct FileRow: View {
    let file: FileItem
    
    var body: some View {
        HStack {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text(file.name)
                    Text(ByteCountFormatter().string(fromByteCount: Int64(file.size_bytes)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: iconName(for: file.mime_type))
                    .foregroundStyle(.blue)
            }

            Spacer()
        }
    }

    private func iconName(for mimeType: String) -> String {
        if mimeType.contains("image") {
            return "photo"
        }
        if mimeType.contains("pdf") {
            return "doc.richtext"
        }
        return "doc"
    }
}

struct FolderRow: View {
    let folder: FolderItem
    
    var body: some View {
        HStack {
            Label(folder.name, systemImage: "folder")
            Spacer()
            Text(folder.path)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

struct MailMessageRow: View {
    let message: MailMessage
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(message.subject)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                    
                    Text(message.from)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    if !(message.is_read ?? true) {
                        Circle()
                            .fill(Color(red: 0.3, green: 0.6, blue: 0.9))
                            .frame(width: 8, height: 8)
                    }
                    
                    Text(message.date)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.secondary)
                }
            }
            
            Text(message.snippet)
                .font(.system(size: 12, weight: .regular))
                .foregroundColor(.lightGray)
                .lineLimit(2)
        }
    }
}

struct ShopifyEventRow: View {
    let event: ShopifyChatEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(event.order_name.isEmpty ? "Order \(event.order_id)" : event.order_name)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)

                    Text(event.customer_name.isEmpty ? event.email : event.customer_name)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text(event.type.capitalized)
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.blue.opacity(0.12), in: Capsule())
                    .foregroundStyle(.blue)
            }

            Text(event.message)
                .font(.system(size: 12, weight: .regular))
                .lineLimit(2)

            HStack {
                Text(event.author)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)

                Spacer()

                Text(event.created_at)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ShopifyEventDetailView: View {
    let event: ShopifyChatEvent

    var body: some View {
        List {
            Section("Event") {
                LabeledContent("Type", value: event.type)
                LabeledContent("Author", value: event.author)
                LabeledContent("Created", value: event.created_at)
                Text(event.message)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Section("Order") {
                LabeledContent("Order", value: event.order_name)
                LabeledContent("Order ID", value: event.order_id)
                LabeledContent("Customer", value: event.customer_name.isEmpty ? event.email : event.customer_name)
                LabeledContent("Payment", value: event.financial_status)
                LabeledContent("Fulfillment", value: event.fulfillment_status)
                LabeledContent("Total", value: "\(event.total_price) \(event.currency)")
            }
        }
        .navigationTitle("Shopify Event")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct UserRow: View {
    let user: AdminUserResponse
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 32))
                .foregroundColor(Color(red: 0.3, green: 0.6, blue: 0.9))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(user.full_name)
                    .font(.system(size: 14, weight: .semibold))
                
                Text(user.email)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Text(user.is_active ? "Active" : "Inactive")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(user.is_active ? .green : .gray)
        }
    }
}

struct StorageRow: View {
    let usage: StorageUsageResponse
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(usage.email)
                .font(.system(size: 14, weight: .semibold))
            
            HStack(spacing: 8) {
                ProgressView(value: Double(usage.used_bytes), total: 1e10)
                
                Text(ByteCountFormatter().string(fromByteCount: Int64(usage.used_bytes)))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
            
            Spacer()
            
            Text(value)
                .font(.system(size: 12, weight: .semibold))
        }
    }
}

struct FileDetailView: View {
    let file: FileItem

    @State private var isDownloading = false
    @State private var errorMessage: String?
    @State private var downloadedURL: URL?
    @State private var isSharePresented = false
    @State private var isPreviewPresented = false

    var body: some View {
        List {
            Section("Details") {
                LabeledContent("Name", value: file.name)
                LabeledContent("Type", value: file.mime_type)
                LabeledContent("Size") {
                    Text(ByteCountFormatter().string(fromByteCount: Int64(file.size_bytes)))
                }
                LabeledContent("Created", value: file.created_at)
            }

            Section {
                Button {
                    Task {
                        await downloadForPreview()
                    }
                } label: {
                    Label("Open Preview", systemImage: "eye")
                }
                .disabled(isDownloading)

                Button {
                    Task {
                        await downloadAndShare()
                    }
                } label: {
                    if isDownloading {
                        ProgressView()
                    } else {
                        Label("Download and Share", systemImage: "square.and.arrow.down")
                    }
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(file.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isSharePresented) {
            if let downloadedURL {
                ShareSheet(items: [downloadedURL])
            }
        }
        .sheet(isPresented: $isPreviewPresented) {
            if let downloadedURL {
                QuickLookPreview(url: downloadedURL)
            }
        }
    }

    @MainActor
    private func downloadAndShare() async {
        isDownloading = true
        errorMessage = nil

        do {
            downloadedURL = try await APIClient.shared.downloadFile(fileId: file.id, fileName: file.name)
            isSharePresented = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isDownloading = false
    }

    @MainActor
    private func downloadForPreview() async {
        isDownloading = true
        errorMessage = nil

        do {
            downloadedURL = try await APIClient.shared.downloadFile(fileId: file.id, fileName: file.name)
            isPreviewPresented = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isDownloading = false
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct QuickLookPreview: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url)
    }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL

        init(url: URL) {
            self.url = url
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}

struct MailPreviewView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: nil)
    }
}

struct MailReplyComposerView: View {
    let viewModel: EmailViewModel
    let detail: MailDetail

    @Environment(\.dismiss) private var dismiss
    @State private var replyBody = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Replying to") {
                    LabeledContent("From", value: detail.reply_to ?? detail.from)
                    LabeledContent("Subject", value: detail.subject)
                }

                Section("Message") {
                    TextEditor(text: $replyBody)
                        .frame(minHeight: 180)
                }

                if let errorMessage = viewModel.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Reply")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("Send") {
                        Task {
                            let success = await viewModel.reply(to: detail, body: replyBody)
                            if success {
                                dismiss()
                            }
                        }
                    }
                    .disabled(replyBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isLoading)
                }
            }
        }
    }
}

extension Color {
    static let lightGray = Color(white: 0.65)
}
