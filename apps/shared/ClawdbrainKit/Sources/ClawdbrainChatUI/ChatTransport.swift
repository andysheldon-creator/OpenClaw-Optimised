import Foundation

public enum ClawdbrainChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(ClawdbrainChatEventPayload)
    case agent(ClawdbrainAgentEventPayload)
    case seqGap
}

public protocol ClawdbrainChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> ClawdbrainChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [ClawdbrainChatAttachmentPayload]) async throws -> ClawdbrainChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> ClawdbrainChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<ClawdbrainChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension ClawdbrainChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "ClawdbrainChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> ClawdbrainChatSessionsListResponse {
        throw NSError(
            domain: "ClawdbrainChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
