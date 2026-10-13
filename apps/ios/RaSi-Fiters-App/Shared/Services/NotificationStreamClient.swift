import Foundation

/// notifications §3.3 SSE client, opened with `?inbox=1` (contract C7.2). Frames: `event: ready` (opened) · `event: ping`
/// (25 s keepalive) · `event: notification` + a C3 inbox item (the 7 legacy fields + category, target, read_at — every
/// type). EVERY close or error is reported through `onClose` and the owner reconnects
/// (a plain close on deploy is not an error). Delegate callbacks run on the main queue; no resource cap (60 s idle
/// timeout > the 25 s ping, so a silent stream times out and reconnects). The session is invalidated on every close
/// (a URLSession retains its delegate until then).
final class NotificationStreamClient: NSObject {
    /// true while a stream is open (between `ready` and its close) — AppDelegate shows a foreground push as a badge
    /// only then, since the in-app modal already shows it (amendment A5).
    private(set) static var isConnected = false

    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var buffer = ""
    private var refusedStatus: Int?
    private var closed = false
    private var isReady = false
    private let decoder = JSONDecoder()

    var onReady: (() -> Void)?
    var onNotification: ((APIClient.NotificationDTO) -> Void)?
    /// The HTTP status when the open was refused (401 → refresh first), nil for a plain close / network error.
    var onClose: ((Int?) -> Void)?

    func connect(token: String, baseURL: URL = APIConfig.activeBaseURL) {
        disconnect()
        closed = false
        refusedStatus = nil
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/stream")
            .appending(queryItems: [URLQueryItem(name: "inbox", value: "1")]))
        request.httpMethod = "GET"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        APIClient.identityHeaders.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 60
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        self.session = session
        let task = session.dataTask(with: request)
        self.task = task
        task.resume()
    }

    /// Intentional close — never reported through `onClose`.
    func disconnect() {
        closed = true
        markClosed()
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        buffer = ""
    }

    private func markClosed() {
        guard isReady else { return }
        isReady = false
        Self.isConnected = false
    }

    private func dispatch(event: String?, data: String) {
        switch event {
        case "ready":
            isReady = true
            Self.isConnected = true
            onReady?()
        case "ping":
            return
        default:                                                    // "notification" (unnamed frames tolerated)
            guard !data.isEmpty, data != "{}", let bytes = data.data(using: .utf8),
                  let notification = try? decoder.decode(APIClient.NotificationDTO.self, from: bytes) else { return }
            onNotification?(notification)
        }
    }

    private func processBuffer() {
        while let range = buffer.range(of: "\n\n") {
            let rawEvent = String(buffer[..<range.lowerBound])
            buffer.removeSubrange(buffer.startIndex..<range.upperBound)
            var event: String?
            var dataLines: [String] = []
            for line in rawEvent.split(separator: "\n") {
                if line.hasPrefix("event:") {
                    event = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                } else if line.hasPrefix("data:") {
                    dataLines.append(line.dropFirst(5).trimmingCharacters(in: .whitespaces))
                }
            }
            dispatch(event: event, data: dataLines.joined(separator: "\n"))
        }
    }
}

extension NotificationStreamClient: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if dataTask === task, let http = response as? HTTPURLResponse, http.statusCode != 200 {
            refusedStatus = http.statusCode                          // 401 token / 503 auth_unavailable
            completionHandler(.cancel)
            return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard dataTask === task, let chunk = String(data: data, encoding: .utf8) else { return }
        buffer.append(chunk)
        processBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        session.finishTasksAndInvalidate()                          // releases the delegate (no leak per reconnect)
        guard task === self.task, !closed else { return }
        closed = true
        markClosed()
        self.task = nil
        self.session = nil
        onClose?(refusedStatus)
    }
}
