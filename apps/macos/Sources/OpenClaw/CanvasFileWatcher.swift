import CoreServices
import Foundation

final class CanvasFileWatcher: @unchecked Sendable {
    private let url: URL
    private let queue: DispatchQueue
    private var stream: FSEventStreamRef?
    private var pending = false
    private let onChange: () -> Void

    init(url: URL, onChange: @escaping () -> Void) {
        self.url = url
        self.queue = DispatchQueue(label: "ai.openclaw.canvaswatcher")
        self.onChange = onChange
    }

    deinit {
        self.stop()
    }

    func start() {
        guard self.stream == nil else { return }

        let retainedSelf = Unmanaged.passRetained(self)
        var context = FSEventStreamContext(
            version: 0,
            info: retainedSelf.toOpaque(),
            retain: nil,
            release: { pointer in
                guard let pointer = pointer else { return }
                Unmanaged<CanvasFileWatcher>.fromOpaque(pointer).release()
            },
            copyDescription: nil)

        let paths = [self.url.path] as CFArray
        let flags = FSEventStreamCreateFlags(
            kFSEventStreamCreateFlagFileEvents |
                kFSEventStreamCreateFlagUseCFTypes |
                kFSEventStreamCreateFlagNoDefer)

        guard let stream = FSEventStreamCreate(
            kCFAllocatorDefault,
            Self.callback,
            &context,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            0.05,
            flags)
        else {
            retainedSelf.release()
            return
        }

        self.stream = stream
        FSEventStreamSetDispatchQueue(stream, self.queue)
        if FSEventStreamStart(stream) == false {
            FSEventStreamSetDispatchQueue(stream, nil)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
    }

    func stop() {
        guard let stream = self.stream else { return }
        self.stream = nil
        FSEventStreamStop(stream)
        FSEventStreamSetDispatchQueue(stream, nil)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
    }

    private static func callback(
        streamRef: ConstFSEventStreamRef,
        clientCallBackInfo: UnsafeMutableRawPointer?,
        numEvents: Int,
        eventPaths: UnsafeMutableRawPointer,
        eventFlags: UnsafePointer<FSEventStreamEventFlags>,
        eventIds: UnsafePointer<FSEventStreamEventId>
    ) {
        guard let watcher = clientCallBackInfo.map({ Unmanaged<CanvasFileWatcher>.fromOpaque($0).takeUnretainedValue() }) else { return }
        let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as NSArray as! [String]
        var events = [String: FSEventStreamEventFlags]()

        for index in 0..<numEvents {
            events[paths[index]] = eventFlags[index]
        }

        watcher.onChange()
    }
}