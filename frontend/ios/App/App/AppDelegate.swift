import UIKit
import Capacitor
import UniformTypeIdentifiers
import MobileCoreServices
import WebKit

private struct APIConfig {
    static var baseURL: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return value
        }
        return "http://192.168.0.132:8000/api/v1"
    }
}

private final class AuthStore {
    static let shared = AuthStore()
    private let accessTokenKey = "native_access_token"

    var accessToken: String? {
        get { UserDefaults.standard.string(forKey: accessTokenKey) }
        set {
            if let value = newValue {
                UserDefaults.standard.setValue(value, forKey: accessTokenKey)
            } else {
                UserDefaults.standard.removeObject(forKey: accessTokenKey)
            }
        }
    }
}

private struct LoginResponse: Decodable {
    let access_token: String
}

private struct DashboardResponse: Decodable {
    let used_bytes: Int
    let files_count: Int
    let recent_files: [FileItem]?
    let recent_activity: [ActivityItem]?
}

private struct ActivityItem: Decodable {
    let event_type: String?
    let entity_type: String?
    let entity_id: String?
    let created_at: String?
}

private struct FileItem: Decodable {
    let id: String
    let name: String
    let folder_id: String?
    let size_bytes: Int
    let mime_type: String
    let created_at: String
}

private struct FolderItem: Decodable {
    let id: String
    let name: String
    let parent_id: String?
    let path: String
}

private struct MailInboxResponse: Decodable {
    let messages: [MailMessageItem]
}

private struct MailMessageItem: Decodable {
    let id: String
    let from: String
    let subject: String
    let date: String
    let snippet: String
}

private struct MailDetailResponse: Decodable {
    let id: String
    let from: String
    let to: String
    let subject: String
    let date: String
    let text_body: String
    let html_body: String
}

private struct UserMeResponse: Decodable {
    let id: String
    let email: String
    let full_name: String?
    let roles: [String]
}

private struct MailConfigResponse: Decodable {
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
}

private enum APIError: Error {
    case invalidURL
    case invalidResponse
    case server(String)
}

extension APIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL configuration"
        case .invalidResponse:
            return "Invalid response from server"
        case .server(let message):
            return message
        }
    }
}

private extension UIViewController {
    func installKeyboardDismissGesture() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(hideKeyboardFromTap))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
    }

    @objc func hideKeyboardFromTap() {
        view.endEditing(true)
    }
}

private final class APIClient {
    static let shared = APIClient()

    private func serverError(from data: Data?, fallback: String) -> APIError {
        guard let data,
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let detail = payload["detail"] as? String,
              !detail.isEmpty
        else {
            return .server(fallback)
        }
        return .server(detail)
    }

    func login(email: String, password: String, completion: @escaping (Result<String, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/auth/login") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["email": email, "password": password])

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Login failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(LoginResponse.self, from: data)
                completion(.success(decoded.access_token))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func fetchDashboard(accessToken: String, completion: @escaping (Result<DashboardResponse, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/dashboard") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Dashboard load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(DashboardResponse.self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func fetchMe(accessToken: String, completion: @escaping (Result<UserMeResponse, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/auth/me") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Profile load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(UserMeResponse.self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func fetchMailConfig(accessToken: String, completion: @escaping (Result<MailConfigResponse, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/mail/config") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Mail settings load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(MailConfigResponse.self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func saveMailConfig(accessToken: String, payload: [String: Any], completion: @escaping (Result<String, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/mail/config") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Mail settings save failed")))
                return
            }

            if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["message"] as? String {
                completion(.success(message))
            } else {
                completion(.success("Mail settings saved"))
            }
        }.resume()
    }

    func testMailConfig(accessToken: String, completion: @escaping (Result<String, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/mail/test") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Mail connection test failed")))
                return
            }

            if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["message"] as? String {
                completion(.success(message))
            } else {
                completion(.success("Mail connection successful"))
            }
        }.resume()
    }

    func fetchFiles(accessToken: String, completion: @escaping (Result<[FileItem], Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/files") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Files load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode([FileItem].self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func fetchInbox(accessToken: String, completion: @escaping (Result<[MailMessageItem], Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/mail/inbox?limit=20") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Mail load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(MailInboxResponse.self, from: data)
                completion(.success(decoded.messages))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func fetchMailDetail(accessToken: String, messageID: String, completion: @escaping (Result<MailDetailResponse, Error>) -> Void) {
        guard let encodedID = messageID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(APIConfig.baseURL)/mail/message/\(encodedID)") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Mail detail load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(MailDetailResponse.self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func deleteMail(accessToken: String, messageID: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let encodedID = messageID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(APIConfig.baseURL)/mail/message/\(encodedID)") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Delete failed")))
                return
            }

            completion(.success(()))
        }.resume()
    }

    func sendMail(accessToken: String, to: String, subject: String, body: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/mail/send") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "to": to,
            "subject": subject,
            "body": body,
        ])

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Send failed")))
                return
            }

            completion(.success(()))
        }.resume()
    }

    func downloadFile(accessToken: String, fileID: String, completion: @escaping (Result<(Data, String?), Error>) -> Void) {
        guard let encodedID = fileID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(APIConfig.baseURL)/files/\(encodedID)/download") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Download failed")))
                return
            }

            let disposition = http.value(forHTTPHeaderField: "Content-Disposition")
            completion(.success((data, disposition)))
        }.resume()
    }

    func uploadFile(accessToken: String, fileURL: URL, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/files/upload") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        do {
            let fileData = try Data(contentsOf: fileURL)
            let fileName = fileURL.lastPathComponent

            var body = Data()
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"upload\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)

            request.httpBody = body
        } catch {
            completion(.failure(error))
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Upload failed")))
                return
            }

            completion(.success(()))
        }.resume()
    }

    func fetchFolders(accessToken: String, completion: @escaping (Result<[FolderItem], Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/folders") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse, let data else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Folders load failed")))
                return
            }

            do {
                let decoded = try JSONDecoder().decode([FolderItem].self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func createFolder(accessToken: String, name: String, parentID: String?, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/folders") else {
            completion(.failure(APIError.invalidURL))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = ["name": name, "parent_id": parentID ?? NSNull()]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }
            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Create folder failed")))
                return
            }
            completion(.success(()))
        }.resume()
    }

    func renameFolder(accessToken: String, folderID: String, name: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let encodedID = folderID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(APIConfig.baseURL)/folders/\(encodedID)/rename") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["name": name])

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }
            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Rename folder failed")))
                return
            }
            completion(.success(()))
        }.resume()
    }

    func moveFolder(accessToken: String, folderID: String, parentID: String?, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let encodedID = folderID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(APIConfig.baseURL)/folders/\(encodedID)/move") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = ["folder_id": parentID ?? NSNull()]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }
            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Move folder failed")))
                return
            }
            completion(.success(()))
        }.resume()
    }

    func deleteFolder(accessToken: String, folderID: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let encodedID = folderID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(APIConfig.baseURL)/folders/\(encodedID)") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse else {
                completion(.failure(APIError.invalidResponse))
                return
            }
            guard (200...299).contains(http.statusCode) else {
                completion(.failure(self.serverError(from: data, fallback: "Delete folder failed")))
                return
            }
            completion(.success(()))
        }.resume()
    }
}

