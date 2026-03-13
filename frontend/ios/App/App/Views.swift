import SwiftUI
import UIKit
import UniformTypeIdentifiers
import QuickLook
import WebKit

// MARK: - Dashboard Tab

struct DashboardTab: View {
    @Environment(AuthenticationViewModel.self) private var authViewModel
    @Binding var selectedTab: Int
    @State private var viewModel = DashboardViewModel()
    @State private var filesViewModel = FilesViewModel()
    @State private var mailViewModel = EmailViewModel()
    @State private var shopifyViewModel = ShopifyViewModel()
    @State private var statusViewModel = WorkspaceStatusViewModel()
    @State private var workspaceQuery = ""

    private var isAdmin: Bool {
        authViewModel.currentUser?.roles.contains("admin") == true
    }

    private var storageSummary: String {
        guard let dashboard = viewModel.dashboard else { return "Unknown" }
        return ByteCountFormatter().string(fromByteCount: Int64(dashboard.used_bytes))
    }

    private var fileTotal: Int {
        filesViewModel.files.count + filesViewModel.folders.count
    }

    private var unreadMail: Int {
        mailViewModel.messages.filter { !($0.is_read ?? true) }.count
    }

    private var recentActivity: [ActivityItem] {
        Array((viewModel.dashboard?.recent_activity ?? []).prefix(6))
    }

