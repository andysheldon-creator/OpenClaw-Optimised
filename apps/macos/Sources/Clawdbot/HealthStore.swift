import Foundation
import Network
import Observation
import SwiftUI

struct HealthSnapshot: Codable, Sendable {
<<<<<<< HEAD
    struct Telegram: Codable, Sendable {
=======
    struct ChannelSummary: Codable, Sendable {
>>>>>>> upstream/main
        struct Probe: Codable, Sendable {
            struct Bot: Codable, Sendable {
                let id: Int?
                let username: String?
            }

            let ok: Bool
            let status: Int?
            let error: String?
            let elapsedMs: Double?
            let bot: Bot?
        }

        let configured: Bool
        let probe: Probe?
    }

    struct Web: Codable, Sendable {
        struct Connect: Codable, Sendable {
            let ok: Bool
            let status: Int?
            let error: String?
            let elapsedMs: Double?
        }

        let linked: Bool
        let authAgeMs: Double?
        let connect: Connect?
    }

    struct SessionInfo: Codable, Sendable {
        let key: String
        let updatedAt: Double?
        let age: Double?
    }

    struct Sessions: Codable, Sendable {
        let path: String
        let count: Int
        let recent: [SessionInfo]
    }

    let ok: Bool?
    let ts: Double
    let durationMs: Double
<<<<<<< HEAD
    let web: Web
    let telegram: Telegram?
=======
    let channels: [String: ChannelSummary]
    let channelOrder: [String]?
    let channelLabels: [String: String]?
>>>>>>> upstream/main
    let heartbeatSeconds: Int?
    let sessions: Sessions
}

enum HealthState: Equatable {
    case unknown
    case ok
    case linkingNeeded
    case degraded(String)

    var tint: Color {
        switch self {
        case .ok: .green
        case .linkingNeeded: .red
        case .degraded: .orange
        case .unknown: .secondary
        }
    }
}

@MainActor
@Observable
final class HealthStore {
    static let shared = HealthStore()

    private static let logger = Logger(subsystem: "com.clawdbot", category: "health")

    private(set) var snapshot: HealthSnapshot?
    private(set) var lastSuccess: Date?
    private(set) var lastError: String?
    private(set) var isRefreshing = false

    private var loopTask: Task<Void, Never>?
    private let refreshInterval: TimeInterval = 60

    private init() {
        // Avoid background health polling in SwiftUI previews and tests.
        if !ProcessInfo.processInfo.isPreview, !ProcessInfo.processInfo.isRunningTests {
            self.start()
        }
    }

    func start() {
        guard self.loopTask == nil else { return }
        self.loopTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.refresh()
                try? await Task.sleep(nanoseconds: UInt64(self.refreshInterval * 1_000_000_000))
            }
        }
    }

    func stop() {
        self.loopTask?.cancel()
        self.loopTask = nil
    }

    func refresh(onDemand: Bool = false) async {
        guard !self.isRefreshing else { return }
        self.isRefreshing = true
        defer { self.isRefreshing = false }
        let previousError = self.lastError

        do {
            let data = try await ControlChannel.shared.health(timeout: 15)
            if let decoded = decodeHealthSnapshot(from: data) {
                self.snapshot = decoded
                self.lastSuccess = Date()
                self.lastError = nil
                if previousError != nil {
                    Self.logger.info("health refresh recovered")
                }
            } else {
                self.lastError = "health output not JSON"
                if onDemand { self.snapshot = nil }
                if previousError != self.lastError {
                    Self.logger.warning("health refresh failed: output not JSON")
                }
            }
        } catch {
            let desc = error.localizedDescription
            self.lastError = desc
            if onDemand { self.snapshot = nil }
            if previousError != desc {
                Self.logger.error("health refresh failed \(desc, privacy: .public)")
            }
        }
    }