private func formatBytes(_ bytes: Int) -> String {
    if bytes <= 0 { return "0 B" }
    let units = ["B", "KB", "MB", "GB", "TB"]
    var value = Double(bytes)
    var idx = 0
    while value >= 1024 && idx < units.count - 1 {
        value /= 1024
        idx += 1
    }
    return String(format: "%.1f %@", value, units[idx])
}

private final class LoginViewController: UIViewController {
    var onLoggedIn: (() -> Void)?

    private let emailField = UITextField()
    private let passwordField = UITextField()
    private let loginButton = UIButton(type: .system)
    private let statusLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Login"
        installKeyboardDismissGesture()

        emailField.placeholder = "Email"
        emailField.borderStyle = .roundedRect
        emailField.autocapitalizationType = .none
        emailField.keyboardType = .emailAddress
        emailField.textContentType = .username

        passwordField.placeholder = "Password"
        passwordField.borderStyle = .roundedRect
        passwordField.isSecureTextEntry = true
        passwordField.textContentType = .password

        loginButton.setTitle("Sign In", for: .normal)
        loginButton.backgroundColor = .systemBlue
        loginButton.setTitleColor(.white, for: .normal)
        loginButton.layer.cornerRadius = 10
        loginButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
        loginButton.addTarget(self, action: #selector(loginTapped), for: .touchUpInside)

        statusLabel.textColor = .systemRed
        statusLabel.numberOfLines = 0
        statusLabel.font = .systemFont(ofSize: 14)

        let stack = UIStackView(arrangedSubviews: [emailField, passwordField, loginButton, statusLabel])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    @objc private func loginTapped() {
        let email = emailField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = passwordField.text ?? ""

        guard !email.isEmpty, !password.isEmpty else {
            statusLabel.text = "Vul e-mail en wachtwoord in."
            return
        }

        loginButton.isEnabled = false
        statusLabel.text = ""

        APIClient.shared.login(email: email, password: password) { result in
            DispatchQueue.main.async {
                self.loginButton.isEnabled = true
                switch result {
                case .success(let token):
                    AuthStore.shared.accessToken = token
                    self.onLoggedIn?()
                case .failure(let error):
                    self.statusLabel.text = (error as? APIError).flatMap {
                        if case .server(let message) = $0 { return message }
                        return nil
                    } ?? error.localizedDescription
                }
            }
        }
    }
}

private final class DashboardViewController: UIViewController {
    private let usedLabel = UILabel()
    private let filesLabel = UILabel()
    private let quickActions = UIStackView()
    private let openFilesButton = UIButton(type: .system)
    private let openMailButton = UIButton(type: .system)
    private let refreshButton = UIButton(type: .system)
    private let recentLabel = UILabel()
    private let recentTableView = UITableView(frame: .zero, style: .insetGrouped)
    private let statusLabel = UILabel()
    private var recentItems: [String] = []
    var onOpenTab: ((Int) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Dashboard"

        usedLabel.font = .boldSystemFont(ofSize: 24)
        usedLabel.text = "Storage: --"

        filesLabel.font = .systemFont(ofSize: 20)
        filesLabel.text = "Files: --"

        openFilesButton.setTitle("Open Files", for: .normal)
        openFilesButton.backgroundColor = .systemGray5
        openFilesButton.layer.cornerRadius = 10
        openFilesButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        openFilesButton.addTarget(self, action: #selector(openFilesTapped), for: .touchUpInside)

        openMailButton.setTitle("Open Mail", for: .normal)
        openMailButton.backgroundColor = .systemGray5
        openMailButton.layer.cornerRadius = 10
        openMailButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        openMailButton.addTarget(self, action: #selector(openMailTapped), for: .touchUpInside)

        quickActions.axis = .horizontal
        quickActions.spacing = 10
        quickActions.distribution = .fillEqually
        quickActions.addArrangedSubview(openFilesButton)
        quickActions.addArrangedSubview(openMailButton)

        refreshButton.setTitle("Refresh", for: .normal)
        refreshButton.backgroundColor = .systemBlue
        refreshButton.setTitleColor(.white, for: .normal)
        refreshButton.layer.cornerRadius = 10
        refreshButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        refreshButton.addTarget(self, action: #selector(loadData), for: .touchUpInside)

        recentLabel.font = .boldSystemFont(ofSize: 18)
        recentLabel.text = "Recent activity"

        recentTableView.dataSource = self
        recentTableView.delegate = self
        recentTableView.rowHeight = 54
        recentTableView.isScrollEnabled = false
        recentTableView.register(UITableViewCell.self, forCellReuseIdentifier: "RecentCell")

        statusLabel.font = .systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [usedLabel, filesLabel, quickActions, refreshButton, recentLabel, recentTableView, statusLabel])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            recentTableView.heightAnchor.constraint(equalToConstant: 240)
        ])

        loadData()
    }

