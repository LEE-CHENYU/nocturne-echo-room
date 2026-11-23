import Foundation
import WebKit

/// Serves only known bundle assets and audio in the user's Echo Room music folder.
final class HallContent: NSObject, WKURLSchemeHandler {
    static let scheme = "nocturne"
    static let host = "hall"
    static let audioTypes = [
        "mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4",
        "aac": "audio/aac", "flac": "audio/flac", "wav": "audio/wav",
        "aif": "audio/aiff", "aiff": "audio/aiff", "ogg": "audio/ogg",
        "opus": "audio/ogg", "webm": "audio/webm"
    ]

    struct Track: Encodable {
        let title: String
        let url: String
    }

    private var files: [String: URL] = [:]
    private var tracks: [Track] = []

    init(webDirectory: URL, musicDirectory: URL?) throws {
        let manager = FileManager.default
        let index = webDirectory.appendingPathComponent("index.html")
        guard manager.isReadableFile(atPath: index.path) else { throw CocoaError(.fileReadNoSuchFile) }
        files["/index.html"] = index
        func audioFiles(in directory: URL) throws -> [URL] {
            try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey],
                                            options: [.skipsHiddenFiles]).filter {
                Self.audioTypes[$0.pathExtension.lowercased()] != nil &&
                (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
            }
        }
        for url in try audioFiles(in: webDirectory) {
            files["/" + url.lastPathComponent] = url
        }
        if let directory = musicDirectory, let library = try? audioFiles(in: directory) {
            for url in library.sorted(by: { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }) {
                let route = "/music/\(tracks.count)"
                files[route] = url
                tracks.append(Track(title: url.deletingPathExtension().lastPathComponent, url: route))
            }
        }
        super.init()
    }

    @MainActor func makeWebView() throws -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self, forURLScheme: Self.scheme)
        config.mediaTypesRequiringUserActionForPlayback = []
        let json = String(decoding: try JSONEncoder().encode(tracks), as: UTF8.self)
        config.userContentController.addUserScript(WKUserScript(
            source: "window.nocturneTracks = \(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        return WKWebView(frame: .zero, configuration: config)
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == Self.host, let file = files[url.path] else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        do {
            let data = try Data(contentsOf: file, options: .mappedIfSafe)
            let mime = Self.audioTypes[file.pathExtension.lowercased()] ?? "text/html; charset=utf-8"
            let headers = ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*"]
            guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
                throw URLError(.badServerResponse)
            }
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            task.didFailWithError(error)
        }
    }

    // Local mapped reads finish synchronously in start.
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
