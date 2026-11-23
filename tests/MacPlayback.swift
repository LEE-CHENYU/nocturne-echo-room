import AppKit
import WebKit

/// Run against a built .app, using the same WebKit configuration and asset handler.
@main
struct MacPlayback {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        Task { @MainActor in
            do {
                let bundle = URL(fileURLWithPath: CommandLine.arguments[1])
                let site = bundle.appendingPathComponent("Contents/Resources/Web")
                let library = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                try FileManager.default.createDirectory(at: library, withIntermediateDirectories: true)
                defer { try? FileManager.default.removeItem(at: library) }
                try FileManager.default.copyItem(at: site.appendingPathComponent("skaters_sousa_1912.mp3"),
                                                 to: library.appendingPathComponent("My test track.mp3"))
                let web = try HallContent(webDirectory: site, musicDirectory: library).makeWebView()
                let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
                                      styleMask: [.borderless], backing: .buffered, defer: false)
                window.contentView = web
                window.orderBack(nil)
                web.load(URLRequest(url: URL(string: "nocturne://hall/index.html#room=petal")!))
                for _ in 0..<200 {
                    if (try? await web.evaluateJavaScript("document.querySelector('#play')?.disabled === false")) as? Bool == true { break }
                    try await Task.sleep(nanoseconds: 50_000_000)
                }
                let result = try await web.callAsyncJavaScript("""
                    async function waitFor(check) {
                      for (let i=0; i<400; i++) {
                        if (check()) return;
                        await new Promise(resolve => setTimeout(resolve, 50));
                      }
                      throw Error('Timed out: ' + check);
                    }
                    if (!document.querySelector('#library0')) throw Error('Missing local track');
                    const rooms = [];
                    for (const name of ['ribbon','petal','fan','lantern']) {
                      $('roomSel').value = name;
                      $('roomSel').dispatchEvent(new Event('change'));
                      await waitFor(() => S.preset === name && IRSTATS.ac.V === ROOM.vol);
                      rooms.push(name + ' ' + acoustics().rt.toFixed(2) + ' s');
                    }
                    const tracks = [];
                    for (const radio of document.querySelectorAll('input[name=piece]:not(:disabled)')) {
                      radio.click();
                      $('play').click();
                      await waitFor(() => playing && ctx.state === 'running' && rmsDb(anWet) > -65);
                      tracks.push(radio.value);
                      $('play').click();
                    }
                    $('dopplerOn').click();
                    $('passShape').value = 'oval';
                    $('passShape').dispatchEvent(new Event('change'));
                    if (listenerPass?.shape !== 'oval') throw Error('Doppler path unavailable');
                    $('dopplerOn').click();
                    return { rooms, tracks };
                    """, arguments: [:], in: nil, contentWorld: .page)
                print(result ?? "")
                window.orderOut(nil)
                exit(EXIT_SUCCESS)
            } catch {
                fputs("Mac playback check failed: \(error)\n", stderr)
                exit(EXIT_FAILURE)
            }
        }
        app.run()
    }
}