    @objc private func loadData() {
        guard let token = AuthStore.shared.accessToken else {
            statusLabel.text = "Niet ingelogd."
            return
        }

        statusLabel.text = "Laden..."
        APIClient.shared.fetchDashboard(accessToken: token) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let dashboard):
                    self.usedLabel.text = "Storage: \(formatBytes(dashboard.used_bytes))"
                    self.filesLabel.text = "Files: \(dashboard.files_count)"
                    var recent: [String] = []
                    let activityRows = dashboard.recent_activity ?? []
                    for item in activityRows.prefix(5) {
                        let event = (item.event_type ?? "event").replacingOccurrences(of: ".", with: " ")
                        let entity = item.entity_type ?? "item"
                        recent.append("\(event) • \(entity)")
                    }
                    if recent.isEmpty {
                        for file in (dashboard.recent_files ?? []).prefix(5) {
                            recent.append("file • \(file.name)")
                        }
                    }
                    self.recentItems = recent
                    self.recentTableView.reloadData()
                    self.statusLabel.text = ""
                case .failure(let error):
                    self.recentItems = []
                    self.recentTableView.reloadData()
                    self.statusLabel.text = error.localizedDescription
                }
            }
        }
    }

    @objc private func openFilesTapped() {
        onOpenTab?(1)
    }

    @objc private func openMailTapped() {
        onOpenTab?(2)
    }
}

extension DashboardViewController: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return max(recentItems.count, 1)
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: "RecentCell")
        if recentItems.isEmpty {
            cell.textLabel?.text = "No recent activity"
            cell.textLabel?.textColor = .secondaryLabel
        } else {
            cell.textLabel?.text = recentItems[indexPath.row]
            cell.textLabel?.textColor = .label
        }
        cell.selectionStyle = .none
        return cell
    }
}