    private var filteredFiles: [FileItem] {
        let query = workspaceQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return [] }
        return filesViewModel.files.filter {
            $0.name.lowercased().contains(query) || $0.mime_type.lowercased().contains(query)
        }.prefix(5).map { $0 }
    }

    private var filteredMessages: [MailMessage] {
        let query = workspaceQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return [] }
        return mailViewModel.messages.filter {
            $0.subject.lowercased().contains(query) || $0.from.lowercased().contains(query) || $0.snippet.lowercased().contains(query)
        }.prefix(5).map { $0 }
    }

    private var filteredEvents: [ShopifyChatEvent] {
        let query = workspaceQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return [] }
        return shopifyViewModel.events.filter {
            $0.order_name.lowercased().contains(query)
            || $0.customer_name.lowercased().contains(query)
            || $0.email.lowercased().contains(query)
            || $0.message.lowercased().contains(query)
        }.prefix(5).map { $0 }
    }

    private var quickActions: [(title: String, subtitle: String, icon: String, tab: Int)] {
        var actions: [(title: String, subtitle: String, icon: String, tab: Int)] = [
            ("Files", "Upload, preview en delen", "folder.fill", 1),
            ("Chat", "Directe teamgesprekken", "message.fill", 2),
            ("Mail", "Inbox en antwoorden", "envelope.fill", 3),
            ("Settings", "Connecties en updates", "gearshape.fill", isAdmin ? 5 : 4),
        ]

        if isAdmin {
            actions.append(("Admin", "Users en storage", "person.2.fill", 4))
        }

        return actions
    }

    @MainActor
    private func loadWorkspace() async {
        async let dashboardTask: Void = viewModel.fetchDashboard()
        async let filesTask: Void = filesViewModel.fetchFiles()
        async let mailTask: Void = mailViewModel.fetchInbox()
        async let shopifyTask: Void = shopifyViewModel.fetchFeed()
        async let statusTask: Void = statusViewModel.refresh()

        _ = await (dashboardTask, filesTask, mailTask, shopifyTask, statusTask)
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Cloud Workspace")
                            .font(.largeTitle.bold())
                        Text("Alles centraal: storage, mail, events en beheer in één native app.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    CloudHeroCard(
                        title: "Live overzicht",
                        subtitle: "\(mailViewModel.messages.count) mails • \(shopifyViewModel.events.count) shopify events",
                        badges: [
                            ("Storage", storageSummary),
                            ("Items", "\(fileTotal)"),
                            ("Unread", "\(unreadMail)"),
                        ]
                    )

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Realtime status")
                                .font(.headline)
                            Spacer()
                            Circle()
                                .fill(statusViewModel.cloudReachable ? Color.green : Color.red)
                                .frame(width: 10, height: 10)
                        }

                        InfoRow(label: "Health", value: statusViewModel.healthStatus)
                        InfoRow(label: "Host", value: statusViewModel.hostName)
                        InfoRow(label: "Python", value: statusViewModel.pythonVersion)
                        InfoRow(label: "Update state", value: statusViewModel.updateState)
                        InfoRow(label: "Last update", value: statusViewModel.lastUpdatedAt)
                        InfoRow(label: "Last check", value: statusViewModel.lastRefreshedAt)
                        InfoRow(label: "Queued mails", value: "\(statusViewModel.queuedMailCount)")
                        InfoRow(label: "Queued uploads", value: "\(statusViewModel.queuedUploadCount)")

                        if let statusError = statusViewModel.errorMessage {
                            Text(statusError)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                    .cloudCardStyle()

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Snelle acties")
                            .font(.headline)

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            ForEach(Array(quickActions.enumerated()), id: \.offset) { _, action in
                                Button {
                                    selectedTab = action.tab
                                } label: {
                                    CloudActionCard(title: action.title, subtitle: action.subtitle, icon: action.icon)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if !workspaceQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Zoekresultaten")
                                .font(.headline)

                            if filteredFiles.isEmpty && filteredMessages.isEmpty && filteredEvents.isEmpty {
                                Text("Geen resultaten gevonden in files, mail of Shopify.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }

                            if !filteredFiles.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    Label("Files", systemImage: "folder")
                                        .font(.subheadline.weight(.semibold))
                                    ForEach(filteredFiles, id: \.id) { file in
                                        Button {
                                            selectedTab = 1
                                        } label: {
                                            HStack {
                                                Text(file.name)
                                                    .lineLimit(1)
                                                Spacer()
                                                Image(systemName: "arrow.right")
                                                    .font(.caption)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            if !filteredMessages.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    Label("Mail", systemImage: "envelope")
                                        .font(.subheadline.weight(.semibold))
                                    ForEach(filteredMessages, id: \.id) { message in
                                        Button {
                                            selectedTab = 3
                                        } label: {
                                            HStack {
                                                Text(message.subject.isEmpty ? "(No subject)" : message.subject)
                                                    .lineLimit(1)
                                                Spacer()
                                                Image(systemName: "arrow.right")
                                                    .font(.caption)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            if !filteredEvents.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    Label("Shopify", systemImage: "message")
                                        .font(.subheadline.weight(.semibold))
                                    ForEach(filteredEvents, id: \.id) { event in
                                        Button {
                                            selectedTab = 2
                                        } label: {
                                            HStack {
                                                Text(event.order_name.isEmpty ? event.message : event.order_name)
                                                    .lineLimit(1)
                                                Spacer()
                                                Image(systemName: "arrow.right")
                                                    .font(.caption)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        .cloudCardStyle()
                    }

                    if let dashboard = viewModel.dashboard,
                       let totalStorage = dashboard.system_info?.storage_total_gb {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Storage gebruik")
                                .font(.headline)
                            ProgressView(value: Double(dashboard.used_bytes), total: totalStorage * 1_000_000_000)
                                .tint(.blue)
                            Text("\(storageSummary) van \(String(format: "%.1f", totalStorage)) GB")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .cloudCardStyle()
                    }

                    if !recentActivity.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Recente activiteit")
                                .font(.headline)

                            ForEach(Array(recentActivity.enumerated()), id: \.offset) { _, activity in
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: "bolt.horizontal.circle.fill")
                                        .foregroundStyle(.blue)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(activity.event_type?.capitalized ?? "Event")
                                            .font(.subheadline.weight(.semibold))
                                        Text(activity.entity_type?.capitalized ?? "Entity")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(activity.created_at ?? "")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .cloudCardStyle()
                    }

                    if let files = viewModel.dashboard?.recent_files, !files.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Recent files")
                                .font(.headline)
                            ForEach(files.prefix(5), id: \.id) { file in
                                FileRow(file: file)
                                    .padding(.vertical, 2)
                            }
                        }
                        .cloudCardStyle()
                    }

                    if let sysInfo = viewModel.dashboard?.system_info {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("System")
                                .font(.headline)
                            InfoRow(label: "Hostname", value: sysInfo.hostname ?? "Unknown")
                            InfoRow(label: "Platform", value: sysInfo.platform ?? "Unknown")
                            InfoRow(label: "CPU", value: "\(sysInfo.cpu_cores ?? 0) cores")
                        }
                        .cloudCardStyle()
                    }

                    if viewModel.dashboard == nil && !viewModel.isLoading {
                        ContentUnavailableView(
                            "No cloud data",
                            systemImage: "externaldrive.badge.exclamationmark",
                            description: Text("Pull to refresh and verify your API connection.")
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, 24)
                    }
                }
                .padding()
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Dashboard")
            .searchable(text: $workspaceQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: "Zoek files, mail of Shopify")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: {
                        Task {
                            await loadWorkspace()
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .refreshable {
                await loadWorkspace()
            }
            .onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { _ in
                Task {
                    await statusViewModel.refresh()
                }
            }
        }
        .task {
            await loadWorkspace()
        }
    }
}

// MARK: - Files Tab

struct FilesTab: View {
    @State private var viewModel = FilesViewModel()
    @State private var folderStack: [FolderItem] = []
    @State private var isCreateFolderPresented = false
    @State private var newFolderName = ""
    @State private var isFileImporterPresented = false
    @State private var selectedFileForMove: FileItem?

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
                        if let operation = viewModel.operationMessage {
                            Section {
                                Text(operation)
                                    .foregroundStyle(.green)
                            }
                        }

                        if let error = viewModel.errorMessage {
                            Section {
                                Text(error)
                                    .foregroundStyle(.red)
                            }
                        }

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
                                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                        Button {
                                            selectedFileForMove = file
                                        } label: {
                                            Label("Move", systemImage: "arrowshape.right")
                                        }
                                        .tint(.blue)
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
                    HStack(spacing: 16) {
                        Button {
                            isFileImporterPresented = true
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                        }

                        Button {
                            isCreateFolderPresented = true
                        } label: {
                            Image(systemName: "folder.badge.plus")
                        }

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
        }
        .alert("Create folder", isPresented: $isCreateFolderPresented) {
            TextField("Folder name", text: $newFolderName)
            Button("Cancel", role: .cancel) {
                newFolderName = ""
            }
            Button("Create") {
                Task {
                    await viewModel.createFolder(name: newFolderName, parentId: folderStack.last?.id)
                    newFolderName = ""
                }
            }
        } message: {
            Text("Add a new folder in the current location.")
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let first = urls.first else { return }
            Task {
                await viewModel.uploadFile(from: first, to: folderStack.last?.id)
            }
        }
        .confirmationDialog("Move file", isPresented: Binding(
            get: { selectedFileForMove != nil },
            set: { showing in if !showing { selectedFileForMove = nil } }
        ), titleVisibility: .visible) {
            if let file = selectedFileForMove {
                Button("Move to root") {
                    Task {
                        await viewModel.moveFile(fileId: file.id, to: nil)
                        selectedFileForMove = nil
                    }
                }

                ForEach(viewModel.folders, id: \.id) { folder in
                    Button("Move to \(folder.name)") {
                        Task {
                            await viewModel.moveFile(fileId: file.id, to: folder.id)
                            selectedFileForMove = nil
                        }
                    }
                }
            }

            Button("Cancel", role: .cancel) {
                selectedFileForMove = nil
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

struct DirectMessagesTab: View {
    @State private var usersViewModel = DirectChatUsersViewModel()
    @State private var selectedChatUser: DirectChatParticipant?
    @State private var searchQuery = ""

    private var filteredUsers: [DirectChatParticipant] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return usersViewModel.users }
        return usersViewModel.users.filter {
            $0.email.lowercased().contains(query) || $0.full_name.lowercased().contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if usersViewModel.isLoading {
                    ProgressView("Loading chats...")
                } else if filteredUsers.isEmpty {
                    ContentUnavailableView("No chat users", systemImage: "message")
                } else {
                    List(filteredUsers, id: \.id) { user in
                        Button {
                            selectedChatUser = user
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(user.full_name)
                                    .font(.subheadline.weight(.semibold))
                                Text(user.email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Chat")
            .searchable(text: $searchQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search users")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await usersViewModel.loadUsers()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .sheet(item: $selectedChatUser) { user in
            ChatConversationSheet(userId: user.id, userName: user.full_name)
        }
        .task {
            await usersViewModel.loadUsers()
        }
    }
}

// MARK: - Email Tab

struct EmailTab: View {
    @State private var viewModel = EmailViewModel()
    @State private var query = ""
    @State private var isComposePresented = false

    private var filteredMessages: [MailMessage] {
        viewModel.messages.filter { message in
            let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if trimmed.isEmpty { return true }

            return message.subject.lowercased().contains(trimmed)
                || message.from.lowercased().contains(trimmed)
                || message.snippet.lowercased().contains(trimmed)
        }
    }
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading mail...")
                } else if filteredMessages.isEmpty {
                    ContentUnavailableView("No messages", systemImage: "envelope")
                } else {
                    List(filteredMessages, id: \.id) { message in
                        NavigationLink {
                            EmailDetailView(viewModel: viewModel, messageId: message.id)
                                .navigationBarTitleDisplayMode(.inline)
                        } label: {
                            MailMessageRow(message: message)
                        }
                    }
                }
            }
            .navigationTitle("Email")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search mail")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        Button {
                            isComposePresented = true
                        } label: {
                            Image(systemName: "square.and.pencil")
                        }

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
            .sheet(isPresented: $isComposePresented) {
                MailComposeSheet(viewModel: viewModel)
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
    @State private var searchQuery = ""
    @State private var showCreateUserSheet = false
    @State private var selectedChatUser: AdminUserResponse?

    @State private var newUserEmail = ""
    @State private var newUserName = ""
    @State private var newUserPassword = ""
    @State private var newUserRole = "user"

    private var filteredUsers: [AdminUserResponse] {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return viewModel.users }
        return viewModel.users.filter {
            $0.email.lowercased().contains(q) || $0.full_name.lowercased().contains(q)
        }
    }
    
    var body: some View {
        NavigationStack {
            VStack {
                Picker("Admin", selection: $selectedSegment) {
                    Text("Users").tag(0)
                    Text("Storage").tag(1)
                    Text("Audit").tag(2)
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
                            ForEach(filteredUsers, id: \.id) { user in
                                UserRow(user: user) {
                                    selectedChatUser = user
                                }
                                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                        Button {
                                            selectedChatUser = user
                                        } label: {
                                            Label("Chat", systemImage: "message")
                                        }
                                        .tint(.blue)
                                    }
                                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                        Button(role: .destructive) {
                                            Task {
                                                await viewModel.deleteUser(user)
                                            }
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                            }
                        } else if selectedSegment == 1 {
                            ForEach(viewModel.storageUsage, id: \.email) { usage in
                                StorageRow(usage: usage)
                            }
                        } else {
                            ForEach(viewModel.auditLogs, id: \.id) { log in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(log.event_type)
                                        .font(.subheadline.weight(.semibold))
                                    Text(log.created_at)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if let entity = log.entity_type {
                                        Text(entity)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }

                        if let status = viewModel.statusMessage {
                            Section {
                                Text(status)
                                    .foregroundStyle(.green)
                            }
                        }

                        if let error = viewModel.errorMessage {
                            Section {
                                Text(error)
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Admin")
            .searchable(text: $searchQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search users")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        if selectedSegment == 0 {
                            Button {
                                showCreateUserSheet = true
                            } label: {
                                Image(systemName: "person.badge.plus")
                            }
                        }

                        Button {
                            Task {
                                await viewModel.fetchAdminData()
                            }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $showCreateUserSheet) {
            NavigationStack {
                Form {
                    Section("Nieuwe gebruiker") {
                        TextField("Naam", text: $newUserName)
                        TextField("E-mail", text: $newUserEmail)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.emailAddress)
                        SecureField("Tijdelijk wachtwoord", text: $newUserPassword)

                        Picker("Rol", selection: $newUserRole) {
                            Text("User").tag("user")
                            Text("Admin").tag("admin")
                        }
                    }
                }
                .navigationTitle("User aanmaken")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Annuleren") {
                            showCreateUserSheet = false
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Opslaan") {
                            Task {
                                await viewModel.createUser(
                                    email: newUserEmail,
                                    fullName: newUserName,
                                    password: newUserPassword,
                                    role: newUserRole
                                )
                                if viewModel.errorMessage == nil {
                                    newUserEmail = ""
                                    newUserName = ""
                                    newUserPassword = ""
                                    newUserRole = "user"
                                    showCreateUserSheet = false
                                }
                            }
                        }
                        .disabled(newUserEmail.isEmpty || newUserName.isEmpty || newUserPassword.isEmpty)
                    }
                }
            }
        }
        .sheet(item: $selectedChatUser) { user in
            ChatConversationSheet(userId: user.id, userName: user.full_name)
        }
        .task {
            await viewModel.fetchAdminData()
        }
    }
}

struct ChatConversationSheet: View {
    @Environment(AuthenticationViewModel.self) private var authViewModel
    @State private var viewModel = DirectChatViewModel()
    let userId: String
    let userName: String

    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @FocusState private var isComposerFocused: Bool

    private let bottomAnchorId = "chat-bottom-anchor"

    private func dismissKeyboard() {
        isComposerFocused = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                VStack(spacing: 0) {
                    if viewModel.isLoading {
                        Spacer()
                        ProgressView("Loading chat...")
                        Spacer()
                    } else if viewModel.messages.isEmpty {
                        ContentUnavailableView("No messages yet", systemImage: "message")
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(viewModel.messages, id: \.id) { message in
                                    let isOwn = message.sender_id == authViewModel.currentUser?.id
                                    HStack {
                                        if isOwn { Spacer(minLength: 32) }
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(isOwn ? "Jij" : userName)
                                                .font(.caption2.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                            Text(message.body)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                            Text(message.created_at)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(10)
                                        .background(isOwn ? Color.blue.opacity(0.18) : Color(uiColor: .secondarySystemFill))
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        if !isOwn { Spacer(minLength: 32) }
                                    }
                                }
                                Color.clear
                                    .frame(height: 1)
                                    .id(bottomAnchorId)
                            }
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            dismissKeyboard()
                        }
                    }

                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .padding(.horizontal)
                            .padding(.top, 8)
                    }

                    HStack(spacing: 12) {
                        TextField("Type a message", text: $draft, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(1...4)
                            .focused($isComposerFocused)

                        Button {
                            Task {
                                let sent = await viewModel.sendMessage(userId: userId, body: draft)
                                if sent {
                                    draft = ""
                                    withAnimation(.easeOut(duration: 0.2)) {
                                        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
                                    }
                                }
                            }
                        } label: {
                            if viewModel.isSending {
                                ProgressView()
                            } else {
                                Image(systemName: "paperplane.fill")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(viewModel.isSending)
                    }
                    .padding()
                    .background(Color(uiColor: .systemGroupedBackground))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        dismissKeyboard()
                    }
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
                    }
                }
                .onAppear {
                    DispatchQueue.main.async {
                        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
                    }
                }
            }
            .navigationTitle(userName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .task {
                await viewModel.loadConversation(userId: userId)
            }
            .onReceive(Timer.publish(every: 2.5, on: .main, in: .common).autoconnect()) { _ in
                Task {
                    await viewModel.loadConversation(userId: userId)
                }
            }
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
                        LabeledContent("Current version") {
                            Text(viewModel.currentInstalledVersion)
                        }

                        Button {
                            Task {
                                await viewModel.fetchLatestStableUpdate()
                            }
                        } label: {
                            if viewModel.isFetchingLatestUpdate {
                                ProgressView()
                            } else {
                                Text("Check updates")
                            }
                        }

                        if let update = viewModel.availableUpdateCandidate {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Update available")
                                    .font(.subheadline.weight(.semibold))

                                Text("New version: \(update.version ?? update.name)")
                                    .font(.footnote)

                                Text(update.release_notes ?? "No release notes provided.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(5)

                                HStack {
                                    Button("Cancel") {
                                        viewModel.cancelAvailableUpdate()
                                    }
                                    .buttonStyle(.bordered)

                                    Spacer()

                                    Button {
                                        Task {
                                            await viewModel.applyLatestUpdate()
                                        }
                                    } label: {
                                        if viewModel.isApplyingUpdate {
                                            ProgressView()
                                        } else {
                                            Text("Update")
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .disabled(viewModel.isApplyingUpdate)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }

                        if viewModel.isApplyingUpdate || viewModel.isUpdateRunning {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Wacht even...")
                                    .font(.subheadline.weight(.semibold))

                                if let progress = viewModel.updateProgressValue {
                                    ProgressView(value: progress)
                                    Text(viewModel.updateProgressLabel)
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                } else {
                                    ProgressView()
                                    Text(viewModel.updateProgressLabel)
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
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
                            .fill(.tint)
                            .frame(width: 8, height: 8)
                    }
                    
                    Text(message.date)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.secondary)
                }
            }
            
            Text(message.snippet)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
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
    var onChat: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 32))
                .foregroundStyle(.tint)

            VStack(alignment: .leading, spacing: 4) {
                Text(user.full_name)
                    .font(.system(size: 14, weight: .semibold))

                Text(user.email)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let onChat {
                Button {
                    onChat()
                } label: {
                    Label("Chat", systemImage: "message")
                        .labelStyle(.iconOnly)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            Text(user.is_active ? "Active" : "Inactive")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(user.is_active ? .green : .secondary)
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

        private var adaptiveStyleBlock: String {
                """
                <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\"> 
                <style>
                    :root { color-scheme: light dark; }
                    html, body {
                        margin: 0;
                        padding: 0;
                        font: -apple-system-body;
                        line-height: 1.45;
                    }
                    body {
                        padding: 12px;
                        background: transparent;
                        color: #111111;
                        word-break: break-word;
                    }
                    a { color: #0A84FF; }
                    img { max-width: 100%; height: auto; }
                    pre, code {
                        white-space: pre-wrap;
                        word-break: break-word;
                    }
                    @media (prefers-color-scheme: dark) {
                        body { color: #F2F2F7; }
                        a { color: #64D2FF; }
                    }
                </style>
                """
        }

        private var styledHTML: String {
                let lowercased = html.lowercased()

                if lowercased.contains("<html") {
                        if lowercased.contains("</head>") {
                                return html.replacingOccurrences(
                                        of: "</head>",
                                        with: "\(adaptiveStyleBlock)</head>",
                                        options: .caseInsensitive,
                                        range: nil
                                )
                        }
                        return "\(adaptiveStyleBlock)\n\(html)"
                }

                return """
                <!doctype html>
                <html>
                <head>
                \(adaptiveStyleBlock)
                </head>
                <body>
                \(html)
                </body>
                </html>
                """
        }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = true
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true
        webView.scrollView.keyboardDismissMode = .onDrag
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(styledHTML, baseURL: nil)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private func openExternally(_ url: URL) {
            let allowedSchemes = ["http", "https", "mailto", "tel"]
            guard let scheme = url.scheme?.lowercased(), allowedSchemes.contains(scheme) else { return }

            DispatchQueue.main.async {
                UIApplication.shared.open(url)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.navigationType == .linkActivated,
                  let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            openExternally(url)
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                openExternally(url)
            }
            return nil
        }
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

struct MailComposeSheet: View {
    let viewModel: EmailViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var recipient = ""
    @State private var subject = ""
    @State private var bodyText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Message") {
                    TextField("To", text: $recipient)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                    TextField("Subject", text: $subject)
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 180)
                }

                if let status = viewModel.statusMessage {
                    Section {
                        Text(status)
                            .foregroundStyle(.green)
                    }
                }

                if let error = viewModel.errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("New mail")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            let sent = await viewModel.sendMail(to: recipient, subject: subject, body: bodyText)
                            if sent {
                                dismiss()
                            }
                        }
                    } label: {
                        if viewModel.isLoading {
                            ProgressView()
                        } else {
                            Text("Send")
                        }
                    }
                    .disabled(recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isLoading)
                }
            }
        }
    }
}

struct CloudHeroCard: View {
    let title: String
    let subtitle: String
    let badges: [(String, String)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))

            HStack(spacing: 8) {
                ForEach(Array(badges.enumerated()), id: \.offset) { _, badge in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(badge.0)
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.7))
                        Text(badge.1)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color.blue.opacity(0.9), Color.purple.opacity(0.82)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
    }
}

struct CloudActionCard: View {
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(.blue)
                .frame(width: 34, height: 34)
                .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

extension View {
    func cloudCardStyle() -> some View {
        self
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
