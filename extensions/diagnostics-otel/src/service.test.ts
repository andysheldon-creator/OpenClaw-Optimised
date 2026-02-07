import { beforeEach, describe, expect, test, vi } from "vitest";

const registerLogTransportMock = vi.hoisted(() => vi.fn());

const telemetryState = vi.hoisted(() => {
  const counters = new Map<string, { add: ReturnType<typeof vi.fn> }>();
  const histograms = new Map<string, { record: ReturnType<typeof vi.fn> }>();
  const tracer = {
    startSpan: vi.fn((_name: string, _opts?: unknown) => ({
      end: vi.fn(),
      setStatus: vi.fn(),
    })),
  };
  const meter = {
    createCounter: vi.fn((name: string) => {
      const counter = { add: vi.fn() };
      counters.set(name, counter);
      return counter;
    }),
    createHistogram: vi.fn((name: string) => {
      const histogram = { record: vi.fn() };
      histograms.set(name, histogram);
      return histogram;
    }),
  };
  return { counters, histograms, tracer, meter };
});

const sdkStart = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const sdkShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const logEmit = vi.hoisted(() => vi.fn());
const logShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@opentelemetry/api", () => ({
  metrics: {
    getMeter: () => telemetryState.meter,
  },
  trace: {
    getTracer: () => telemetryState.tracer,
  },
  SpanKind: {
    INTERNAL: 0,
    SERVER: 1,
    CLIENT: 2,
    PRODUCER: 3,
    CONSUMER: 4,
  },
  SpanStatusCode: {
    ERROR: 2,
  },
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start = sdkStart;
    shutdown = sdkShutdown;
  },
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: class {},
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: class {},
}));

vi.mock("@opentelemetry/exporter-logs-otlp-http", () => ({
  OTLPLogExporter: class {},
}));

vi.mock("@opentelemetry/sdk-logs", () => ({
  BatchLogRecordProcessor: class {},
  LoggerProvider: class {
    addLogRecordProcessor = vi.fn();
    getLogger = vi.fn(() => ({
      emit: logEmit,
    }));
    shutdown = logShutdown;
  },
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  PeriodicExportingMetricReader: class {},
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
  ParentBasedSampler: class {},
  TraceIdRatioBasedSampler: class {},
}));

vi.mock("@opentelemetry/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@opentelemetry/resources")>();
  return {
    ...actual,
    Resource: class {
      // eslint-disable-next-line @typescript-eslint/no-useless-constructor
      constructor(_value?: unknown) {}
    },
    resourceFromAttributes: (_attrs?: unknown) => ({}),
  };
});

vi.mock("@opentelemetry/semantic-conventions", () => ({
  SemanticResourceAttributes: {
    SERVICE_NAME: "service.name",
  },
}));

vi.mock("openclaw/plugin-sdk", async () => {
  const actual = await vi.importActual<typeof import("openclaw/plugin-sdk")>("openclaw/plugin-sdk");
  return {
    ...actual,
    registerLogTransport: registerLogTransportMock,
  };
});

import { emitDiagnosticEvent } from "openclaw/plugin-sdk";
import { createDiagnosticsOtelService } from "./service.js";

