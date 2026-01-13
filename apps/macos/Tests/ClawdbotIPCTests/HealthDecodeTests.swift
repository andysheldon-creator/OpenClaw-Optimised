import Foundation
import Testing
@testable import Clawdbot

<<<<<<< HEAD
@Suite struct HealthDecodeTests {
    private let sampleJSON: String = // minimal but complete payload
        """
        {"ts":1733622000,"durationMs":420,"web":{"linked":true,"authAgeMs":120000,"connect":{"ok":true,"status":200,"error":null,"elapsedMs":800}},"heartbeatSeconds":60,"sessions":{"path":"/tmp/sessions.json","count":1,"recent":[{"key":"abc","updatedAt":1733621900,"age":120000}]}}
=======
    @Suite struct HealthDecodeTests {
        private let sampleJSON: String = // minimal but complete payload
            """
        {"ts":1733622000,"durationMs":420,"channels":{"whatsapp":{"linked":true,"authAgeMs":120000},"telegram":{"configured":true,"probe":{"ok":true,"elapsedMs":800}}},"channelOrder":["whatsapp","telegram"],"heartbeatSeconds":60,"sessions":{"path":"/tmp/sessions.json","count":1,"recent":[{"key":"abc","updatedAt":1733621900,"age":120000}]}}
>>>>>>> upstream/main
        """

    @Test func decodesCleanJSON() async throws {
        let data = Data(sampleJSON.utf8)
        let snap = decodeHealthSnapshot(from: data)

<<<<<<< HEAD
        #expect(snap?.web.linked == true)
=======
        #expect(snap?.channels["whatsapp"]?.linked == true)
>>>>>>> upstream/main
        #expect(snap?.sessions.count == 1)
    }

    @Test func decodesWithLeadingNoise() async throws {
        let noisy = "debug: something logged\n" + self.sampleJSON + "\ntrailer"
        let snap = decodeHealthSnapshot(from: Data(noisy.utf8))

<<<<<<< HEAD
        #expect(snap?.web.connect?.status == 200)
=======
        #expect(snap?.channels["telegram"]?.probe?.elapsedMs == 800)
>>>>>>> upstream/main
    }

    @Test func failsWithoutBraces() async throws {
        let data = Data("no json here".utf8)
        let snap = decodeHealthSnapshot(from: data)

        #expect(snap == nil)
    }
}
