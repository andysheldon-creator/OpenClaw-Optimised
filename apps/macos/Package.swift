// swift-tools-version: 6.2
// Package manifest for the Clawdbrain macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Clawdbrain",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "ClawdbrainIPC", targets: ["ClawdbrainIPC"]),
        .library(name: "ClawdbrainDiscovery", targets: ["ClawdbrainDiscovery"]),
        .executable(name: "Clawdbrain", targets: ["Clawdbrain"]),
        .executable(name: "clawdbrain-mac", targets: ["ClawdbrainMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/ClawdbrainKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "ClawdbrainIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ClawdbrainDiscovery",
            dependencies: [
                .product(name: "ClawdbrainKit", package: "ClawdbrainKit"),
            ],
            path: "Sources/ClawdbrainDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Clawdbrain",
            dependencies: [
                "ClawdbrainIPC",
                "ClawdbrainDiscovery",
                .product(name: "ClawdbrainKit", package: "ClawdbrainKit"),
                .product(name: "ClawdbrainChatUI", package: "ClawdbrainKit"),
                .product(name: "ClawdbrainProtocol", package: "ClawdbrainKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Clawdbrain.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "ClawdbrainMacCLI",
            dependencies: [
                "ClawdbrainDiscovery",
                .product(name: "ClawdbrainKit", package: "ClawdbrainKit"),
                .product(name: "ClawdbrainProtocol", package: "ClawdbrainKit"),
            ],
            path: "Sources/ClawdbrainMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "ClawdbrainIPCTests",
            dependencies: [
                "ClawdbrainIPC",
                "Clawdbrain",
                "ClawdbrainDiscovery",
                .product(name: "ClawdbrainProtocol", package: "ClawdbrainKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