private final class PlaceholderViewController: UIViewController {
    init(titleText: String) {
        super.init(nibName: nil, bundle: nil)
        title = titleText
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let label = UILabel()
        label.text = "\(title ?? "") (native)"
        label.textColor = .secondaryLabel
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
}

private final class FilesViewController: UIViewController, UITableViewDataSource, UITableViewDelegate, UIDocumentPickerDelegate {
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private var allFolders: [FolderItem] = []
    private var allFiles: [FileItem] = []
    private var folders: [FolderItem] = []
    private var files: [FileItem] = []
    private var currentFolderID: String?
    private var currentFolderPath = "/"
    private let emptyLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Files"

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "FileCell")

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(loadFiles), for: .valueChanged)
        tableView.refreshControl = refresh

        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleFolderLongPress(_:)))
        tableView.addGestureRecognizer(longPress)

        emptyLabel.text = "Geen files"
        emptyLabel.textColor = .secondaryLabel
        emptyLabel.textAlignment = .center
        emptyLabel.translatesAutoresizingMaskIntoConstraints = false
        emptyLabel.isHidden = true

        view.addSubview(tableView)
        view.addSubview(emptyLabel)

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            emptyLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            emptyLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])

        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(title: "Folder", style: .plain, target: self, action: #selector(createFolderTapped)),
            UIBarButtonItem(barButtonSystemItem: .add, target: self, action: #selector(uploadTapped)),
            UIBarButtonItem(title: "Refresh", style: .plain, target: self, action: #selector(loadFiles)),
        ]
        loadFiles()
    }

    @objc private func createFolderTapped() {
        let alert = UIAlertController(title: "Nieuwe folder", message: nil, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "Foldernaam"
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Maak aan", style: .default, handler: { _ in
            guard
                let token = AuthStore.shared.accessToken,
                let name = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines),
                !name.isEmpty
            else { return }

            APIClient.shared.createFolder(accessToken: token, name: name, parentID: self.currentFolderID) { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success:
                        self.loadFiles()
                    case .failure(let error):
                        let errAlert = UIAlertController(title: "Folder create failed", message: error.localizedDescription, preferredStyle: .alert)
                        errAlert.addAction(UIAlertAction(title: "OK", style: .default))
                        self.present(errAlert, animated: true)
                    }
                }
            }
        }))
        present(alert, animated: true)
    }

    private func presentMoveFolderSheet(for folder: FolderItem, accessToken: String) {
        let destinationSheet = UIAlertController(title: "Move folder", message: "Select destination", preferredStyle: .actionSheet)
        destinationSheet.addAction(UIAlertAction(title: "Root", style: .default, handler: { _ in
            self.executeMove(folder: folder, parentID: nil, accessToken: accessToken)
        }))

        let descendantsPrefix = folder.path + "/"
        let possibleTargets = allFolders.filter { candidate in
            if candidate.id == folder.id { return false }
            if candidate.path.hasPrefix(descendantsPrefix) { return false }
            return true
        }

        for target in possibleTargets {
            destinationSheet.addAction(UIAlertAction(title: target.path, style: .default, handler: { _ in
                self.executeMove(folder: folder, parentID: target.id, accessToken: accessToken)
            }))
        }

        destinationSheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(destinationSheet, animated: true)
    }

    @objc private func handleFolderLongPress(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began else { return }
        let location = gesture.location(in: tableView)
        guard let indexPath = tableView.indexPathForRow(at: location), indexPath.section == 0 else { return }
        guard let token = AuthStore.shared.accessToken else { return }
        let folder = folders[indexPath.row]
        presentFolderOptions(for: folder, accessToken: token)
    }

    @objc private func folderOptionsTapped(_ sender: UIButton) {
        let index = sender.tag
        guard index >= 0 && index < folders.count else { return }
        guard let token = AuthStore.shared.accessToken else { return }
        let folder = folders[index]
        presentFolderOptions(for: folder, accessToken: token)
    }

    private func applyCurrentFolderFilter() {
        folders = allFolders
            .filter { $0.parent_id == currentFolderID }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        files = allFiles
            .filter { $0.folder_id == currentFolderID }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        emptyLabel.isHidden = !(folders.isEmpty && files.isEmpty)
        updateNavigationState()
        tableView.reloadData()
    }

    private func updateNavigationState() {
        if currentFolderID == nil {
            title = "Files"
            navigationItem.leftBarButtonItem = nil
        } else {
            title = currentFolderPath
            navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Back", style: .plain, target: self, action: #selector(goUpOneFolder))
        }
    }

    @objc private func goUpOneFolder() {
        guard let folderID = currentFolderID else { return }
        guard let currentFolder = allFolders.first(where: { $0.id == folderID }) else {
            currentFolderID = nil
            currentFolderPath = "/"
            applyCurrentFolderFilter()
            return
        }

        currentFolderID = currentFolder.parent_id
        if let parentID = currentFolder.parent_id,
           let parent = allFolders.first(where: { $0.id == parentID }) {
            currentFolderPath = parent.path
        } else {
            currentFolderPath = "/"
        }
        applyCurrentFolderFilter()
    }

    private func enterFolder(_ folder: FolderItem) {
        currentFolderID = folder.id
        currentFolderPath = folder.path
        applyCurrentFolderFilter()
    }

    private func presentFolderOptions(for folder: FolderItem, accessToken: String) {
        let action = UIAlertController(title: folder.name, message: folder.path, preferredStyle: .actionSheet)
        action.addAction(UIAlertAction(title: "Rename", style: .default, handler: { _ in
            let rename = UIAlertController(title: "Rename folder", message: nil, preferredStyle: .alert)
            rename.addTextField { field in field.text = folder.name }
            rename.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            rename.addAction(UIAlertAction(title: "Save", style: .default, handler: { _ in
                guard let newName = rename.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines), !newName.isEmpty else { return }
                APIClient.shared.renameFolder(accessToken: accessToken, folderID: folder.id, name: newName) { result in
                    DispatchQueue.main.async {
                        switch result {
                        case .success: self.loadFiles()
                        case .failure(let error):
                            let err = UIAlertController(title: "Rename failed", message: error.localizedDescription, preferredStyle: .alert)
                            err.addAction(UIAlertAction(title: "OK", style: .default))
                            self.present(err, animated: true)
                        }
                    }
                }
            }))
            self.present(rename, animated: true)
        }))
        action.addAction(UIAlertAction(title: "Move", style: .default, handler: { _ in
            self.presentMoveFolderSheet(for: folder, accessToken: accessToken)
        }))
        action.addAction(UIAlertAction(title: "Delete", style: .destructive, handler: { _ in
            APIClient.shared.deleteFolder(accessToken: accessToken, folderID: folder.id) { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success: self.loadFiles()
                    case .failure(let error):
                        let err = UIAlertController(title: "Delete failed", message: error.localizedDescription, preferredStyle: .alert)
                        err.addAction(UIAlertAction(title: "OK", style: .default))
                        self.present(err, animated: true)
                    }
                }
            }
        }))
        action.addAction(UIAlertAction(title: "Close", style: .cancel))
        present(action, animated: true)
    }

    private func executeMove(folder: FolderItem, parentID: String?, accessToken: String) {
        APIClient.shared.moveFolder(accessToken: accessToken, folderID: folder.id, parentID: parentID) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self.loadFiles()
                case .failure(let error):
                    let err = UIAlertController(title: "Move failed", message: error.localizedDescription, preferredStyle: .alert)
                    err.addAction(UIAlertAction(title: "OK", style: .default))
                    self.present(err, animated: true)
                }
            }
        }
    }

    @objc private func uploadTapped() {
        let picker: UIDocumentPickerViewController
        if #available(iOS 14.0, *) {
            picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.data], asCopy: true)
        } else {
            picker = UIDocumentPickerViewController(documentTypes: [String(kUTTypeData)], in: .import)
        }
        picker.delegate = self
        picker.modalPresentationStyle = .formSheet
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let sourceURL = urls.first, let token = AuthStore.shared.accessToken else { return }

        let didAccess = sourceURL.startAccessingSecurityScopedResource()
        let tmpURL = FileManager.default.temporaryDirectory.appendingPathComponent(sourceURL.lastPathComponent)
        do {
            if FileManager.default.fileExists(atPath: tmpURL.path) {
                try FileManager.default.removeItem(at: tmpURL)
            }
            try FileManager.default.copyItem(at: sourceURL, to: tmpURL)
        } catch {
            if didAccess { sourceURL.stopAccessingSecurityScopedResource() }
            let alert = UIAlertController(title: "Upload failed", message: "Cannot access selected file", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
            return
        }
        if didAccess { sourceURL.stopAccessingSecurityScopedResource() }

        APIClient.shared.uploadFile(accessToken: token, fileURL: tmpURL) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self.loadFiles()
                case .failure(let error):
                    let alert = UIAlertController(title: "Upload failed", message: error.localizedDescription, preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default))
                    self.present(alert, animated: true)
                }
            }
        }
    }

    @objc private func loadFiles() {
        guard let token = AuthStore.shared.accessToken else {
            emptyLabel.text = "Niet ingelogd"
            emptyLabel.isHidden = false
            tableView.refreshControl?.endRefreshing()
            return
        }

        let group = DispatchGroup()
        var filesResult: Result<[FileItem], Error>?
        var foldersResult: Result<[FolderItem], Error>?

        group.enter()
        APIClient.shared.fetchFiles(accessToken: token) { result in
            filesResult = result
            group.leave()
        }

        group.enter()
        APIClient.shared.fetchFolders(accessToken: token) { result in
            foldersResult = result
            group.leave()
        }

        group.notify(queue: .main) {
            DispatchQueue.main.async {
                self.tableView.refreshControl?.endRefreshing()
                if case .failure(let error) = filesResult {
                    self.allFiles = []
                    self.files = []
                    self.emptyLabel.text = error.localizedDescription
                    self.emptyLabel.isHidden = false
                } else {
                    self.allFiles = (try? filesResult?.get()) ?? []
                }

                if case .failure(let error) = foldersResult {
                    self.allFolders = []
                    self.folders = []
                    if self.files.isEmpty {
                        self.emptyLabel.text = error.localizedDescription
                        self.emptyLabel.isHidden = false
                    }
                } else {
                    self.allFolders = ((try? foldersResult?.get()) ?? []).sorted { $0.path < $1.path }
                }

                if let selected = self.currentFolderID,
                   self.allFolders.first(where: { $0.id == selected }) == nil {
                    self.currentFolderID = nil
                    self.currentFolderPath = "/"
                }

                self.applyCurrentFolderFilter()
            }
        }
    }

    func numberOfSections(in tableView: UITableView) -> Int { 2 }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        section == 0 ? "Folders" : "Files"
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        section == 0 ? folders.count : files.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "Cell")
        if indexPath.section == 0 {
            let folder = folders[indexPath.row]
            cell.textLabel?.text = folder.name
            cell.detailTextLabel?.text = folder.path
            cell.imageView?.image = UIImage(systemName: "folder")
            let optionsButton = UIButton(type: .system)
            optionsButton.setImage(UIImage(systemName: "ellipsis"), for: .normal)
            optionsButton.tintColor = .secondaryLabel
            optionsButton.tag = indexPath.row
            optionsButton.addTarget(self, action: #selector(folderOptionsTapped(_:)), for: .touchUpInside)
            cell.accessoryView = optionsButton
        } else {
            let file = files[indexPath.row]
            cell.textLabel?.text = file.name
            cell.detailTextLabel?.text = "\(formatBytes(file.size_bytes)) • \(file.mime_type)"
            cell.imageView?.image = UIImage(systemName: "doc")
            cell.accessoryView = nil
        }
        cell.detailTextLabel?.textColor = .secondaryLabel
        cell.detailTextLabel?.numberOfLines = 1
        cell.selectionStyle = .none

        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard let token = AuthStore.shared.accessToken else { return }

        if indexPath.section == 0 {
            let folder = folders[indexPath.row]
            enterFolder(folder)
            return
        }

        let file = files[indexPath.row]
        APIClient.shared.downloadFile(accessToken: token, fileID: file.id) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let payload):
                    let tmpURL = FileManager.default.temporaryDirectory.appendingPathComponent(file.name)
                    do {
                        try payload.0.write(to: tmpURL, options: .atomic)
                        let activity = UIActivityViewController(activityItems: [tmpURL], applicationActivities: nil)
                        self.present(activity, animated: true)
                    } catch {
                        let alert = UIAlertController(title: "Download failed", message: error.localizedDescription, preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "OK", style: .default))
                        self.present(alert, animated: true)
                    }
                case .failure(let error):
                    let alert = UIAlertController(title: "Download failed", message: error.localizedDescription, preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default))
                    self.present(alert, animated: true)
                }
            }
        }
    }
}

