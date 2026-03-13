import Foundation

// MARK: - Authentication Models

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Decodable {
    let access_token: String
    let refresh_token: String?
}

struct UserResponse: Decodable {
    let id: String
    let email: String
    let full_name: String
    let is_active: Bool
    let roles: [String]
}

// MARK: - Dashboard Models

struct DashboardResponse: Codable {
    let used_bytes: Int
    let files_count: Int
    let system_info: SystemInfo?
    let recent_files: [FileItem]?
    let recent_activity: [ActivityItem]?
}

struct SystemInfo: Codable {
    let hostname: String?
    let platform: String?
    let cpu_cores: Int?
    let storage_total_gb: Double?
    let storage_used_gb: Double?
    let storage_free_gb: Double?
}

struct ActivityItem: Codable {
    let event_type: String?
    let entity_type: String?
    let entity_id: String?
    let created_at: String?
}

// MARK: - Shopify Models

struct ShopifyChatFeedResponse: Codable {
    let events: [ShopifyChatEvent]
    let count: Int
    let orders_checked: Int
}

struct ShopifyChatEvent: Codable {
    let id: String
    let created_at: String
    let author: String
    let type: String
    let message: String
    let order_id: String
    let order_name: String
    let customer_name: String
    let email: String
    let financial_status: String
    let fulfillment_status: String
    let total_price: String
    let currency: String
}

// MARK: - File Models

struct FileItem: Codable {
    let id: String
    let name: String
    let folder_id: String?
    let size_bytes: Int
    let mime_type: String
    let created_at: String
    let updated_at: String?
}

struct FolderItem: Codable {
    let id: String
    let name: String
    let parent_id: String?
    let path: String
}

struct FilesListResponse: Codable {
    let files: [FileItem]
    let folders: [FolderItem]
}

// MARK: - Email Models

struct MailConfigResponse: Decodable {
    let email: String
    let username: String
    let imap_host: String
    let imap_port: Int
    let imap_use_ssl: Bool
    let smtp_host: String
    let smtp_port: Int
    let smtp_use_tls: Bool
    let smtp_use_ssl: Bool
    let has_password: Bool
    let email_signature: String?
    let is_global: Bool?
}

struct MailConfigUpdateRequest: Encodable {
    let email: String
    let username: String
    let password: String
    let imap_host: String
    let imap_port: Int
    let imap_use_ssl: Bool
    let smtp_host: String
    let smtp_port: Int
    let smtp_use_tls: Bool
    let smtp_use_ssl: Bool
    let email_signature: String
    let apply_to_all: Bool
}

struct MailInboxResponse: Codable {
    let messages: [MailMessage]
}

struct MailMessage: Codable {
    let id: String
    let from: String
    let subject: String
    let date: String
    let snippet: String
    let is_read: Bool?
}

struct MailDetail: Decodable {
    let id: String
    let from: String
    let reply_to: String?
    let to: String
    let subject: String
    let date: String
    let message_id: String?
    let in_reply_to: String?
    let references: String?
    let text_body: String
    let html_body: String?
}

struct MailReplyRequest: Encodable {
    let reply_to: String
    let from: String
    let subject: String
    let body: String
    let message_id: String
    let in_reply_to: String
    let references: String
}

struct MailSendRequest: Encodable {
    let to: String
    let subject: String
    let body: String
}

struct FolderCreateRequestPayload: Encodable {
    let name: String
    let parent_id: String?
}

struct MoveRequestPayload: Encodable {
    let folder_id: String?
}

// MARK: - Admin Models

struct AdminUserResponse: Decodable, Identifiable {
    let id: String
    let email: String
    let full_name: String
    let is_active: Bool
}

struct DirectChatMessage: Codable, Identifiable, Equatable {
    let id: String
    let sender_id: String
    let recipient_id: String
    let body: String
    let created_at: String
}

struct DirectChatParticipant: Codable, Identifiable {
    let id: String
    let email: String
    let full_name: String
    let is_active: Bool
}

struct DirectChatConversationResponse: Codable {
    let participant: DirectChatParticipant
    let messages: [DirectChatMessage]
}

struct DirectChatSendRequest: Encodable {
    let body: String
}

