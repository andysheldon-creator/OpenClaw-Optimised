/**
 * OBS-005 (#89) -- Golden run fixtures
 *
 * Types and comparison logic for "golden run" tests. A golden run is a
 * recorded, known-good execution of a skill that serves as a baseline.
 * Subsequent runs are compared against the golden fixture to detect
 * regressions in output, step ordering, or timing.
 */

// ---------------------------------------------------------------------------
// Golden run step
// ---------------------------------------------------------------------------

/** A single step within a golden run fixture. */
export type GoldenRunStep = {
  /** Step index (zero-based). */
  index: number;
  /** Name of the tool invoked. */
  toolCall: string;
  /** Serialised input passed to the tool. */
  input: unknown;
  /** Expected output from the tool. */
  expectedOutput: unknown;
  /** Expected wall-clock duration range in milliseconds. */
  expectedDurationMs: {
    min: number;
    max: number;
  };
};

// ---------------------------------------------------------------------------
// Golden run
// ---------------------------------------------------------------------------

/** A complete golden run fixture for a specific skill + input pair. */
export type GoldenRun = {
  /** Unique identifier for this golden fixture. */
  id: string;
  /** Skill name this fixture applies to. */
  skillName: string;
  /** Semantic version of the skill when the fixture was recorded. */
  skillVersion: string;
  /** The input payload used for the golden run. */
  input: unknown;
  /** Expected final output of the skill. */
  expectedOutput: unknown;
  /** Ordered list of expected steps. */
  steps: GoldenRunStep[];
  /** ISO-8601 timestamp of when this fixture was recorded. */
  recordedAt: string;
  /** Optional human-readable description. */
  description?: string;
};

// ---------------------------------------------------------------------------
// Comparison result
// ---------------------------------------------------------------------------

/** Outcome of comparing a single step against its golden expectation. */
export type StepComparisonResult = {
  /** Step index (zero-based). */
  index: number;
  /** Whether the step matched the golden expectation. */
  passed: boolean;
  /** Human-readable explanation when `passed` is false. */
  reason?: string;
  /** Diff details when output diverged. */
  diff?: {
    expected: unknown;
    actual: unknown;
  };
  /** Whether the step exceeded the expected duration range. */
  durationOutOfRange: boolean;
};

/** Outcome of comparing a full run against a golden fixture. */
export type ComparisonResult = {
  /** Whether the run matches the golden fixture overall. */
  passed: boolean;
  /** Per-step comparison results. */
  steps: StepComparisonResult[];
  /** Whether the final output matches the golden expected output. */
  outputMatched: boolean;
  /** Diff details for the final output (if it diverged). */
  outputDiff?: {
    expected: unknown;
    actual: unknown;
  };
  /** Total number of steps that diverged. */
  failedStepCount: number;
  /** ISO-8601 timestamp of when the comparison was performed. */
  comparedAt: string;
};

// ---------------------------------------------------------------------------
// Comparison function
// ---------------------------------------------------------------------------

/**
 * Compare an actual run result against a golden fixture.
 *
 * Uses deep equality for output comparison. Duration checks are range-based
 * to tolerate normal variance in execution timing.
 *
 * @param golden - The golden run fixture to compare against.
 * @param actual - The actual run data to validate.
 * @returns A detailed comparison result.
 */
export function compareRun(
  golden: GoldenRun,
  actual: {
    output: unknown;
    steps: Array<{
      toolCall: string;
      input: unknown;
      result: unknown;
      durationMs: number;
    }>;
  },
): ComparisonResult {
  const stepResults: StepComparisonResult[] = [];

  const maxSteps = Math.max(golden.steps.length, actual.steps.length);

  for (let i = 0; i < maxSteps; i++) {
    const expected = golden.steps[i];
    const actualStep = actual.steps[i];

    // Missing step in actual run.
    if (!actualStep) {
      stepResults.push({
        index: i,
        passed: false,
        reason: `Expected step "${expected.toolCall}" but run ended early.`,
        durationOutOfRange: false,
      });
      continue;
    }

    // Extra step not in golden fixture.
    if (!expected) {
      stepResults.push({
        index: i,
        passed: false,
        reason: `Unexpected extra step "${actualStep.toolCall}" not in golden fixture.`,
        durationOutOfRange: false,
      });
      continue;
    }

    // Tool call mismatch.
    if (expected.toolCall !== actualStep.toolCall) {
      stepResults.push({
        index: i,
        passed: false,
        reason: `Tool call mismatch: expected "${expected.toolCall}", got "${actualStep.toolCall}".`,
        durationOutOfRange: false,
      });
      continue;
    }

    // Output comparison (deep equality via JSON serialisation).
    const expectedJson = JSON.stringify(expected.expectedOutput);
    const actualJson = JSON.stringify(actualStep.result);
    const outputMatched = expectedJson === actualJson;

    // Duration range check.
    const durationOutOfRange =
      actualStep.durationMs < expected.expectedDurationMs.min ||
      actualStep.durationMs > expected.expectedDurationMs.max;

    const passed = outputMatched && !durationOutOfRange;

    const result: StepComparisonResult = {
      index: i,
      passed,
      durationOutOfRange,
    };

    if (!outputMatched) {
      result.reason = `Output diverged at step ${i} ("${expected.toolCall}").`;
      result.diff = {
        expected: expected.expectedOutput,
        actual: actualStep.result,
      };
    } else if (durationOutOfRange) {
      result.reason =
        `Duration ${actualStep.durationMs}ms outside expected range ` +
        `[${expected.expectedDurationMs.min}, ${expected.expectedDurationMs.max}]ms.`;
    }

    stepResults.push(result);
  }

  // Final output comparison.
  const outputExpectedJson = JSON.stringify(golden.expectedOutput);
  const outputActualJson = JSON.stringify(actual.output);
  const outputMatched = outputExpectedJson === outputActualJson;

  const failedStepCount = stepResults.filter((s) => !s.passed).length;

  return {
    passed: outputMatched && failedStepCount === 0,
    steps: stepResults,
    outputMatched,
    outputDiff: outputMatched
      ? undefined
      : { expected: golden.expectedOutput, actual: actual.output },
    failedStepCount,
    comparedAt: new Date().toISOString(),
  };
}