private final class MailDetailViewController: UIViewController {
    private let messageID: String
    var onDeleted: (() -> Void)?

    private let webView = WKWebView(frame: .zero)

    init(messageID: String) {
        self.messageID = messageID
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Message"

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .trash, target: self, action: #selector(deleteTapped))
        loadDetail()
    }

    private func htmlEscaped(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    private func renderMailHTML(from detail: MailDetailResponse) {
        let subject = detail.subject.isEmpty ? "(Geen onderwerp)" : detail.subject
        let from = htmlEscaped(detail.from)
        let to = htmlEscaped(detail.to)
        let date = htmlEscaped(detail.date)

        let bodyHTML: String
        if !detail.html_body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            bodyHTML = detail.html_body
        } else {
            let plain = htmlEscaped(detail.text_body).replacingOccurrences(of: "\n", with: "<br>")
            bodyHTML = "<div style='white-space: normal;'>\(plain)</div>"
        }

        let html = """
        <!doctype html>
        <html>
          <head>
            <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
              .header { padding: 14px 14px 10px 14px; border-bottom: 1px solid #ddd; }
              .subject { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
              .meta { font-size: 13px; color: #666; line-height: 1.5; }
              .content { padding: 14px; word-wrap: break-word; }
              img { max-width: 100%; height: auto; }
              table { max-width: 100% !important; }
            </style>
          </head>
          <body>
            <div class=\"header\">
              <div class=\"subject\">\(htmlEscaped(subject))</div>
              <div class=\"meta\"><strong>From:</strong> \(from)<br><strong>To:</strong> \(to)<br><strong>Date:</strong> \(date)</div>
            </div>
            <div class=\"content\">\(bodyHTML)</div>
          </body>
        </html>
        """

        webView.loadHTMLString(html, baseURL: nil)
    }

