import Foundation

final class NotificationStreamClient: NSObject {
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var buffer = ""
    private let decoder = JSONDecoder()

    var onNotification: ((APIClient.NotificationDTO) -> Void)?
    var onError: ((Error) -> Void)?

    func connect(token: String, baseURL: URL = APIConfig.activeBaseURL) {
        disconnect()

        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/stream"))
        request.httpMethod = "GET"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 60 * 60
        configuration.timeoutIntervalForResource = 60 * 60
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session

        let task = session.dataTask(with: request)
        self.task = task
        task.resume()
    }

    func disconnect() {
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        buffer = ""
    }

    private func handleEventPayload(_ payload: String) {
        guard !payload.isEmpty, payload != "{}" else { return }
        guard let data = payload.data(using: .utf8) else { return }
        do {
            let notification = try decoder.decode(APIClient.NotificationDTO.self, from: data)
            onNotification?(notification)
        } catch {
            onError?(error)
        }
    }

    private func processBuffer() {
        while let range = buffer.range(of: "\n\n") {
            let rawEvent = String(buffer[..<range.lowerBound])
            buffer.removeSubrange(buffer.startIndex..<range.upperBound)

            var dataLines: [String] = []
            for line in rawEvent.split(separator: "\n") {
                if line.hasPrefix("data:") {
                    let value = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                    dataLines.append(value)
                }
            }
            handleEventPayload(dataLines.joined(separator: "\n"))
        }
    }
}

extension NotificationStreamClient: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let chunk = String(data: data, encoding: .utf8) else { return }
        buffer.append(chunk)
        processBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            onError?(error)
        }
    }
}
