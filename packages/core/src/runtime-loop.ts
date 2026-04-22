import type { BootstrapState } from "./agent-runtime.js";
import type {
  PlannedExecutionFlow,
  PlannedExecutionStep,
  TaskRequest
} from "./task-state.js";

const DEFAULT_MAX_ITERATIONS = 1;

export function createTaskRequest(
  task: string,
  bootstrapState: BootstrapState
): TaskRequest {
  return {
    task,
    cwd: bootstrapState.startup.cwd,
    provider: bootstrapState.provider,
    startup: bootstrapState.startup,
    allowedDefaults: {
      outputFormat: bootstrapState.startup.outputFormat,
      sandboxMode: bootstrapState.startup.sandboxMode,
      toolExecutionEnabled: false
    },
    stopConditions: {
      maxIterations: DEFAULT_MAX_ITERATIONS,
      stopOnApprovalRequired: true,
      stopOnProviderError: true
    }
  };
}

function createPlanSteps(request: TaskRequest): PlannedExecutionStep[] {
  const providerSummary =
    request.provider === null
      ? "no active provider is configured yet"
      : `active provider is ${request.provider.providerName} (${request.provider.model ?? "model not configured"})`;

  return [
    {
      phase: "plan",
      status: "completed",
      summary: `Interpret the task goal and confirm runtime constraints; ${providerSummary}.`
    },
    {
      phase: "act",
      status: "pending",
      summary:
        "Repository inspection and tool work are deferred to later stories, so no file search, edits, or command execution have been attempted yet."
    },
    {
      phase: "observe",
      status: "pending",
      summary:
        "Observation remains pending until tool execution, validation, and runtime events exist in later stories."
    }
  ];
}

export function runInitialPlanActObserveLoop(
  request: TaskRequest,
  warnings: string[] = []
): PlannedExecutionFlow {
  return {
    status: "planned",
    request,
    currentPhase: "act",
    steps: createPlanSteps(request),
    summary:
      "Initial execution flow created. The runtime has planned the first loop but has not started repository inspection or tool work yet.",
    warnings
  };
}
