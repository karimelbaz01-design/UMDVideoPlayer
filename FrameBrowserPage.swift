import SwiftUI
import WebKit
import UIKit

@MainActor
private final class FrameBrowserModel: ObservableObject {
    @Published var address = ""
    @Published private(set) var pageTitle = "Browser"
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published var errorMessage: String?

    weak var webView: WKWebView?
    private var didLoadHome = false

    func attach(_ view: WKWebView) {
        webView = view
        if !didLoadHome {
            didLoadHome = true
            load("https://www.google.com")
        }
        refreshState()
    }

    func navigateFromAddressBar() {
        let input = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        let target: URL?
        if input.contains(" ") || (!input.contains(".") && !input.lowercased().hasPrefix("http")) {
            var components = URLComponents(string: "https://www.google.com/search")
            components?.queryItems = [URLQueryItem(name: "q", value: input)]
            target = components?.url
        } else {
            let candidate = input.contains("://") ? input : "https://" + input
            target = URL(string: candidate)
        }

        guard let url = target,
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil else {
            errorMessage = "Inserisci un indirizzo web valido o una ricerca."
            return
        }
        load(url.absoluteString)
    }

    func load(_ value: String) {
        guard let url = URL(string: value),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil else { return }
        address = url.absoluteString
        webView?.load(URLRequest(url: url))
    }

    func goBack() {
        if webView?.canGoBack == true { webView?.goBack() }
    }

    func goForward() {
        if webView?.canGoForward == true { webView?.goForward() }
    }

    func reload() {
        webView?.reload()
    }

    func refreshState() {
        guard let webView else { return }
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        if let url = webView.url { address = url.absoluteString }
        pageTitle = webView.title?.isEmpty == false ? (webView.title ?? "Browser") : "Browser"
    }

    func performControllerAction(_ action: String) {
        guard let webView else { return }
        switch action {
        case "back":
            goBack()
        case "forward":
            goForward()
        case "up", "down", "left", "right":
            let script = "window.__frameMoveFocus && window.__frameMoveFocus('\(action)');"
            webView.evaluateJavaScript(script, completionHandler: nil)
        case "select":
            webView.evaluateJavaScript("window.__frameActivate && window.__frameActivate();", completionHandler: nil)
        default:
            break
        }
    }
}

struct FrameBrowserPage: View {
    @StateObject private var model = FrameBrowserModel()
    @FocusState private var addressIsFocused: Bool