struct AdminCreateUserRequest: Encodable {
    let email: String
    let full_name: String
    let password: String
    let role: String
}

struct AdminCreateUserResponse: Decodable {
    let message: String
    let email_sent: Bool?
    let user_id: String?
}

struct AdminAuditLog: Decodable {
    let id: String
    let event_type: String
    let entity_type: String?
    let entity_id: String?
    let actor_user_id: String?
    let metadata: [String: String]?
    let created_at: String
}

struct StorageUsageResponse: Decodable {
    let email: String
    let used_bytes: Int
}

struct MessageResponse: Decodable {
    let message: String
}

struct CloudOpenAPIResponse: Decodable {
    let info: CloudOpenAPIInfo
}

struct CloudOpenAPIInfo: Decodable {
    let version: String
}

struct SystemInfoResponse: Decodable {
    let hostname: String
    let platform: String
    let cpu_cores: Int
    let python_version: String

    private enum CodingKeys: String, CodingKey {
        case hostname
        case platform
        case cpu_cores
        case python_version
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        hostname = (try? container.decode(String.self, forKey: .hostname)) ?? "-"
        platform = (try? container.decode(String.self, forKey: .platform)) ?? "-"

        if let cores = try? container.decode(Int.self, forKey: .cpu_cores) {
            cpu_cores = cores
        } else if let coreString = try? container.decode(String.self, forKey: .cpu_cores),
                  let cores = Int(coreString) {
            cpu_cores = cores
        } else {
            cpu_cores = 0
        }

        python_version = (try? container.decode(String.self, forKey: .python_version)) ?? "-"
    }
}

struct HealthResponse: Decodable {
    let status: String
}

struct UpdatePackageInfo: Decodable, Identifiable {
    var id: String { name }

    let name: String
    let channel: String
    let size_bytes: Int
    let modified_at: String
    let release_notes: String?
    let version: String?
}

struct UpdateStatusResponse: Decodable {
    let state: String
    let package_name: String?
    let channel: String?
    let started_at: String?
    let finished_at: String?
    let return_code: Int?
    let stdout: String?
    let stderr: String?
    let progress: Int?
    let progress_step: String?
    let release_notes: String?
    let installed_version: String?

    private enum CodingKeys: String, CodingKey {
        case state
        case package_name
        case channel
        case started_at
        case finished_at
        case return_code
        case stdout
        case stderr
        case progress
        case progress_step
        case release_notes
        case installed_version
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? container.decode(String.self, forKey: .state)) ?? "unknown"
        package_name = try? container.decodeIfPresent(String.self, forKey: .package_name)
        channel = try? container.decodeIfPresent(String.self, forKey: .channel)
        started_at = try? container.decodeIfPresent(String.self, forKey: .started_at)
        finished_at = try? container.decodeIfPresent(String.self, forKey: .finished_at)
        stdout = try? container.decodeIfPresent(String.self, forKey: .stdout)
        stderr = try? container.decodeIfPresent(String.self, forKey: .stderr)
        progress = try? container.decodeIfPresent(Int.self, forKey: .progress)
        progress_step = try? container.decodeIfPresent(String.self, forKey: .progress_step)
        release_notes = try? container.decodeIfPresent(String.self, forKey: .release_notes)
        installed_version = try? container.decodeIfPresent(String.self, forKey: .installed_version)

        if let code = try? container.decodeIfPresent(Int.self, forKey: .return_code) {
            return_code = code
        } else if let codeString = try? container.decode(String.self, forKey: .return_code),
                  let code = Int(codeString) {
            return_code = code
        } else {
            return_code = nil
        }
    }
}

struct FetchUpdateRequest: Encodable {
    let channel: String
}

struct ApplyUpdateRequest: Encodable {
    let package_name: String
    let channel: String
    let script_name: String
    let dry_run: Bool
    let auto_rebuild_docker: Bool?
    let auto_update_ubuntu: Bool?
}

// MARK: - Error Handling

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case server(String)
    case network(String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Unauthorized. Please log in again."
        case .server(let message):
            return message
        case .network(let message):
            return "Network error: \(message)"
        case .decoding(let message):
            return "Decoding error: \(message)"
        }
    }
}