    private func loadDetail() {
        guard let token = AuthStore.shared.accessToken else { return }
        webView.loadHTMLString("<html><body style='font-family:-apple-system;padding:16px;'>Laden...</body></html>", baseURL: nil)

        APIClient.shared.fetchMailDetail(accessToken: token, messageID: messageID) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let detail):
                    self.title = detail.subject.isEmpty ? "(Geen onderwerp)" : detail.subject
                    self.renderMailHTML(from: detail)
                case .failure(let error):
                    let errorHTML = "<html><body style='font-family:-apple-system;padding:16px;color:#b00020;'>\(self.htmlEscaped(error.localizedDescription))</body></html>"
                    self.webView.loadHTMLString(errorHTML, baseURL: nil)
                }
            }
        }
    }

    @objc private func deleteTapped() {
        guard let token = AuthStore.shared.accessToken else { return }
        APIClient.shared.deleteMail(accessToken: token, messageID: messageID) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self.onDeleted?()
                    self.navigationController?.popViewController(animated: true)
                case .failure(let error):
                    let alert = UIAlertController(title: "Delete failed", message: error.localizedDescription, preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default))
                    self.present(alert, animated: true)
                }
            }
        }
    }
}

private final class MailComposeViewController: UIViewController {
    var onSent: (() -> Void)?

    private let toField = UITextField()
    private let subjectField = UITextField()
    private let bodyField = UITextView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Compose"
        installKeyboardDismissGesture()

        toField.placeholder = "To"
        toField.borderStyle = .roundedRect
        toField.keyboardType = .emailAddress
        toField.autocapitalizationType = .none

        subjectField.placeholder = "Subject"
        subjectField.borderStyle = .roundedRect

        bodyField.font = .systemFont(ofSize: 15)
        bodyField.layer.borderColor = UIColor.separator.cgColor
        bodyField.layer.borderWidth = 1
        bodyField.layer.cornerRadius = 8

        let stack = UIStackView(arrangedSubviews: [toField, subjectField, bodyField])
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            bodyField.heightAnchor.constraint(equalToConstant: 220)
        ])

        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Send", style: .done, target: self, action: #selector(sendTapped))
    }

    @objc private func sendTapped() {
        guard let token = AuthStore.shared.accessToken else { return }
        let to = toField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let subject = subjectField.text ?? ""
        let body = bodyField.text ?? ""

        guard !to.isEmpty else {
            let alert = UIAlertController(title: "Recipient required", message: nil, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
            return
        }

        APIClient.shared.sendMail(accessToken: token, to: to, subject: subject, body: body) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self.onSent?()
                    self.navigationController?.popViewController(animated: true)
                case .failure(let error):
                    let alert = UIAlertController(title: "Send failed", message: error.localizedDescription, preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default))
                    self.present(alert, animated: true)
                }
            }
        }
    }
}

private final class MailViewController: UIViewController, UITableViewDataSource, UITableViewDelegate {
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private var messages: [MailMessageItem] = []
    private let emptyLabel = UILabel()
    var onOpenSettings: (() -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Mail"

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "MailCell")

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(loadInbox), for: .valueChanged)
        tableView.refreshControl = refresh

        emptyLabel.text = "Geen mails"
        emptyLabel.textColor = .secondaryLabel
        emptyLabel.textAlignment = .center
        emptyLabel.translatesAutoresizingMaskIntoConstraints = false
        emptyLabel.isHidden = true

        view.addSubview(tableView)
        view.addSubview(emptyLabel)

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            emptyLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            emptyLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])

        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(barButtonSystemItem: .compose, target: self, action: #selector(composeTapped)),
            UIBarButtonItem(title: "Mail Settings", style: .plain, target: self, action: #selector(openMailSettingsTapped)),
            UIBarButtonItem(title: "Refresh", style: .plain, target: self, action: #selector(loadInbox)),
        ]
        loadInbox()
    }

    @objc private func openMailSettingsTapped() {
        onOpenSettings?()
    }

    @objc private func composeTapped() {
        let compose = MailComposeViewController()
        compose.onSent = { [weak self] in self?.loadInbox() }
        navigationController?.pushViewController(compose, animated: true)
    }

    @objc private func loadInbox() {
        guard let token = AuthStore.shared.accessToken else {
            emptyLabel.text = "Niet ingelogd"
            emptyLabel.isHidden = false
            tableView.refreshControl?.endRefreshing()
            return
        }

        APIClient.shared.fetchInbox(accessToken: token) { result in
            DispatchQueue.main.async {
                self.tableView.refreshControl?.endRefreshing()
                switch result {
                case .success(let messages):
                    self.messages = messages
                    self.emptyLabel.isHidden = !messages.isEmpty
                    self.tableView.reloadData()
                case .failure(let error):
                    self.messages = []
                    self.emptyLabel.text = error.localizedDescription
                    self.emptyLabel.isHidden = false
                    self.tableView.reloadData()
                }
            }
        }
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        messages.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "MailCell")
        let message = messages[indexPath.row]

        cell.textLabel?.text = message.subject.isEmpty ? "(Geen onderwerp)" : message.subject
        cell.detailTextLabel?.text = "\(message.from)\n\(message.snippet)"
        cell.detailTextLabel?.textColor = .secondaryLabel
        cell.detailTextLabel?.numberOfLines = 2
        cell.selectionStyle = .none

        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let message = messages[indexPath.row]
        let detail = MailDetailViewController(messageID: message.id)
        detail.onDeleted = { [weak self] in self?.loadInbox() }
        navigationController?.pushViewController(detail, animated: true)
    }
}