    private let ink = Color(red: 0.035, green: 0.045, blue: 0.065)
    private let panel = Color(red: 0.085, green: 0.10, blue: 0.135)
    private let coral = Color(red: 1.0, green: 0.36, blue: 0.29)

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 11) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("FRAME WEB")
                            .font(.system(size: 21, weight: .black, design: .rounded))
                            .tracking(2)
                        Text("INTERNET, STREAMING E IPTV")
                            .font(.system(size: 8, weight: .bold, design: .rounded))
                            .tracking(1.5)
                            .foregroundStyle(.white.opacity(0.45))
                    }
                    Spacer()
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(coral)
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.white.opacity(0.45))
                    TextField("Cerca o inserisci un indirizzo", text: $model.address)
                        .font(.system(size: 13))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($addressIsFocused)
                        .submitLabel(.go)
                        .onSubmit {
                            addressIsFocused = false
                            model.navigateFromAddressBar()
                        }
                    Button {
                        addressIsFocused = false
                        model.navigateFromAddressBar()
                    } label: {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(coral)
                    }
                }
                .padding(.horizontal, 13)
                .padding(.vertical, 12)
                .background(panel, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(.horizontal, 17)
            .padding(.top, 8)
            .padding(.bottom, 10)

            // The page is hosted inside the app's outer ScrollView; give WKWebView
            // a real viewport so it does not collapse to an ambiguous height.
            BrowserWebView(model: model)
                .frame(height: 470)
                .background(.white)

            HStack(spacing: 0) {
                browserButton("chevron.left", enabled: model.canGoBack) { model.goBack() }
                browserButton("chevron.right", enabled: model.canGoForward) { model.goForward() }
                browserButton("arrow.clockwise", enabled: true) { model.reload() }
                browserButton("house.fill", enabled: true) { model.load("https://www.google.com") }
                browserButton("keyboard", enabled: true) { addressIsFocused = true }
            }
            .padding(.vertical, 9)
            .background(ink)
        }
        .background(ink)
        .alert("Browser", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .onReceive(NotificationCenter.default.publisher(for: .frameBrowserControllerAction)) { notification in
            if let action = notification.object as? String {
                model.performControllerAction(action)
            }
        }
    }

    private func browserButton(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(enabled ? .white : .white.opacity(0.22))
                .frame(maxWidth: .infinity)
                .frame(height: 35)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

private struct BrowserWebView: UIViewRepresentable {
    @ObservedObject var model: FrameBrowserModel

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = .all

        let script = WKUserScript(
            source: Self.controllerNavigationScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(script)

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.isOpaque = false
        view.backgroundColor = UIColor.white
        model.attach(view)
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let model: FrameBrowserModel

        init(model: FrameBrowserModel) {
            self.model = model
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.refreshState()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.refreshState()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.refreshState()
            model.errorMessage = error.localizedDescription
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.refreshState()
            model.errorMessage = error.localizedDescription
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let scheme = navigationAction.request.url?.scheme?.lowercased() else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(["http", "https", "about", "blob", "data"].contains(scheme) ? .allow : .cancel)
        }
    }

    private static let controllerNavigationScript = """
    (() => {
      if (window.__frameBrowserControlsInstalled) return;
      window.__frameBrowserControlsInstalled = true;
      let current = null;

      const candidates = () => Array.from(document.querySelectorAll(
        'a[href],button,input:not([type="hidden"]),select,textarea,video[controls],[role="button"],[tabindex]:not([tabindex="-1"])'
      )).filter(el => {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled;
      });

      const center = el => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };

      const focus = el => {
        if (!el) return;
        current = el;
        el.setAttribute('data-frame-focused', 'true');
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      };

      const clearFocus = () => {
        document.querySelectorAll('[data-frame-focused="true"]').forEach(el => el.removeAttribute('data-frame-focused'));
      };

      const style = document.createElement('style');
      style.textContent = '[data-frame-focused="true"]{outline:3px solid #ff5c4a!important;outline-offset:3px!important;border-radius:4px!important}';
      (document.head || document.documentElement).appendChild(style);

      window.__frameMoveFocus = direction => {
        const items = candidates();
        if (!items.length) {
          if (direction === 'up') window.scrollBy({top:-Math.max(180, window.innerHeight * .55), behavior:'smooth'});
          if (direction === 'down') window.scrollBy({top:Math.max(180, window.innerHeight * .55), behavior:'smooth'});
          return;
        }
        if (!current || !items.includes(current)) {
          clearFocus();
          focus(items[0]);
          return;
        }
        const from = center(current);
        const options = items.filter(el => el !== current).map(el => {
          const p = center(el), dx = p.x - from.x, dy = p.y - from.y;
          const primary = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
          const secondary = direction === 'right' || direction === 'left' ? Math.abs(dy) : Math.abs(dx);
          return {el, primary, score: primary + secondary * 1.8};
        }).filter(x => x.primary > 2).sort((a,b) => a.score - b.score);
        if (options.length) {
          clearFocus();
          focus(options[0].el);
        } else if (direction === 'up' || direction === 'down') {
          window.scrollBy({top: direction === 'up' ? -Math.max(180, window.innerHeight * .55) : Math.max(180, window.innerHeight * .55), behavior:'smooth'});
        }
      };

      window.__frameActivate = () => {
        if (current && document.contains(current)) {
          current.click();
        } else {
          const first = candidates()[0];
          if (first) { clearFocus(); focus(first); }
        }
      };
    })();
    """
}