<<<<<<< HEAD
    private static func isTelegramHealthy(_ snap: HealthSnapshot) -> Bool {
        guard let tg = snap.telegram, tg.configured else { return false }
        // If probe is missing, treat it as "configured but unknown health" (not a hard fail).
        return tg.probe?.ok ?? true
=======
    private static func isChannelHealthy(_ summary: HealthSnapshot.ChannelSummary) -> Bool {
        guard summary.configured == true else { return false }
        // If probe is missing, treat it as "configured but unknown health" (not a hard fail).
        return summary.probe?.ok ?? true
    }

    private static func describeProbeFailure(_ probe: HealthSnapshot.ChannelSummary.Probe) -> String {
        let elapsed = probe.elapsedMs.map { "\(Int($0))ms" }
        if let error = probe.error, error.lowercased().contains("timeout") || probe.status == nil {
            if let elapsed { return "Health check timed out (\(elapsed))" }
            return "Health check timed out"
        }
        let code = probe.status.map { "status \($0)" } ?? "status unknown"
        let reason = probe.error?.isEmpty == false ? probe.error! : "health probe failed"
        if let elapsed { return "\(reason) (\(code), \(elapsed))" }
        return "\(reason) (\(code))"
    }

    private func resolveLinkChannel(
        _ snap: HealthSnapshot) -> (id: String, summary: HealthSnapshot.ChannelSummary)?
    {
        let order = snap.channelOrder ?? Array(snap.channels.keys)
        for id in order {
            if let summary = snap.channels[id], summary.linked != nil {
                return (id: id, summary: summary)
            }
        }
        return nil
    }

    private func resolveFallbackChannel(
        _ snap: HealthSnapshot,
        excluding id: String?) -> (id: String, summary: HealthSnapshot.ChannelSummary)?
    {
        let order = snap.channelOrder ?? Array(snap.channels.keys)
        for channelId in order {
            if channelId == id { continue }
            guard let summary = snap.channels[channelId] else { continue }
            if Self.isChannelHealthy(summary) {
                return (id: channelId, summary: summary)
            }
        }
        return nil
>>>>>>> upstream/main
    }

    var state: HealthState {
        if let error = self.lastError, !error.isEmpty {
            return .degraded(error)
        }
        guard let snap = self.snapshot else { return .unknown }
<<<<<<< HEAD
        if !snap.web.linked {
            // WhatsApp Web linking is optional if Telegram is healthy; don't paint the whole app red.
            return Self.isTelegramHealthy(snap) ? .degraded("Not linked") : .linkingNeeded
        }
        if let connect = snap.web.connect, !connect.ok {
            let reason = connect.error ?? "connect failed"
            return .degraded(reason)
=======
        guard let link = self.resolveLinkChannel(snap) else { return .unknown }
        if link.summary.linked != true {
            // Linking is optional if any other channel is healthy; don't paint the whole app red.
            let fallback = self.resolveFallbackChannel(snap, excluding: link.id)
            return fallback != nil ? .degraded("Not linked") : .linkingNeeded
        }
        // A channel can be "linked" but still unhealthy (failed probe / cannot connect).
        if let probe = link.summary.probe, probe.ok == false {
            return .degraded(Self.describeProbeFailure(probe))
>>>>>>> upstream/main
        }
        return .ok
    }

    var summaryLine: String {
        if self.isRefreshing { return "Health check running…" }
        if let error = self.lastError { return "Health check failed: \(error)" }
        guard let snap = self.snapshot else { return "Health check pending" }
<<<<<<< HEAD
        if !snap.web.linked {
            if let tg = snap.telegram, tg.configured {
                let tgLabel = (tg.probe?.ok ?? true) ? "Telegram ok" : "Telegram degraded"
                return "\(tgLabel) · Not linked — run clawdbot login"
=======
        guard let link = self.resolveLinkChannel(snap) else { return "Health check pending" }
        if link.summary.linked != true {
            if let fallback = self.resolveFallbackChannel(snap, excluding: link.id) {
                let fallbackLabel = snap.channelLabels?[fallback.id] ?? fallback.id.capitalized
                let fallbackState = (fallback.summary.probe?.ok ?? true) ? "ok" : "degraded"
                return "\(fallbackLabel) \(fallbackState) · Not linked — run clawdbot login"
>>>>>>> upstream/main
            }
            return "Not linked — run clawdbot login"
        }
        let auth = snap.web.authAgeMs.map { msToAge($0) } ?? "unknown"
        if let connect = snap.web.connect, !connect.ok {
            let code = connect.status.map(String.init) ?? "?"
            return "Link stale? status \(code)"
        }
        return "linked · auth \(auth) · socket ok"
    }

    /// Short, human-friendly detail for the last failure, used in the UI.
    var detailLine: String? {
        if let error = self.lastError, !error.isEmpty {
            let lower = error.lowercased()
            if lower.contains("connection refused") {
                let port = GatewayEnvironment.gatewayPort()
                return "The gateway control port (127.0.0.1:\(port)) isn’t listening — " +
                    "restart Clawdbot to bring it back."
            }
            if lower.contains("timeout") {
                return "Timed out waiting for the control server; the gateway may be crashed or still starting."
            }
            return error
        }
        return nil
    }

    func describeFailure(from snap: HealthSnapshot, fallback: String?) -> String {
<<<<<<< HEAD
        if !snap.web.linked {
            return "Not linked — run clawdbot login"
        }
        if let connect = snap.web.connect, !connect.ok {
            let elapsed = connect.elapsedMs.map { "\(Int($0))ms" } ?? "unknown duration"
            if let err = connect.error, err.lowercased().contains("timeout") || connect.status == nil {
                return "Health check timed out (\(elapsed))"
            }
            let code = connect.status.map { "status \($0)" } ?? "status unknown"
            let reason = connect.error ?? "connect failed"
            return "\(reason) (\(code), \(elapsed))"
=======
        if let link = self.resolveLinkChannel(snap), link.summary.linked != true {
            return "Not linked — run clawdbot login"
        }
        if let link = self.resolveLinkChannel(snap), let probe = link.summary.probe, probe.ok == false {
            return Self.describeProbeFailure(probe)
>>>>>>> upstream/main
        }
        if let fallback, !fallback.isEmpty {
            return fallback
        }
        return "health probe failed"
    }

    var degradedSummary: String? {
        guard case let .degraded(reason) = self.state else { return nil }
        if reason == "[object Object]" || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let snap = self.snapshot
        {
            return self.describeFailure(from: snap, fallback: reason)
        }
        return reason
    }
}

func msToAge(_ ms: Double) -> String {
    let minutes = Int(round(ms / 60000))
    if minutes < 1 { return "just now" }
    if minutes < 60 { return "\(minutes)m" }
    let hours = Int(round(Double(minutes) / 60))
    if hours < 48 { return "\(hours)h" }
    let days = Int(round(Double(hours) / 24))
    return "\(days)d"
}

/// Decode a health snapshot, tolerating stray log lines before/after the JSON blob.
func decodeHealthSnapshot(from data: Data) -> HealthSnapshot? {
    let decoder = JSONDecoder()
    if let snap = try? decoder.decode(HealthSnapshot.self, from: data) {
        return snap
    }
    guard let text = String(data: data, encoding: .utf8) else { return nil }
    guard let firstBrace = text.firstIndex(of: "{"), let lastBrace = text.lastIndex(of: "}") else {
        return nil
    }
    let slice = text[firstBrace...lastBrace]
    let cleaned = Data(slice.utf8)
    return try? decoder.decode(HealthSnapshot.self, from: cleaned)
}