private final class SettingsViewController: UIViewController {
    var onLogout: (() -> Void)?
    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()
    private let profileLabel = UILabel()
    private let mailToggleButton = UIButton(type: .system)
    private let mailSectionStack = UIStackView()
    private let mailHeader = UILabel()
    private let emailField = UITextField()
    private let usernameField = UITextField()
    private let passwordField = UITextField()
    private let imapHostField = UITextField()
    private let imapPortField = UITextField()
    private let smtpHostField = UITextField()
    private let smtpPortField = UITextField()
    private let imapSSL = UISwitch()
    private let smtpTLS = UISwitch()
    private let smtpSSL = UISwitch()
    private let testButton = UIButton(type: .system)
    private let saveButton = UIButton(type: .system)
    private let logoutButton = UIButton(type: .system)
    private let statusLabel = UILabel()
    private var isMailSectionExpanded = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Settings"
        installKeyboardDismissGesture()

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.translatesAutoresizingMaskIntoConstraints = false

        profileLabel.font = .systemFont(ofSize: 14)
        profileLabel.textColor = .secondaryLabel
        profileLabel.numberOfLines = 0
        profileLabel.text = "Loading profile..."

        mailToggleButton.setTitle("Show mail settings", for: .normal)
        mailToggleButton.backgroundColor = .systemGray5
        mailToggleButton.layer.cornerRadius = 10
        mailToggleButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        mailToggleButton.addTarget(self, action: #selector(toggleMailSection), for: .touchUpInside)

        mailSectionStack.axis = .vertical
        mailSectionStack.spacing = 12
        mailSectionStack.isHidden = true

        mailHeader.font = .boldSystemFont(ofSize: 20)
        mailHeader.text = "Mail settings"

        configureField(emailField, placeholder: "Mailbox email", keyboard: .emailAddress)
        configureField(usernameField, placeholder: "Username", keyboard: .emailAddress)
        configureField(passwordField, placeholder: "Password (leave empty to keep)", keyboard: .default, secure: true)
        configureField(imapHostField, placeholder: "IMAP host", keyboard: .URL)
        configureField(imapPortField, placeholder: "IMAP port", keyboard: .numberPad)
        configureField(smtpHostField, placeholder: "SMTP host", keyboard: .URL)
        configureField(smtpPortField, placeholder: "SMTP port", keyboard: .numberPad)
        imapPortField.text = "993"
        smtpPortField.text = "587"

        scrollView.keyboardDismissMode = .interactive

        testButton.setTitle("Test mail connection", for: .normal)
        testButton.backgroundColor = .systemGray5
        testButton.layer.cornerRadius = 10
        testButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        testButton.addTarget(self, action: #selector(testMailTapped), for: .touchUpInside)

        saveButton.setTitle("Save mail settings", for: .normal)
        saveButton.backgroundColor = .systemBlue
        saveButton.setTitleColor(.white, for: .normal)
        saveButton.layer.cornerRadius = 10
        saveButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        saveButton.addTarget(self, action: #selector(saveMailTapped), for: .touchUpInside)

        logoutButton.setTitle("Log out", for: .normal)
        logoutButton.backgroundColor = .systemRed
        logoutButton.setTitleColor(.white, for: .normal)
        logoutButton.layer.cornerRadius = 10
        logoutButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 18, bottom: 12, right: 18)
        logoutButton.addTarget(self, action: #selector(logoutTapped), for: .touchUpInside)

        statusLabel.font = .systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0

        let flagsStack = UIStackView(arrangedSubviews: [
            toggleRow(title: "IMAP SSL", toggle: imapSSL),
            toggleRow(title: "SMTP TLS", toggle: smtpTLS),
            toggleRow(title: "SMTP SSL", toggle: smtpSSL)
        ])
        flagsStack.axis = .vertical
        flagsStack.spacing = 8

        let rowButtons = UIStackView(arrangedSubviews: [testButton, saveButton])
        rowButtons.axis = .horizontal
        rowButtons.spacing = 8
        rowButtons.distribution = .fillEqually

        contentStack.addArrangedSubview(profileLabel)
        contentStack.addArrangedSubview(mailToggleButton)
        mailSectionStack.addArrangedSubview(mailHeader)
        mailSectionStack.addArrangedSubview(emailField)
        mailSectionStack.addArrangedSubview(usernameField)
        mailSectionStack.addArrangedSubview(passwordField)
        mailSectionStack.addArrangedSubview(imapHostField)
        mailSectionStack.addArrangedSubview(imapPortField)
        mailSectionStack.addArrangedSubview(smtpHostField)
        mailSectionStack.addArrangedSubview(smtpPortField)
        mailSectionStack.addArrangedSubview(flagsStack)
        mailSectionStack.addArrangedSubview(rowButtons)
        mailSectionStack.addArrangedSubview(statusLabel)
        contentStack.addArrangedSubview(mailSectionStack)
        contentStack.addArrangedSubview(logoutButton)

        view.addSubview(scrollView)
        scrollView.addSubview(contentStack)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            contentStack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -24),
            contentStack.widthAnchor.constraint(equalTo: view.layoutMarginsGuide.widthAnchor)
        ])

