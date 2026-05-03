import type {
  ResolvedStartupConfig,
  SpriteOutputFormat,
  SpriteSandboxMode
} from "@sprite/config";
import type { ResolvedProviderState } from "@sprite/providers";
import type { FileActivityRecord } from "./file-activity.js";
import type { RuntimeEventRecord } from "./runtime-events.js";
import type { TaskContextPacket } from "./task-context.js";

export type RuntimeLoopPhase = "plan" | "act" | "observe";
export type TaskExecutionStatus =
  | "planned"
  | "waiting-for-input"
  | "completed"
  | "cancelled"
  | "max-iterations"
  | "failed";
export type TaskWaitingReason =
  | "steering-required"
  | "approval-required"
  | "user-input-required";
export type TaskTerminalReason =
  | "completed"
  | "cancelled"
  | "max-iterations"
  | "unrecoverable-error";
export type TaskIntentType = "cancel" | "steer";

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
  contextPacket: TaskContextPacket;
  allowedDefaults: TaskAllowedDefaults;
  stopConditions: TaskStopConditions;
}

export interface PlannedExecutionStep {
  phase: RuntimeLoopPhase;
  status: "completed" | "pending";
  summary: string;
}

export interface TaskIntentRecord {
  intent: TaskIntentType;
  note: string;
  createdAt: string;
}

export interface TaskWaitingState {
  reason: TaskWaitingReason;
  message: string;
}

export interface TaskTerminalState {
  reason: TaskTerminalReason;
  message: string;
}

export interface PlannedExecutionFlow {
  status: TaskExecutionStatus;
  sessionId: string;
  taskId: string;
  correlationId: string;
  request: TaskRequest;
  currentPhase: RuntimeLoopPhase;
  steps: PlannedExecutionStep[];
  summary: string;
  warnings: string[];
  waitingState: TaskWaitingState | null;
  terminalState: TaskTerminalState | null;
  intents: TaskIntentRecord[];
  events: RuntimeEventRecord[];
  fileActivity: FileActivityRecord[];
}
