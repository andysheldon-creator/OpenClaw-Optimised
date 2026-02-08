import AVFoundation
import EventKit
import Foundation
import Observation
import OSLog
import Speech

@MainActor
@Observable
final class MeetingDetector {
    static let shared = MeetingDetector()

    private let logger = Logger(subsystem: "ai.openclaw", category: "meeting.detector")
    private let eventStore = EKEventStore()
    private let transcriber = MeetingTranscriber()
    let whisperTranscriber = WhisperTranscriber()
    private var activeEngine: TranscriptionEngine?

    private(set) var currentSession: MeetingSession?
    private(set) var upcomingMeetings: [EKEvent] = []
    private(set) var calendarAccessGranted = false

    var meetingDetectionEnabled: Bool = false {
        didSet { UserDefaults.standard.set(self.meetingDetectionEnabled, forKey: "meetingDetectionEnabled") }
    }

    var adHocDetectionEnabled: Bool = true {
        didSet { UserDefaults.standard.set(self.adHocDetectionEnabled, forKey: "meetingAdHocDetectionEnabled") }
    }

    var transcriptionEngine: TranscriptionEngine {
        get {
            TranscriptionEngine(rawValue: UserDefaults.standard.string(forKey: "meetingTranscriptionEngine") ?? "whisper") ?? .whisper
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "meetingTranscriptionEngine") }
    }

    var whisperModelState: WhisperModelState {
        self.whisperTranscriber.modelState
    }

    private var calendarCheckTask: Task<Void, Never>?
    private var silenceCheckTask: Task<Void, Never>?
    private var lastMicActivity: Date?
    private var micObserver: AudioInputDeviceObserver?
    private var talkModeWasPaused = false

    private init() {
        self.meetingDetectionEnabled = UserDefaults.standard.bool(forKey: "meetingDetectionEnabled")
        self.adHocDetectionEnabled = UserDefaults.standard.object(forKey: "meetingAdHocDetectionEnabled") as? Bool ?? true
    }

    // MARK: - Lifecycle

    func start() {
        guard self.meetingDetectionEnabled else { return }
        self.logger.info("meeting detector starting")
        self.startCalendarMonitor()
        self.startMicMonitor()
    }

    func stop() {
        self.logger.info("meeting detector stopping")
        self.calendarCheckTask?.cancel()
        self.calendarCheckTask = nil
        self.silenceCheckTask?.cancel()
        self.silenceCheckTask = nil
        self.micObserver?.stop()
        self.micObserver = nil
        if self.currentSession != nil {
            Task { await self.stopMeeting() }
        }
    }

    // MARK: - Calendar monitoring

    func requestCalendarAccess() async {
        do {
            let granted = try await self.eventStore.requestFullAccessToEvents()
            self.calendarAccessGranted = granted
            if granted {
                self.logger.info("calendar access granted")
                self.refreshUpcomingMeetings()
            } else {
                self.logger.warning("calendar access denied")
            }
        } catch {
            self.logger.error("calendar access request failed: \(error.localizedDescription, privacy: .public)")
            self.calendarAccessGranted = false
        }
    }

    private func startCalendarMonitor() {
        self.calendarCheckTask?.cancel()
        self.calendarCheckTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                await self.checkCalendar()
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30 seconds
            }
        }
    }

    private func checkCalendar() async {
        let status = EKEventStore.authorizationStatus(for: .event)
        self.calendarAccessGranted = status == .fullAccess
        guard self.calendarAccessGranted else { return }

        self.refreshUpcomingMeetings()

        // Check if any meeting is starting within 1 minute
        let now = Date()
        let oneMinute = now.addingTimeInterval(60)
        for event in self.upcomingMeetings {
            let hasMultipleAttendees = (event.attendees?.count ?? 0) >= 2
            guard hasMultipleAttendees else { continue }
            guard event.startDate <= oneMinute, event.startDate > now.addingTimeInterval(-60) else { continue }
            guard self.currentSession == nil else { continue }

            self.logger.info("upcoming meeting detected: \(event.title ?? "Untitled", privacy: .public)")
            _ = await NotificationManager().send(
                title: "Meeting Starting",
                body: "\(event.title ?? "Meeting") — tap to start transcribing",
                sound: nil,
                priority: .active)
        }
    }

    private func refreshUpcomingMeetings() {
        let now = Date()
        let endDate = now.addingTimeInterval(3600) // next hour
        let calendars = self.eventStore.calendars(for: .event)
        let predicate = self.eventStore.predicateForEvents(withStart: now, end: endDate, calendars: calendars)
        let events = self.eventStore.events(matching: predicate)
        self.upcomingMeetings = events
            .filter { ($0.attendees?.count ?? 0) >= 2 }
            .sorted { ($0.startDate ?? .distantPast) < ($1.startDate ?? .distantPast) }
    }

    // MARK: - Mic monitoring for ad-hoc calls

    private func startMicMonitor() {
        guard self.adHocDetectionEnabled else { return }
        let observer = AudioInputDeviceObserver()
        self.micObserver = observer
        observer.start { [weak self] in
            Task { @MainActor [weak self] in
                self?.handleMicChange()
            }
        }
    }

    private func handleMicChange() {
        // Mic device change can indicate a meeting app activated the mic
        guard self.adHocDetectionEnabled, self.currentSession == nil else { return }
        self.lastMicActivity = Date()
    }

    // MARK: - Meeting control

    func startMeeting(title: String? = nil, calendarEvent: EKEvent? = nil) async {
        guard self.currentSession == nil else {
            self.logger.warning("meeting already in progress")
            return
        }

        // Request permissions before starting
        let permsOk = await self.ensureTranscriptionPermissions()
        if !permsOk {
            self.logger.warning("meeting transcription permissions not granted")
        }

        let meetingTitle = title ?? calendarEvent?.title ?? "Meeting \(Self.shortTimestamp())"
        let attendees = calendarEvent?.attendees?.compactMap(\.url.absoluteString) ?? []

        let engine = self.transcriptionEngine
        self.activeEngine = engine

        // Only pause TalkMode for Apple Speech (it conflicts with SFSpeechRecognizer)
        if engine == .apple {
            self.talkModeWasPaused = TalkModeController.shared.isPaused
            if !self.talkModeWasPaused {
                self.logger.info("meeting: pausing talk mode to free speech recognizer")
                TalkModeController.shared.setPaused(true)
                await TalkModeRuntime.shared.setPaused(true)
            }
        }

        let session = MeetingSession(
            title: meetingTitle,
            calendarEventId: calendarEvent?.eventIdentifier,
            attendees: attendees)
        session.start()
        self.currentSession = session
        self.logger.info("meeting started: \(meetingTitle, privacy: .public) engine=\(engine.rawValue, privacy: .public)")

        // Start transcription with the selected engine
        let segmentHandler: @MainActor (Speaker, String, Bool) -> Void = { [weak session] speaker, text, isFinal in
            guard let session, session.status == .recording else { return }
            session.updateLastSegment(for: speaker, text: text, isFinal: isFinal)
        }

        switch engine {
        case .whisper:
            await self.whisperTranscriber.start(onSegment: segmentHandler)
        case .apple:
            await self.transcriber.start(onSegment: segmentHandler)
        }

        self.startSilenceDetection()
    }

    // MARK: - Permission requests

    private func ensureTranscriptionPermissions() async -> Bool {
        let micStatus = await Self.requestMicPermission()
        if !micStatus {
            self.logger.warning("microphone permission denied")
        }

        // Whisper doesn't need SFSpeechRecognizer permission
        if self.transcriptionEngine == .apple {
            let speechStatus = await Self.requestSpeechPermission()
            if !speechStatus {
                self.logger.warning("speech recognition permission denied")
            }
            return micStatus && speechStatus
        }

        return micStatus
    }

    /// Must be `nonisolated` so the completion handler doesn't inherit @MainActor isolation.
    private nonisolated static func requestMicPermission() async -> Bool {
        if #available(macOS 14, *) {
            return await AVAudioApplication.requestRecordPermission()
        } else {
            return await withCheckedContinuation { cont in
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    cont.resume(returning: granted)
                }
            }
        }
    }

    /// Must be `nonisolated` so the completion handler doesn't inherit @MainActor isolation.
    private nonisolated static func requestSpeechPermission() async -> Bool {
        await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
    }

    func stopMeeting() async {
        guard let session = self.currentSession else { return }
        session.stop()

        // Stop the active transcription engine
        switch self.activeEngine {
        case .whisper:
            await self.whisperTranscriber.stop()
        case .apple:
            await self.transcriber.stop()
        case nil:
            await self.transcriber.stop()
        }

        self.silenceCheckTask?.cancel()
        self.silenceCheckTask = nil

        MeetingStore.shared.save(session: session)
        self.logger.info(
            "meeting ended: \(session.title, privacy: .public) " +
                "segments=\(session.segments.filter(\.isFinal).count)")
        self.currentSession = nil

        // Resume TalkMode if it was paused for Apple Speech
        if self.activeEngine == .apple, !self.talkModeWasPaused {
            self.logger.info("meeting: resuming talk mode")
            TalkModeController.shared.setPaused(false)
            await TalkModeRuntime.shared.setPaused(false)
        }
        self.activeEngine = nil
    }

    // MARK: - Silence detection

    private func startSilenceDetection() {
        self.silenceCheckTask?.cancel()
        self.silenceCheckTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000) // check every 60s
                await self.checkForSilence()
            }
        }
    }

    private func checkForSilence() async {
        guard let session = self.currentSession, session.status == .recording else { return }
        // Auto-stop after 15 minutes of no new final segments
        let lastSegmentTime = session.segments.last(where: { $0.isFinal })?.timestamp ?? session.startedAt
        let silenceDuration = Date().timeIntervalSince(lastSegmentTime)
        if silenceDuration > 900 { // 15 minutes
            self.logger.info("meeting auto-ending due to 15 min silence")
            await self.stopMeeting()
        }
    }

    private static func shortTimestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date())
    }
}
