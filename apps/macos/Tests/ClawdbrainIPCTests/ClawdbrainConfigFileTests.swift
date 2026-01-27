import Foundation
import Testing
@testable import Clawdbrain

@Suite(.serialized)
struct ClawdbrainConfigFileTests {
    @Test
    func configPathRespectsEnvOverride() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("clawdbrain-config-\(UUID().uuidString)")
            .appendingPathComponent("clawdbrain.json")
            .path

        await TestIsolation.withEnvValues(["CLAWDBRAIN_CONFIG_PATH": override]) {
            #expect(ClawdbrainConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("clawdbrain-config-\(UUID().uuidString)")
            .appendingPathComponent("clawdbrain.json")
            .path

        await TestIsolation.withEnvValues(["CLAWDBRAIN_CONFIG_PATH": override]) {
            ClawdbrainConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(ClawdbrainConfigFile.remoteGatewayPort() == 19999)
            #expect(ClawdbrainConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(ClawdbrainConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(ClawdbrainConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("clawdbrain-config-\(UUID().uuidString)")
            .appendingPathComponent("clawdbrain.json")
            .path

        await TestIsolation.withEnvValues(["CLAWDBRAIN_CONFIG_PATH": override]) {
            ClawdbrainConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            ClawdbrainConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = ClawdbrainConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("clawdbrain-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "CLAWDBRAIN_CONFIG_PATH": nil,
            "CLAWDBRAIN_STATE_DIR": dir,
        ]) {
            #expect(ClawdbrainConfigFile.stateDirURL().path == dir)
            #expect(ClawdbrainConfigFile.url().path == "\(dir)/clawdbrain.json")
        }
    }
}
