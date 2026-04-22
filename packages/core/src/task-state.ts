import type {
  ResolvedStartupConfig,
  SpriteOutputFormat,
  SpriteSandboxMode
} from "@sprite/config";
import type { ResolvedProviderState } from "@sprite/providers";

export type RuntimeLoopPhase = "plan" | "act" | "observe";

export interface TaskStopConditions {
  maxIterations: number;
  stopOnApprovalRequired: boolean;
  stopOnProviderError: boolean;
}

export interface TaskAllowedDefaults {
  outputFormat: SpriteOutputFormat;
  sandboxMode: SpriteSandboxMode;
  toolExecutionEnabled: boolean;
}

export interface TaskRequest {
  task: string;
  cwd: string;
  provider: ResolvedProviderState | null;
  startup: ResolvedStartupConfig;
  allowedDefaults: TaskAllowedDefaults;
  stopConditions: TaskStopConditions;
}

export interface PlannedExecutionStep {
  phase: RuntimeLoopPhase;
  status: "completed" | "pending";
  summary: string;
}

export interface PlannedExecutionFlow {
  status: "planned";
  request: TaskRequest;
  currentPhase: RuntimeLoopPhase;
  steps: PlannedExecutionStep[];
  summary: string;
  warnings: string[];
}
