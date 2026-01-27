// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "ClawdbrainKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "ClawdbrainProtocol", targets: ["ClawdbrainProtocol"]),
        .library(name: "ClawdbrainKit", targets: ["ClawdbrainKit"]),
        .library(name: "ClawdbrainChatUI", targets: ["ClawdbrainChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "ClawdbrainProtocol",
            path: "Sources/ClawdbrainProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ClawdbrainKit",
            path: "Sources/ClawdbrainKit",
            dependencies: [
                "ClawdbrainProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ClawdbrainChatUI",
            path: "Sources/ClawdbrainChatUI",
            dependencies: [
                "ClawdbrainKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "ClawdbrainKitTests",
            dependencies: ["ClawdbrainKit", "ClawdbrainChatUI"],
            path: "Tests/ClawdbrainKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
