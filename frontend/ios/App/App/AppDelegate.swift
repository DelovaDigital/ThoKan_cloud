import UIKit
import Capacitor

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
}

private struct FileItem: Decodable {
    let id: String
    let name: String
    let size_bytes: Int
    let mime_type: String
    let created_at: String
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

private enum APIError: Error {
    case invalidURL
    case invalidResponse
    case server(String)
}

private final class APIClient {
    static let shared = APIClient()

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
                if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let detail = payload["detail"] as? String {
                    completion(.failure(APIError.server(detail)))
                } else {
                    completion(.failure(APIError.server("Login failed")))
                }
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
                completion(.failure(APIError.server("Dashboard load failed")))
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
                completion(.failure(APIError.server("Files load failed")))
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
                completion(.failure(APIError.server("Mail load failed")))
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
    private let refreshButton = UIButton(type: .system)
    private let statusLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Dashboard"

        usedLabel.font = .boldSystemFont(ofSize: 24)
        usedLabel.text = "Storage: --"

        filesLabel.font = .systemFont(ofSize: 20)
        filesLabel.text = "Files: --"

        refreshButton.setTitle("Refresh", for: .normal)
        refreshButton.backgroundColor = .systemBlue
        refreshButton.setTitleColor(.white, for: .normal)
        refreshButton.layer.cornerRadius = 10
        refreshButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        refreshButton.addTarget(self, action: #selector(loadData), for: .touchUpInside)

        statusLabel.font = .systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [usedLabel, filesLabel, refreshButton, statusLabel])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor)
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
                    self.usedLabel.text = "Storage: \(dashboard.used_bytes) bytes"
                    self.filesLabel.text = "Files: \(dashboard.files_count)"
                    self.statusLabel.text = ""
                case .failure(let error):
                    self.statusLabel.text = error.localizedDescription
                }
            }
        }
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

private final class FilesViewController: UIViewController, UITableViewDataSource {
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private var files: [FileItem] = []
    private let emptyLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Files"

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "FileCell")

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(loadFiles), for: .valueChanged)
        tableView.refreshControl = refresh

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

        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Refresh", style: .plain, target: self, action: #selector(loadFiles))
        loadFiles()
    }

    @objc private func loadFiles() {
        guard let token = AuthStore.shared.accessToken else {
            emptyLabel.text = "Niet ingelogd"
            emptyLabel.isHidden = false
            tableView.refreshControl?.endRefreshing()
            return
        }

        APIClient.shared.fetchFiles(accessToken: token) { result in
            DispatchQueue.main.async {
                self.tableView.refreshControl?.endRefreshing()
                switch result {
                case .success(let files):
                    self.files = files
                    self.emptyLabel.isHidden = !files.isEmpty
                    self.tableView.reloadData()
                case .failure(let error):
                    self.files = []
                    self.emptyLabel.text = error.localizedDescription
                    self.emptyLabel.isHidden = false
                    self.tableView.reloadData()
                }
            }
        }
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        files.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "FileCell")
        let file = files[indexPath.row]

        cell.textLabel?.text = file.name
        cell.detailTextLabel?.text = "\(formatBytes(file.size_bytes)) • \(file.mime_type)"
        cell.detailTextLabel?.textColor = .secondaryLabel
        cell.detailTextLabel?.numberOfLines = 1
        cell.selectionStyle = .none

        return cell
    }
}

private final class MailViewController: UIViewController, UITableViewDataSource {
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private var messages: [MailMessageItem] = []
    private let emptyLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Mail"

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
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

        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Refresh", style: .plain, target: self, action: #selector(loadInbox))
        loadInbox()
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
}

private final class SettingsViewController: UIViewController {
    var onLogout: (() -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Settings"

        let button = UIButton(type: .system)
        button.setTitle("Log out", for: .normal)
        button.backgroundColor = .systemRed
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 10
        button.contentEdgeInsets = UIEdgeInsets(top: 12, left: 18, bottom: 12, right: 18)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(logoutTapped), for: .touchUpInside)

        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            button.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
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

        let dashboard = UINavigationController(rootViewController: DashboardViewController())
        dashboard.tabBarItem = UITabBarItem(title: "Dashboard", image: UIImage(systemName: "rectangle.grid.2x2"), tag: 0)

        let files = UINavigationController(rootViewController: FilesViewController())
        files.tabBarItem = UITabBarItem(title: "Files", image: UIImage(systemName: "folder"), tag: 1)

        let mail = UINavigationController(rootViewController: MailViewController())
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

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if window == nil {
            window = UIWindow(frame: UIScreen.main.bounds)
        }

        showInitialUI()
        window?.makeKeyAndVisible()

        return true
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