        loadSettings()
    }

    @objc private func toggleMailSection() {
        isMailSectionExpanded.toggle()
        mailSectionStack.isHidden = !isMailSectionExpanded
        let title = isMailSectionExpanded ? "Hide mail settings" : "Show mail settings"
        mailToggleButton.setTitle(title, for: .normal)
    }

    private func configureField(_ field: UITextField, placeholder: String, keyboard: UIKeyboardType, secure: Bool = false) {
        field.placeholder = placeholder
        field.borderStyle = .roundedRect
        field.keyboardType = keyboard
        field.isSecureTextEntry = secure
        field.autocapitalizationType = .none
    }

    private func toggleRow(title: String, toggle: UISwitch) -> UIView {
        let label = UILabel()
        label.text = title
        let spacer = UIView()
        let row = UIStackView(arrangedSubviews: [label, spacer, toggle])
        row.axis = .horizontal
        row.alignment = .center
        return row
    }

    private func loadSettings() {
        guard let token = AuthStore.shared.accessToken else {
            profileLabel.text = "Not logged in"
            return
        }

        statusLabel.text = "Loading settings..."
        let group = DispatchGroup()
        var meResult: Result<UserMeResponse, Error>?
        var mailResult: Result<MailConfigResponse, Error>?

        group.enter()
        APIClient.shared.fetchMe(accessToken: token) { result in
            meResult = result
            group.leave()
        }

        group.enter()
        APIClient.shared.fetchMailConfig(accessToken: token) { result in
            mailResult = result
            group.leave()
        }

        group.notify(queue: .main) {
            switch meResult {
            case .success(let me):
                let roles = me.roles.joined(separator: ", ")
                self.profileLabel.text = "\(me.email)\nRoles: \(roles)"
            case .failure(let error):
                self.profileLabel.text = error.localizedDescription
            case .none:
                self.profileLabel.text = "Profile unavailable"
            }

            switch mailResult {
            case .success(let cfg):
                self.emailField.text = cfg.email
                self.usernameField.text = cfg.username
                self.imapHostField.text = cfg.imap_host
                self.imapPortField.text = "\(cfg.imap_port > 0 ? cfg.imap_port : 993)"
                self.smtpHostField.text = cfg.smtp_host
                self.smtpPortField.text = "\(cfg.smtp_port > 0 ? cfg.smtp_port : 587)"
                self.imapSSL.isOn = cfg.imap_use_ssl
                self.smtpTLS.isOn = cfg.smtp_use_tls
                self.smtpSSL.isOn = cfg.smtp_use_ssl
                self.passwordField.placeholder = cfg.has_password ? "Password set (leave empty to keep)" : "Password"
                self.statusLabel.text = ""
            case .failure(let error):
                self.statusLabel.text = error.localizedDescription
            case .none:
                self.statusLabel.text = "Mail settings unavailable"
            }
        }
    }

    @objc private func testMailTapped() {
        guard let token = AuthStore.shared.accessToken else { return }
        statusLabel.text = "Testing mail connection..."
        APIClient.shared.testMailConfig(accessToken: token) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let msg): self.statusLabel.text = msg
                case .failure(let error): self.statusLabel.text = error.localizedDescription
                }
            }
        }
    }

    @objc private func saveMailTapped() {
        guard let token = AuthStore.shared.accessToken else { return }
        let imapHost = imapHostField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if imapHost.isEmpty {
            statusLabel.text = "IMAP host is required"
            return
        }

        let payload: [String: Any] = [
            "email": emailField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            "username": usernameField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            "password": passwordField.text ?? "",
            "imap_host": imapHost,
            "imap_port": Int(imapPortField.text ?? "") ?? 993,
            "imap_use_ssl": imapSSL.isOn,
            "smtp_host": smtpHostField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            "smtp_port": Int(smtpPortField.text ?? "") ?? 587,
            "smtp_use_tls": smtpTLS.isOn,
            "smtp_use_ssl": smtpSSL.isOn,
        ]

        statusLabel.text = "Saving..."
        APIClient.shared.saveMailConfig(accessToken: token, payload: payload) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let msg):
                    self.passwordField.text = ""
                    self.statusLabel.text = msg
                case .failure(let error):
                    self.statusLabel.text = error.localizedDescription
                }
            }
        }
    }

    @objc private func logoutTapped() {
        AuthStore.shared.accessToken = nil
        onLogout?()
    }
}

private final class NativeTabBarController: UITabBarController {
    var onLogout: (() -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()

        let dashboardVC = DashboardViewController()
        dashboardVC.onOpenTab = { [weak self] idx in self?.selectedIndex = idx }
        let dashboard = UINavigationController(rootViewController: dashboardVC)
        dashboard.tabBarItem = UITabBarItem(title: "Dashboard", image: UIImage(systemName: "rectangle.grid.2x2"), tag: 0)

        let files = UINavigationController(rootViewController: FilesViewController())
        files.tabBarItem = UITabBarItem(title: "Files", image: UIImage(systemName: "folder"), tag: 1)

        let mailVC = MailViewController()
        mailVC.onOpenSettings = { [weak self] in self?.selectedIndex = 3 }
        let mail = UINavigationController(rootViewController: mailVC)
        mail.tabBarItem = UITabBarItem(title: "Mail", image: UIImage(systemName: "envelope"), tag: 2)

        let settingsVC = SettingsViewController()
        settingsVC.onLogout = { [weak self] in self?.onLogout?() }
        let settings = UINavigationController(rootViewController: settingsVC)
        settings.tabBarItem = UITabBarItem(title: "Settings", image: UIImage(systemName: "gearshape"), tag: 3)

        viewControllers = [dashboard, files, mail, settings]
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        self.window = window
        showInitialUI()
        window.makeKeyAndVisible()
    }

    private func showInitialUI() {
        if AuthStore.shared.accessToken == nil {
            showLogin()
        } else {
            showMainApp()
        }
    }

    private func showLogin() {
        let loginVC = LoginViewController()
        loginVC.onLoggedIn = { [weak self] in
            self?.showMainApp()
        }
        let nav = UINavigationController(rootViewController: loginVC)
        window?.rootViewController = nav
    }

    private func showMainApp() {
        let tab = NativeTabBarController()
        tab.onLogout = { [weak self] in
            self?.showLogin()
        }
        window?.rootViewController = tab
    }
}
