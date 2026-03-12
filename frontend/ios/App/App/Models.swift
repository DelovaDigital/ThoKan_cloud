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

struct DashboardResponse: Decodable {
    let used_bytes: Int
    let files_count: Int
    let system_info: SystemInfo?
    let recent_files: [FileItem]?
    let recent_activity: [ActivityItem]?
}

struct SystemInfo: Decodable {
    let hostname: String?
    let platform: String?
    let cpu_cores: Int?
    let storage_total_gb: Double?
    let storage_used_gb: Double?
    let storage_free_gb: Double?
}

struct ActivityItem: Decodable {
    let event_type: String?
    let entity_type: String?
    let entity_id: String?
    let created_at: String?
}

// MARK: - Shopify Models

struct ShopifyChatFeedResponse: Decodable {
    let events: [ShopifyChatEvent]
    let count: Int
    let orders_checked: Int
}

struct ShopifyChatEvent: Decodable {
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

struct FileItem: Decodable {
    let id: String
    let name: String
    let folder_id: String?
    let size_bytes: Int
    let mime_type: String
    let created_at: String
    let updated_at: String?
}

struct FolderItem: Decodable {
    let id: String
    let name: String
    let parent_id: String?
    let path: String
}

struct FilesListResponse: Decodable {
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

struct MailInboxResponse: Decodable {
    let messages: [MailMessage]
}

struct MailMessage: Decodable {
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

// MARK: - Admin Models

struct AdminUserResponse: Decodable {
    let id: String
    let email: String
    let full_name: String
    let is_active: Bool
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
}

struct UpdatePackageInfo: Decodable, Identifiable {
    var id: String { name }

    let name: String
    let channel: String
    let size_bytes: Int
    let modified_at: String
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
