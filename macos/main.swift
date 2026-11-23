import AppKit
import UniformTypeIdentifiers
import WebKit

@MainActor
final class HallApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate {
    let appName = "Nocturne Echo Room"
    let musicDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Nocturne Echo Room/Tracks", isDirectory: true)
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenus()
        do {
            guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileReadNoSuchFile) }
            let content = try HallContent(webDirectory: resources.appendingPathComponent("Web"), musicDirectory: musicDirectory)
            web = try content.makeWebView()
        } catch {
            NSApp.presentError(error)
            NSApp.terminate(nil)
            return
        }
        web.uiDelegate = self
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1220, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = appName
        window.contentMinSize = NSSize(width: 420, height: 420)
        window.collectionBehavior = [.fullScreenPrimary]
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("NocturneMainWindow")
        window.makeKeyAndOrderFront(nil)

        var page = URLComponents()
        page.scheme = HallContent.scheme
        page.host = HallContent.host
        page.path = "/index.html"
        page.percentEncodedFragment = UserDefaults.standard.string(forKey: "roomDesign") ?? "room=petal"
        if let url = page.url { web.load(URLRequest(url: url)) }
        NSApp.activate(ignoringOtherApps: true)
    }

    private func installMenus() {
        let bar = NSMenu()
        func menu(_ name: String) -> NSMenu {
            let item = NSMenuItem()
            bar.addItem(item)
            let sub = NSMenu(title: name)
            item.submenu = sub
            return sub
        }
        let app = menu(appName)
        app.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = menu("File")
        file.addItem(withTitle: "Open Audio File…", action: #selector(openTrack), keyEquivalent: "o").target = self
        file.addItem(withTitle: "Show Music Folder", action: #selector(showMusicFolder), keyEquivalent: "").target = self
        file.addItem(.separator())
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let edit = menu("Edit")
        for (title, action, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
                                     ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let windows = menu("Window")
        windows.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windows.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windows
        NSApp.mainMenu = bar
    }

    @objc func openTrack() { web?.evaluateJavaScript("document.getElementById('file').click()") }

    @objc func showMusicFolder() {
        do {
            try FileManager.default.createDirectory(at: musicDirectory, withIntermediateDirectories: true)
            NSWorkspace.shared.open(musicDirectory)
        } catch { NSApp.presentError(error) }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.audio] + HallContent.audioTypes.keys.compactMap { UTType(filenameExtension: $0) }
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == HallContent.scheme && url.host == HallContent.host {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") {
                NSWorkspace.shared.open(url)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        if let url = web?.url, let fragment = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedFragment {
            UserDefaults.standard.set(fragment, forKey: "roomDesign")
        }
    }
}

@main
struct NocturneEchoRoom {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = HallApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}
