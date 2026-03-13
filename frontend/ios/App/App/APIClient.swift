import Foundation

enum APIConfig {
    static var baseURL: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }

        return "https://thokan.cloud/api/v1"
    }
}

class APIClient: NSObject {
    static let shared = APIClient()
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }()
    
    private let baseURL = APIConfig.baseURL
    
    private var accessToken: String? {
        get { UserDefaults.standard.string(forKey: "access_token") }
        set {
            if let value = newValue {
                UserDefaults.standard.setValue(value, forKey: "access_token")
            } else {
                UserDefaults.standard.removeObject(forKey: "access_token")
            }
        }
    }
    
    override private init() {
        super.init()
    }
    
    // MARK: - Authentication
    
    func login(email: String, password: String) async throws -> LoginResponse {
        let url = URL(string: "\(baseURL)/auth/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(LoginRequest(email: email, password: password))
        request.timeoutInterval = 15
        
        let (data, response) = try await perform(request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            let error = try? JSONDecoder().decode([String: String].self, from: data)
            throw APIError.server(error?["detail"] ?? "Login failed")
        }
        
        let decoded = try JSONDecoder().decode(LoginResponse.self, from: data)
        self.accessToken = decoded.access_token
        return decoded
    }
    
    func logout() {
        self.accessToken = nil
    }
    
    func isLoggedIn() -> Bool {
        return accessToken != nil
    }
    
    // MARK: - Dashboard
    
    func fetchDashboard() async throws -> DashboardResponse {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/dashboard")!))
    }

    // MARK: - Shopify

    func fetchShopifyChatFeed(limitOrders: Int = 12, limitEvents: Int = 60) async throws -> ShopifyChatFeedResponse {
        let url = URL(string: "\(baseURL)/shopify/chat/feed?limit_orders=\(limitOrders)&limit_events=\(limitEvents)")!
        return try await request(URLRequest(url: url))
    }
    
    // MARK: - Files
    
    func fetchFiles(folderId: String? = nil) async throws -> FilesListResponse {
        async let filesTask: [FileItem] = request(URLRequest(url: URL(string: "\(baseURL)/files")!))
        async let foldersTask: [FolderItem] = request(URLRequest(url: URL(string: "\(baseURL)/folders")!))

        let files = try await filesTask
        let folders = try await foldersTask

        if let folderId {
            return FilesListResponse(
                files: files.filter { $0.folder_id == folderId },
                folders: folders.filter { $0.parent_id == folderId }
            )
        }

        return FilesListResponse(
            files: files.filter { $0.folder_id == nil },
            folders: folders.filter { $0.parent_id == nil }
        )
    }
    
    // MARK: - Email
    
    func fetchMailConfig() async throws -> MailConfigResponse {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/mail/config")!))
    }
    
    func fetchMailInbox() async throws -> MailInboxResponse {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/mail/inbox")!))
    }
    
    func fetchMailDetail(messageId: String) async throws -> MailDetail {
        let url = URL(string: "\(baseURL)/mail/message/\(messageId)")!
        return try await request(URLRequest(url: url))
    }

    func deleteMail(messageId: String) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/mail/message/\(messageId)")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "DELETE"
        return try await request(urlRequest)
    }

    func replyToMail(_ payload: MailReplyRequest) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/mail/reply")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.httpBody = try JSONEncoder().encode(payload)
        return try await request(urlRequest)
    }
    
    // MARK: - Admin
    
    func fetchAdminUsers() async throws -> [AdminUserResponse] {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/admin/users")!))
    }
    
    func fetchStorageUsage() async throws -> [StorageUsageResponse] {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/admin/storage-usage")!))
    }

    func createAdminUser(_ payload: AdminCreateUserRequest) async throws -> AdminCreateUserResponse {
        let url = URL(string: "\(baseURL)/admin/users")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(payload)
        return try await self.request(request)
    }

    func deleteAdminUser(userId: String) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/admin/users/\(userId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        return try await self.request(request)
    }

    func fetchAuditLogs(limit: Int = 50) async throws -> [AdminAuditLog] {
        let url = URL(string: "\(baseURL)/admin/audit-logs?limit=\(max(1, limit))")!
        return try await request(URLRequest(url: url))
    }

    func registerDeviceToken(_ token: String) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/notifications/device-token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: ["token": token], options: [])
        return try await self.request(request)
    }

    func unregisterDeviceToken(_ token: String? = nil) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/notifications/device-token")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        let payload: [String: String] = token == nil ? [:] : ["token": token!]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        return try await self.request(request)
    }

    func sendPushTest(title: String, body: String, targetTab: Int = 0) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/notifications/test")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "title": title,
            "body": body,
            "target_tab": targetTab,
        ], options: [])
        return try await self.request(request)
    }

    func fetchSystemInfo() async throws -> SystemInfoResponse {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/system/info")!))
    }

    func fetchHealthStatus() async throws -> HealthResponse {
        let healthURL = URL(string: "\(baseURL.replacingOccurrences(of: "/api/v1", with: ""))/health")!
        return try await requestWithoutAuth(URLRequest(url: healthURL))
    }

    func fetchUpdatePackages() async throws -> [UpdatePackageInfo] {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/system/update/packages")!))
    }

    func fetchUpdateStatus() async throws -> UpdateStatusResponse {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/system/update/status")!))
    }

    func fetchLatestUpdate(channel: String) async throws -> UpdatePackageInfo {
        let url = URL(string: "\(baseURL)/system/update/fetch-latest")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.httpBody = try JSONEncoder().encode(FetchUpdateRequest(channel: channel))
        return try await request(urlRequest)
    }

    func applyUpdate(packageName: String, channel: String, dryRun: Bool = false) async throws -> UpdateStatusResponse {
        let url = URL(string: "\(baseURL)/system/update/apply")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.httpBody = try JSONEncoder().encode(
            ApplyUpdateRequest(
                package_name: packageName,
                channel: channel,
                script_name: "update.sh",
                dry_run: dryRun,
                auto_rebuild_docker: true,
                auto_update_ubuntu: false
            )
        )
        return try await request(urlRequest)
    }
    
    // MARK: - User
    
    func fetchCurrentUser() async throws -> UserResponse {
        return try await request(URLRequest(url: URL(string: "\(baseURL)/auth/me")!))
    }

    func fetchCloudVersion() async throws -> String {
        let url = URL(string: "https://thokan.cloud/api/openapi.json")!
        let response: CloudOpenAPIResponse = try await requestWithoutAuth(URLRequest(url: url))
        return response.info.version
    }

    func saveMailConfig(_ payload: MailConfigUpdateRequest) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/mail/config")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "PUT"
        urlRequest.httpBody = try JSONEncoder().encode(payload)
        return try await request(urlRequest)
    }

    func testMailConfig() async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/mail/test")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        return try await request(urlRequest)
    }

    func sendMail(_ payload: MailSendRequest) async throws -> MessageResponse {
        let url = URL(string: "\(baseURL)/mail/send")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.httpBody = try JSONEncoder().encode(payload)
        return try await request(urlRequest)
    }

    func createFolder(name: String, parentId: String?) async throws -> FolderItem {
        let url = URL(string: "\(baseURL)/folders")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.httpBody = try JSONEncoder().encode(FolderCreateRequestPayload(name: name, parent_id: parentId))
        return try await request(urlRequest)
    }

    func moveFile(fileId: String, folderId: String?) async throws -> FileItem {
        let url = URL(string: "\(baseURL)/files/\(fileId)/move")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "PATCH"
        urlRequest.httpBody = try JSONEncoder().encode(MoveRequestPayload(folder_id: folderId))
        return try await request(urlRequest)
    }

    func moveFolder(folderId: String, parentFolderId: String?) async throws -> FolderItem {
        let url = URL(string: "\(baseURL)/folders/\(folderId)/move")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "PATCH"
        urlRequest.httpBody = try JSONEncoder().encode(MoveRequestPayload(folder_id: parentFolderId))
        return try await request(urlRequest)
    }

    func uploadFile(fileURL: URL, folderId: String?) async throws -> FileItem {
        let data = try Data(contentsOf: fileURL)
        let boundary = "Boundary-\(UUID().uuidString)"
        let query = folderId != nil ? "?folder_id=\(folderId!)" : ""
        let url = URL(string: "\(baseURL)/files/upload\(query)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let fileName = fileURL.lastPathComponent
        let mimeType = mimeTypeForFileExtension(fileURL.pathExtension)

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"upload\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (responseData, response) = try await perform(request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 {
                accessToken = nil
                throw APIError.unauthorized
            }
            let error = try? JSONDecoder().decode([String: String].self, from: responseData)
            throw APIError.server(error?["detail"] ?? "Upload failed")
        }

        do {
            return try JSONDecoder().decode(FileItem.self, from: responseData)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    func downloadFile(fileId: String, fileName: String) async throws -> URL {
        let url = URL(string: "\(baseURL)/files/\(fileId)/download")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setupHeaders(accessToken: accessToken)
        request.timeoutInterval = 30

        let (data, response) = try await perform(request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 {
                accessToken = nil
                throw APIError.unauthorized
            }

            let error = try? JSONDecoder().decode([String: String].self, from: data)
            throw APIError.server(error?["detail"] ?? "Download failed")
        }

        let temporaryURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-\(fileName)")
        try data.write(to: temporaryURL, options: .atomic)
        return temporaryURL
    }
    
    // MARK: - Generic Request Handler
    
    private func request<T: Decodable>(_ urlRequest: URLRequest) async throws -> T {
        var request = urlRequest
        request.setupHeaders(accessToken: accessToken)
        if request.timeoutInterval <= 0 {
            request.timeoutInterval = 15
        }
        
        let (data, response) = try await perform(request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 {
                self.accessToken = nil
                throw APIError.unauthorized
            }
            
            let error = try? JSONDecoder().decode([String: String].self, from: data)
            throw APIError.server(error?["detail"] ?? "Request failed")
        }
        
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    private func requestWithoutAuth<T: Decodable>(_ urlRequest: URLRequest) async throws -> T {
        var request = urlRequest
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        let (data, response) = try await perform(request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let error = try? JSONDecoder().decode([String: String].self, from: data)
            throw APIError.server(error?["detail"] ?? "Request failed")
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await Self.session.data(for: request)
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet:
                throw APIError.network("No internet connection")
            case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
                throw APIError.network("Cannot reach thokan.cloud")
            case .timedOut:
                throw APIError.network("Request timed out")
            default:
                throw APIError.network(error.localizedDescription)
            }
        } catch {
            throw error
        }
    }

    private func mimeTypeForFileExtension(_ ext: String) -> String {
        switch ext.lowercased() {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "pdf": return "application/pdf"
        case "txt": return "text/plain"
        case "json": return "application/json"
        case "csv": return "text/csv"
        case "doc": return "application/msword"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xls": return "application/vnd.ms-excel"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        default: return "application/octet-stream"
        }
    }
}

extension URLRequest {
    mutating func setupHeaders(accessToken: String?) {
        self.setValue("application/json", forHTTPHeaderField: "Content-Type")
        self.setValue("application/json", forHTTPHeaderField: "Accept")
        
        if let token = accessToken {
            self.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }
}
