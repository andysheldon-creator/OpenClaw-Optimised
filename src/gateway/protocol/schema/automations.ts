import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

// Automation Schedule
export const AutomationScheduleSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("at"),
      atMs: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("every"),
      everyMs: Type.Integer({ minimum: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("cron"),
      expr: NonEmptyString,
      tz: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
]);

// AI Model Info
export const AutomationAiModelSchema = Type.Object(
  {
    name: NonEmptyString,
    version: NonEmptyString,
    tokensUsed: Type.Integer({ minimum: 0 }),
    cost: Type.String(),
  },
  { additionalProperties: false },
);

// Automation Run Milestone
export const AutomationRunMilestoneSchema = Type.Object(
  {
    id: NonEmptyString,
    title: NonEmptyString,
    status: Type.Union([
      Type.Literal("completed"),
      Type.Literal("current"),
      Type.Literal("pending"),
    ]),
    timestamp: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// Automation Artifact
export const AutomationArtifactSchema = Type.Object(
  {
    id: NonEmptyString,
    name: NonEmptyString,
    type: NonEmptyString,
    size: Type.String(),
    url: NonEmptyString,
  },
  { additionalProperties: false },
);

// Automation Conflict
export const AutomationConflictSchema = Type.Object(
  {
    type: NonEmptyString,
    description: NonEmptyString,
    resolution: NonEmptyString,
  },
  { additionalProperties: false },
);

// Automation Run Record
export const AutomationRunRecordSchema = Type.Object(
  {
    id: NonEmptyString,
    automationId: NonEmptyString,
    automationName: NonEmptyString,
    startedAt: Type.Integer({ minimum: 0 }),
    completedAt: Type.Optional(Type.Integer({ minimum: 0 })),
    status: Type.Union([
      Type.Literal("success"),
      Type.Literal("failed"),
      Type.Literal("running"),
      Type.Literal("cancelled"),
    ]),
    summary: Type.Optional(Type.String()),
    error: Type.Optional(Type.String()),
    durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
    timeline: Type.Array(AutomationRunMilestoneSchema),
    artifacts: Type.Array(AutomationArtifactSchema),
    conflicts: Type.Array(AutomationConflictSchema),
    aiModel: Type.Optional(AutomationAiModelSchema),
  },
  { additionalProperties: false },
);

// Automation
export const AutomationSchema = Type.Object(
  {
    id: NonEmptyString,
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    type: Type.Union([
      Type.Literal("smart-sync-fork"),
      Type.Literal("custom-script"),
      Type.Literal("webhook"),
    ]),
    status: Type.Union([Type.Literal("active"), Type.Literal("suspended"), Type.Literal("error")]),
    enabled: Type.Boolean(),
    schedule: AutomationScheduleSchema,
    nextRunAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastRun: Type.Optional(
      Type.Object(
        {
          at: Type.Integer({ minimum: 0 }),
          status: Type.Union([
            Type.Literal("success"),
            Type.Literal("failed"),
            Type.Literal("running"),
          ]),
          durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
          summary: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    config: Type.Record(Type.String(), Type.Any()),
    createdAt: Type.Integer({ minimum: 0 }),
    updatedAt: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// Gateway Method Schemas

export const AutomationsListParamsSchema = Type.Object({}, { additionalProperties: false });

export const AutomationsListResultSchema = Type.Object(
  {
    automations: Type.Array(AutomationSchema),
  },
  { additionalProperties: false },
);

export const AutomationsRunParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const AutomationsUpdateParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const AutomationsDeleteParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const AutomationsCancelParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const AutomationsHistoryParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);

export const AutomationsHistoryResultSchema = Type.Object(
  {
    records: Type.Array(AutomationRunRecordSchema),
  },
  { additionalProperties: false },
);

export const AutomationsCreateParamsSchema = Type.Object(
  {
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    type: Type.Union([
      Type.Literal("smart-sync-fork"),
      Type.Literal("custom-script"),
      Type.Literal("webhook"),
    ]),
    schedule: AutomationScheduleSchema,
    enabled: Type.Optional(Type.Boolean()),
    config: Type.Optional(Type.Record(Type.String(), Type.Any())),
  },
  { additionalProperties: false },
);

export const AutomationsArtifactDownloadParamsSchema = Type.Object(
  {
    artifactId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const AutomationsArtifactDownloadResultSchema = Type.Object(
  {
    url: NonEmptyString,
    expiresAt: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
