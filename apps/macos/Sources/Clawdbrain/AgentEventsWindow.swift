import ClawdbrainProtocol
import SwiftUI

@MainActor
struct AgentEventsWindow: View {
    private let store = AgentEventStore.shared
    @State private var selectedStream: String? = nil
    @State private var selectedRunId: String? = nil
    @State private var searchText: String = ""
    @State private var showJson: Bool = false

    private var filteredEvents: [ControlAgentEvent] {
        var result = store.events
        if let stream = selectedStream {
            result = result.filter { $0.stream == stream }
        }
        if let runId = selectedRunId {
            result = result.filter { $0.runId == runId }
        }
        if !searchText.isEmpty {
            result = result.filter { event in
                let json = prettyJSON(event.data) ?? ""
                return json.localizedCaseInsensitiveContains(searchText) ||
                       event.stream.localizedCaseInsensitiveContains(searchText) ||
                       event.runId.localizedCaseInsensitiveContains(searchText)
            }
        }
        return result
    }

    private var uniqueStreams: [String] {
        Array(Set(store.events.map { $0.stream })).sorted()
    }

    private var uniqueRunIds: [String] {
        Array(Set(store.events.map { $0.runId })).sorted()
    }

    private var stats: (total: Int, job: Int, tool: Int, assistant: Int, error: Int) {
        let events = store.events
        return (
            total: events.count,
            job: events.filter { $0.stream == "job" }.count,
            tool: events.filter { $0.stream == "tool" }.count,
            assistant: events.filter { $0.stream == "assistant" }.count,
            error: events.filter { $0.stream == "error" }.count
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            headerView
            Divider()
            filterBar
            Divider()
            statsBar
            Divider()
            eventList
        }
        .frame(minWidth: 600, minHeight: 450)
    }

    private var headerView: some View {
        HStack {
            Image(systemName: "bolt.fill")
                .foregroundStyle(.blue)
            Text("Agent Events")
                .font(.title3.weight(.semibold))
            Spacer()
            Button(action: { store.clear() }) {
                Label("Clear", systemImage: "trash")
            }
            .buttonStyle(.bordered)
        }
        .padding(12)
    }

    private var filterBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease")
                    .foregroundStyle(.secondary)
                Picker("Stream", selection: $selectedStream) {
                    Text("All Streams").tag(nil as String?)
                    ForEach(uniqueStreams, id: \.self) { stream in
                        Text(stream.capitalized).tag(stream as String?)
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 120)
            }

            HStack(spacing: 4) {
                Image(systemName: "number")
                    .foregroundStyle(.secondary)
                Picker("Run", selection: $selectedRunId) {
                    Text("All Runs").tag(nil as String?)
                    ForEach(uniqueRunIds, id: \.self) { runId in
                        Text(runId.prefix(8) + "...").tag(runId as String?)
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 100)
            }

            HStack(spacing: 4) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search...", text: $searchText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 150)
            }

            Spacer()

            Toggle("Show JSON", isOn: $showJson)
                .toggleStyle(.switch)
                .controlSize(.small)

            if selectedStream != nil || selectedRunId != nil || !searchText.isEmpty {
                Button("Reset") {
                    selectedStream = nil
                    selectedRunId = nil
                    searchText = ""
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.blue)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var statsBar: some View {
        HStack(spacing: 16) {
            StatBadge(label: "Total", value: stats.total, color: .secondary)
            StatBadge(label: "Job", value: stats.job, color: .blue)
            StatBadge(label: "Tool", value: stats.tool, color: .orange)
            StatBadge(label: "Assistant", value: stats.assistant, color: .green)
            if stats.error > 0 {
                StatBadge(label: "Error", value: stats.error, color: .red)
            }
            Spacer()
            Text("\(filteredEvents.count) shown")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.primary.opacity(0.02))
    }

    private var eventList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                if filteredEvents.isEmpty {
                    emptyState
                } else {
                    ForEach(filteredEvents.reversed(), id: \.seq) { event in
                        EventRow(event: event, showJson: showJson)
                    }
                }
            }
            .padding(12)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "bolt.slash")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No events")
                .font(.headline)
                .foregroundStyle(.secondary)
            if selectedStream != nil || selectedRunId != nil || !searchText.isEmpty {
                Text("Try adjusting filters")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                Text("Events will appear as agents run")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }

    private func prettyJSON(_ dict: [String: ClawdbrainProtocol.AnyCodable]) -> String? {
        let normalized = dict.mapValues { $0.value }
        guard JSONSerialization.isValidJSONObject(normalized),
              let data = try? JSONSerialization.data(withJSONObject: normalized, options: [.prettyPrinted]),
              let str = String(data: data, encoding: .utf8)
        else { return nil }
        return str
    }
}

private struct StatBadge: View {
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
        }
    }
}

private struct EventRow: View {
    let event: ControlAgentEvent
    let showJson: Bool
    @State private var isExpanded: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: iconName)
                    .foregroundStyle(tint)
                    .font(.caption)
                Text(event.stream.uppercased())
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(tint)
                    .foregroundStyle(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                if let summary = event.summary {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                Spacer()
                Text("run " + String(event.runId.prefix(8)))
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Text(formattedTs)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Button(action: { isExpanded.toggle() }) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
            }

            if isExpanded || showJson {
                if let json = prettyJSON(event.data) {
                    Text(json)
                        .font(.caption.monospaced())
                        .foregroundStyle(.primary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Color.primary.opacity(0.03))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.primary.opacity(0.04)))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(event.stream == "error" ? Color.red.opacity(0.3) : Color.clear, lineWidth: 1)
        )
    }

    private var iconName: String {
        switch event.stream {
        case "job": return "play.circle"
        case "tool": return "hammer"
        case "assistant": return "bubble.left"
        case "error": return "exclamationmark.triangle"
        default: return "circle"
        }
    }

    private var tint: Color {
        switch event.stream {
        case "job": return .blue
        case "tool": return .orange
        case "assistant": return .green
        case "error": return .red
        default: return .gray
        }
    }

    private var formattedTs: String {
        let date = Date(timeIntervalSince1970: event.ts / 1000)
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f.string(from: date)
    }

    private func prettyJSON(_ dict: [String: ClawdbrainProtocol.AnyCodable]) -> String? {
        let normalized = dict.mapValues { $0.value }
        guard JSONSerialization.isValidJSONObject(normalized),
              let data = try? JSONSerialization.data(withJSONObject: normalized, options: [.prettyPrinted]),
              let str = String(data: data, encoding: .utf8)
        else { return nil }
        return str
    }
}

struct AgentEventsWindow_Previews: PreviewProvider {
    static var previews: some View {
        let sample = ControlAgentEvent(
            runId: "abc123def456",
            seq: 1,
            stream: "tool",
            ts: Date().timeIntervalSince1970 * 1000,
            data: [
                "phase": ClawdbrainProtocol.AnyCodable("start"),
                "name": ClawdbrainProtocol.AnyCodable("bash"),
            ],
            summary: "Running bash command")
        AgentEventStore.shared.append(sample)
        return AgentEventsWindow()
    }
}
