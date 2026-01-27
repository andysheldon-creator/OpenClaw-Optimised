import Foundation

public enum ClawdbrainCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum ClawdbrainCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum ClawdbrainCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum ClawdbrainCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct ClawdbrainCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: ClawdbrainCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: ClawdbrainCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: ClawdbrainCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: ClawdbrainCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct ClawdbrainCameraClipParams: Codable, Sendable, Equatable {
    public var facing: ClawdbrainCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: ClawdbrainCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: ClawdbrainCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: ClawdbrainCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