describe("diagnostics-otel service", () => {
  beforeEach(() => {
    telemetryState.counters.clear();
    telemetryState.histograms.clear();
    telemetryState.tracer.startSpan.mockClear();
    telemetryState.meter.createCounter.mockClear();
    telemetryState.meter.createHistogram.mockClear();
    sdkStart.mockClear();
    sdkShutdown.mockClear();
    logEmit.mockClear();
    logShutdown.mockClear();
    registerLogTransportMock.mockReset();
  });

  test("records message-flow metrics and spans", async () => {
    const registeredTransports: Array<(logObj: Record<string, unknown>) => void> = [];
    const stopTransport = vi.fn();
    registerLogTransportMock.mockImplementation((transport) => {
      registeredTransports.push(transport);
      return stopTransport;
    });

    const service = createDiagnosticsOtelService();
    await service.start({
      config: {
        diagnostics: {
          enabled: true,
          otel: {
            enabled: true,
            endpoint: "http://otel-collector:4318",
            protocol: "http/protobuf",
            traces: true,
            metrics: true,
            logs: true,
          },
        },
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    });

    emitDiagnosticEvent({
      type: "webhook.received",
      channel: "telegram",
      updateType: "telegram-post",
    });
    emitDiagnosticEvent({
      type: "webhook.processed",
      channel: "telegram",
      updateType: "telegram-post",
      durationMs: 120,
    });
    emitDiagnosticEvent({
      type: "message.queued",
      channel: "telegram",
      source: "telegram",
      queueDepth: 2,
    });
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "telegram",
      outcome: "completed",
      durationMs: 55,
    });
    emitDiagnosticEvent({
      type: "queue.lane.dequeue",
      lane: "main",
      queueSize: 3,
      waitMs: 10,
    });
    emitDiagnosticEvent({
      type: "session.stuck",
      state: "processing",
      ageMs: 125_000,
    });
    emitDiagnosticEvent({
      type: "run.attempt",
      runId: "run-1",
      attempt: 2,
    });

    expect(telemetryState.counters.get("openclaw.webhook.received")?.add).toHaveBeenCalled();
    expect(
      telemetryState.histograms.get("openclaw.webhook.duration_ms")?.record,
    ).toHaveBeenCalled();
    expect(telemetryState.counters.get("openclaw.message.queued")?.add).toHaveBeenCalled();
    expect(telemetryState.counters.get("openclaw.message.processed")?.add).toHaveBeenCalled();
    expect(
      telemetryState.histograms.get("openclaw.message.duration_ms")?.record,
    ).toHaveBeenCalled();
    expect(telemetryState.histograms.get("openclaw.queue.wait_ms")?.record).toHaveBeenCalled();
    expect(telemetryState.counters.get("openclaw.session.stuck")?.add).toHaveBeenCalled();
    expect(
      telemetryState.histograms.get("openclaw.session.stuck_age_ms")?.record,
    ).toHaveBeenCalled();
    expect(telemetryState.counters.get("openclaw.run.attempt")?.add).toHaveBeenCalled();

    const spanNames = telemetryState.tracer.startSpan.mock.calls.map((call) => call[0]);
    expect(spanNames).toContain("openclaw.webhook.processed");
    expect(spanNames).toContain("openclaw.message.processed");
    expect(spanNames).toContain("openclaw.session.stuck");

    expect(registerLogTransportMock).toHaveBeenCalledTimes(1);
    expect(registeredTransports).toHaveLength(1);
    registeredTransports[0]?.({
      0: '{"subsystem":"diagnostic"}',
      1: "hello",
      _meta: { logLevelName: "INFO", date: new Date() },
    });
    expect(logEmit).toHaveBeenCalled();

    await service.stop?.();
  });

  function createTestCtx(otelOverrides?: { captureContent?: boolean }) {
    return {
      config: {
        diagnostics: {
          enabled: true,
          otel: {
            enabled: true,
            endpoint: "http://otel-collector:4318",
            protocol: "http/protobuf" as const,
            traces: true,
            metrics: true,
            logs: false,
            ...otelOverrides,
          },
        },
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
  }

  test("model.usage emits gen_ai.* span attributes alongside openclaw.*", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      channel: "webchat",
      provider: "openai",
      model: "gpt-5.2",
      operationName: "chat",
      responseId: "chatcmpl-abc123",
      responseModel: "gpt-5.2-2025-06-01",
      finishReasons: ["stop"],
      sessionKey: "agent:main:main",
      sessionId: "sess-001",
      usage: { input: 100, output: 50, cacheRead: 80, cacheWrite: 0, total: 230 },
      durationMs: 1500,
    });

    const spanCall = telemetryState.tracer.startSpan.mock.calls[0];
    expect(spanCall[0]).toBe("chat gpt-5.2");

    const attrs = spanCall[1]?.attributes;
    // gen_ai.* attributes
    expect(attrs["gen_ai.operation.name"]).toBe("chat");
    expect(attrs["gen_ai.provider.name"]).toBe("openai");
    expect(attrs["gen_ai.request.model"]).toBe("gpt-5.2");
    expect(attrs["gen_ai.usage.input_tokens"]).toBe(100);
    expect(attrs["gen_ai.usage.output_tokens"]).toBe(50);
    expect(attrs["gen_ai.response.id"]).toBe("chatcmpl-abc123");
    expect(attrs["gen_ai.response.model"]).toBe("gpt-5.2-2025-06-01");
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["stop"]);
    expect(attrs["gen_ai.conversation.id"]).toBe("agent:main:main");

    // openclaw.* attributes preserved
    expect(attrs["openclaw.channel"]).toBe("webchat");
    expect(attrs["openclaw.provider"]).toBe("openai");
    expect(attrs["openclaw.model"]).toBe("gpt-5.2");
    expect(attrs["openclaw.tokens.input"]).toBe(100);
    expect(attrs["openclaw.tokens.output"]).toBe(50);
    expect(attrs["openclaw.tokens.cache_read"]).toBe(80);

    await service.stop?.();
  });

  test("model.usage records gen_ai.client.operation.duration in seconds", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      usage: { input: 200, output: 100, total: 300 },
      durationMs: 3200,
    });

    const histogram = telemetryState.histograms.get("gen_ai.client.operation.duration");
    expect(histogram?.record).toHaveBeenCalledWith(
      3.2,
      expect.objectContaining({
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "anthropic",
        "gen_ai.request.model": "claude-sonnet-4-5-20250929",
      }),
    );

    await service.stop?.();
  });

  test("model.usage records gen_ai.client.token.usage split by input/output", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      usage: { input: 500, output: 120, total: 620 },
    });

    const histogram = telemetryState.histograms.get("gen_ai.client.token.usage");
    expect(histogram?.record).toHaveBeenCalledWith(
      500,
      expect.objectContaining({ "gen_ai.token.type": "input" }),
    );
    expect(histogram?.record).toHaveBeenCalledWith(
      120,
      expect.objectContaining({ "gen_ai.token.type": "output" }),
    );

    await service.stop?.();
  });

  test("maps provider names to gen_ai.provider.name enum values", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    const cases = [
      { input: "orq", expected: "openai" },
      { input: "anthropic", expected: "anthropic" },
      { input: "google-gemini", expected: "gcp.gemini" },
      { input: "aws-bedrock", expected: "aws.bedrock" },
      { input: "mistral", expected: "mistral_ai" },
      { input: "some-custom-provider", expected: "some-custom-provider" },
    ];

    for (const { input, expected } of cases) {
      telemetryState.tracer.startSpan.mockClear();
      emitDiagnosticEvent({
        type: "model.usage",
        provider: input,
        model: "test-model",
        usage: { input: 10, output: 5, total: 15 },
      });
      const attrs = telemetryState.tracer.startSpan.mock.calls[0]?.[1]?.attributes;
      expect(attrs?.["gen_ai.provider.name"]).toBe(expected);
    }

    await service.stop?.();
  });

  test("records gen_ai.input.messages when captureContent is enabled", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx({ captureContent: true }));

    const inputMessages = [
      {
        role: "user" as const,
        parts: [{ type: "text" as const, content: "Hello" }],
      },
    ];
    const outputMessages = [
      {
        role: "assistant" as const,
        parts: [{ type: "text" as const, content: "Hi there!" }],
        finish_reason: "stop",
      },
    ];

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      usage: { input: 10, output: 5, total: 15 },
      inputMessages,
      outputMessages,
    });

    const attrs = telemetryState.tracer.startSpan.mock.calls[0]?.[1]?.attributes;
    expect(attrs["gen_ai.input.messages"]).toBe(JSON.stringify(inputMessages));
    expect(attrs["gen_ai.output.messages"]).toBe(JSON.stringify(outputMessages));

    await service.stop?.();
  });

  test("does NOT record gen_ai.input.messages when captureContent is disabled", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      usage: { input: 10, output: 5, total: 15 },
      inputMessages: [
        { role: "user" as const, parts: [{ type: "text" as const, content: "secret" }] },
      ],
    });

    const attrs = telemetryState.tracer.startSpan.mock.calls[0]?.[1]?.attributes;
    expect(attrs["gen_ai.input.messages"]).toBeUndefined();
    expect(attrs["gen_ai.output.messages"]).toBeUndefined();

    await service.stop?.();
  });

  test("input messages with media parts use correct modality and type", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx({ captureContent: true }));

    const inputMessages = [
      {
        role: "user" as const,
        parts: [
          { type: "text" as const, content: "What's in this image?" },
          {
            type: "uri" as const,
            modality: "image" as const,
            mime_type: "image/png",
            uri: "https://example.com/photo.png",
          },
        ],
      },
    ];

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      usage: { input: 500, output: 50, total: 550 },
      inputMessages,
    });

    const attrs = telemetryState.tracer.startSpan.mock.calls[0]?.[1]?.attributes;
    const parsed = JSON.parse(attrs["gen_ai.input.messages"] as string);
    expect(parsed[0].parts).toHaveLength(2);
    expect(parsed[0].parts[0].type).toBe("text");
    expect(parsed[0].parts[1].type).toBe("uri");
    expect(parsed[0].parts[1].modality).toBe("image");
    expect(parsed[0].parts[1].mime_type).toBe("image/png");

    await service.stop?.();
  });

  test("output messages with tool_call parts are recorded correctly", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx({ captureContent: true }));

    const outputMessages = [
      {
        role: "assistant" as const,
        parts: [
          {
            type: "tool_call" as const,
            id: "call_abc",
            name: "get_weather",
            arguments: { location: "Paris" },
          },
        ],
        finish_reason: "tool_call",
      },
    ];

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      finishReasons: ["tool_call"],
      usage: { input: 100, output: 20, total: 120 },
      outputMessages,
    });

    const attrs = telemetryState.tracer.startSpan.mock.calls[0]?.[1]?.attributes;
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["tool_call"]);
    const parsed = JSON.parse(attrs["gen_ai.output.messages"] as string);
    expect(parsed[0].parts[0].type).toBe("tool_call");
    expect(parsed[0].parts[0].name).toBe("get_weather");
    expect(parsed[0].finish_reason).toBe("tool_call");

    await service.stop?.();
  });

  test("tool.execution emits execute_tool span with gen_ai.tool.* attributes", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "tool.execution",
      toolName: "web_search",
      toolType: "function",
      toolCallId: "call_xyz",
      channel: "webchat",
      durationMs: 850,
    });

    const spanCall = telemetryState.tracer.startSpan.mock.calls[0];
    expect(spanCall[0]).toBe("execute_tool web_search");

    const attrs = spanCall[1]?.attributes;
    expect(attrs["gen_ai.operation.name"]).toBe("execute_tool");
    expect(attrs["gen_ai.tool.name"]).toBe("web_search");
    expect(attrs["gen_ai.tool.type"]).toBe("function");
    expect(attrs["gen_ai.tool.call.id"]).toBe("call_xyz");
    expect(attrs["openclaw.channel"]).toBe("webchat");

    await service.stop?.();
  });

  test("tool.execution with error sets ERROR span status", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "tool.execution",
      toolName: "exec",
      toolCallId: "call_err",
      durationMs: 100,
      error: "timeout",
    });

    const span = telemetryState.tracer.startSpan.mock.results[0]?.value;
    expect(span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: 2, message: "timeout" }),
    );

    await service.stop?.();
  });

  test("inference spans use SpanKind.CLIENT, tool spans use SpanKind.INTERNAL", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      usage: { input: 10, output: 5, total: 15 },
    });

    emitDiagnosticEvent({
      type: "tool.execution",
      toolName: "web_search",
      durationMs: 200,
    });

    const calls = telemetryState.tracer.startSpan.mock.calls;
    // SpanKind.CLIENT = 2, SpanKind.INTERNAL = 0
    expect(calls[0][1]?.kind).toBe(2);
    expect(calls[1][1]?.kind).toBe(0);

    await service.stop?.();
  });

  test("existing openclaw.* metrics are still emitted alongside gen_ai.*", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      usage: { input: 100, output: 50, total: 150 },
      durationMs: 2000,
      costUsd: 0.005,
    });

    // Existing openclaw metrics still work
    expect(telemetryState.counters.get("openclaw.tokens")?.add).toHaveBeenCalled();
    expect(telemetryState.counters.get("openclaw.cost.usd")?.add).toHaveBeenCalled();
    expect(telemetryState.histograms.get("openclaw.run.duration_ms")?.record).toHaveBeenCalled();

    // New gen_ai metrics also emitted
    expect(
      telemetryState.histograms.get("gen_ai.client.operation.duration")?.record,
    ).toHaveBeenCalled();
    expect(telemetryState.histograms.get("gen_ai.client.token.usage")?.record).toHaveBeenCalled();

    await service.stop?.();
  });

  test("finish_reason length is recorded for truncated responses", async () => {
    const service = createDiagnosticsOtelService();
    await service.start(createTestCtx());

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.2",
      finishReasons: ["length"],
      usage: { input: 10000, output: 4096, total: 14096 },
    });

    const attrs = telemetryState.tracer.startSpan.mock.calls[0]?.[1]?.attributes;
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["length"]);

    await service.stop?.();
  });
});
