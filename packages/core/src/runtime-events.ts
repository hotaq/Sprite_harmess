import {
  SAFETY_RULE_TARGETS,
  type SpriteSafetyRuleTarget
} from "@sprite/config";
import {
  DURABLE_MEMORY_TYPES,
  LEARNING_REVIEW_MODES,
  MEMORY_CANDIDATE_LIFECYCLE_STATUSES,
  MEMORY_CANDIDATE_REVIEW_ACTIONS,
  MEMORY_CONFIDENCE_VALUES,
  MEMORY_INFLUENCE_SOURCE_TYPES,
  MEMORY_INFLUENCE_STATUSES,
  MEMORY_SENSITIVITY_STATUSES,
  MEMORY_TYPES,
  RETROSPECTIVE_TERMINAL_STATUSES,
  type DurableMemoryType,
  type LearningReviewMode,
  type MemoryCandidateLifecycleStatus,
  type MemoryCandidateReviewAction,
  type MemoryConfidence,
  type MemoryInfluenceSourceType,
  type MemoryInfluenceStatus,
  type MemorySensitivityStatus,
  type MemoryType,
  type RetrospectiveTerminalStatus
} from "@sprite/memory";
import { SpriteError, err, type Result } from "@sprite/shared";
import {
  FILE_ACTIVITY_KINDS,
  containsSecretLikeValue,
  findForbiddenFileActivityField,
  validateFileActivityPath,
  type FileActivityKind
} from "./file-activity.js";
import type {
  RuntimeLoopPhase,
  TaskExecutionStatus,
  TaskTerminalReason,
  TaskWaitingReason
} from "./task-state.js";

export const RUNTIME_EVENT_SCHEMA_VERSION = 1 as const;

const RUNTIME_LOOP_PHASES = [
  "plan",
  "act",
  "observe"
] as const satisfies readonly RuntimeLoopPhase[];
const TASK_STARTED_STATUSES = [
  "planned"
] as const satisfies readonly TaskExecutionStatus[];

const TASK_EXECUTION_STATUSES = [
  "planned",
  "waiting-for-input",
  "completed",
  "cancelled",
  "max-iterations",
  "failed"
] as const satisfies readonly TaskExecutionStatus[];

const TASK_WAITING_REASONS = [
  "steering-required",
  "approval-required",
  "user-input-required"
] as const satisfies readonly TaskWaitingReason[];
const TASK_COMPLETED_REASONS = [
  "completed"
] as const satisfies readonly TaskTerminalReason[];
const TASK_FAILED_REASONS = [
  "max-iterations",
  "unrecoverable-error"
] as const satisfies readonly TaskTerminalReason[];
const TASK_CANCELLED_REASONS = [
  "cancelled"
] as const satisfies readonly TaskTerminalReason[];
const TOOL_NAMES = [
  "apply_patch",
  "read_file",
  "list_files",
  "run_command",
  "search_files"
] as const;
const FILE_EDIT_EVENT_TYPES = [
  "file.edit.applied",
  "file.edit.failed",
  "file.edit.requested"
] as const;
const POLICY_ACTIONS = ["allow", "deny", "modify", "require_approval"] as const;
const POLICY_REQUEST_TYPES = ["command", "file_edit"] as const;
const POLICY_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const APPROVAL_ACTIONS = [
  "allow",
  "deny",
  "edit",
  "alwaysAllowForSession"
] as const;
const APPROVAL_DECISIONS = [
  "allow",
  "deny",
  "edit",
  "timeout",
  "alwaysAllowForSession"
] as const;
const VALIDATION_STARTED_STATUSES = ["started"] as const;
const VALIDATION_COMPLETED_STATUSES = [
  "blocked",
  "failed",
  "passed",
  "skipped"
] as const;
const RECOVERY_TRIGGERS = [
  "approval_denied",
  "approval_timed_out",
  "command_failed",
  "command_timed_out",
  "policy_denied",
  "sandbox_violation",
  "validation_blocked",
  "validation_failed"
] as const;
const RECOVERY_DECISIONS = [
  "ask_user",
  "choose_safer_alternative",
  "retry_with_fix",
  "stop"
] as const;
const MEMORY_SAFETY_ACTIONS = ["allow", "block", "redact"] as const;
const FORBIDDEN_TOOL_PAYLOAD_FIELDS: ReadonlySet<string> = new Set([
  "commandOutput",
  "content",
  "diff",
  "env",
  "hunk",
  "matches",
  "newText",
  "oldText",
  "output",
  "patch",
  "rawCommandOutput",
  "rawContent",
  "rawOutput",
  "rawSnippet",
  "snippet",
  "snippets",
  "stderr",
  "stdout"
]);
const FORBIDDEN_POLICY_PAYLOAD_FIELDS: ReadonlySet<string> = new Set([
  "accessToken",
  "apiKey",
  "api_key",
  "authorization",
  "commandOutput",
  "content",
  "credential",
  "credentials",
  "diff",
  "env",
  "hunk",
  "newText",
  "oldText",
  "output",
  "password",
  "patch",
  "privateKey",
  "private_key",
  "query",
  "rawCommandOutput",
  "rawContent",
  "rawOutput",
  "rawSnippet",
  "repositoryInstruction",
  "secret",
  "snippet",
  "snippets",
  "stderr",
  "stdout",
  "token"
]);

const RUNTIME_EVENT_TYPES = [
  "task.started",
  "task.waiting",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "task.steering.received",
  "task.recovery.recorded",
  "learning.review.created",
  "retrospective.review.created",
  "memory.candidate.created",
  "memory.candidate.reviewed",
  "memory.entry.saved",
  "memory.influence.recorded",
  "memory.safety.evaluated",
  "session.resumed",
  "session.compacted",
  "policy.decision.recorded",
  "approval.requested",
  "approval.resolved",
  "validation.started",
  "validation.completed",
  "file.edit.applied",
  "file.edit.failed",
  "file.edit.requested",
  "file.activity.recorded",
  "tool.call.requested",
  "tool.call.started",
  "tool.call.completed",
  "tool.call.failed"
] as const;

const SESSION_COMPACTION_TRIGGER_REASONS = [
  "manual",
  "threshold",
  "context-overflow",
  "recovery"
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];
export type RuntimeToolName = (typeof TOOL_NAMES)[number];

export interface RuntimeEventOutputReference {
  fullOutputStored: boolean;
  reason: string;
  path?: string;
}

export interface RuntimeEventPayloadMap {
  "task.started": {
    phase: (typeof RUNTIME_LOOP_PHASES)[number];
    status: (typeof TASK_STARTED_STATUSES)[number];
    providerName: string;
    model: string;
  };
  "task.waiting": {
    reason: (typeof TASK_WAITING_REASONS)[number];
    message: string;
  };
  "task.completed": {
    reason: (typeof TASK_COMPLETED_REASONS)[number];
    message: string;
  };
  "task.failed": {
    reason: (typeof TASK_FAILED_REASONS)[number];
    message: string;
  };
  "task.cancelled": {
    reason: (typeof TASK_CANCELLED_REASONS)[number];
    message: string;
    note: string;
  };
  "task.steering.received": {
    note: string;
  };
  "task.recovery.recorded": {
    decision: (typeof RECOVERY_DECISIONS)[number];
    errorCode?: string;
    message?: string;
    nextAction: string;
    ruleId?: string;
    sourceEventId?: string;
    status: "recorded";
    summary: string;
    toolCallId?: string;
    trigger: (typeof RECOVERY_TRIGGERS)[number];
    validationId?: string;
  };
  "learning.review.created": {
    artifactPath: string;
    evidenceEventIds: string[];
    factCount: number;
    lessonCount: number;
    memoryCandidateIds: string[];
    missedAssumptionCount: number;
    mistakeCount: number;
    mode: LearningReviewMode;
    skillSignalIds: string[];
    status: "recorded";
    summary: string;
    testGapCount: number;
  };
  "retrospective.review.created": {
    artifactPath: string;
    commandCount: number;
    evidenceEventIds: string[];
    fileCount: number;
    finalStatus: RetrospectiveTerminalStatus;
    memoryCandidateCount: number;
    missedAssumptionCount: number;
    nextTimeImprovementCount: number;
    skillSignalCount: number;
    status: "recorded";
    summary: string;
    terminalStatus: RetrospectiveTerminalStatus;
  };
  "memory.safety.evaluated": {
    action: (typeof MEMORY_SAFETY_ACTIONS)[number];
    matchedRuleIds: string[];
    reason: string;
    redactedPreview: string;
    status: "recorded";
    summary: string;
    target: SpriteSafetyRuleTarget;
  };
  "memory.candidate.created": {
    candidateId: string;
    confidence: MemoryConfidence;
    contentPreview: string;
    memoryType: MemoryType;
    provenance: string;
    sensitivityStatus: MemorySensitivityStatus;
    sourceEventIds: string[];
    sourceTaskId?: string;
    status: "recorded";
    summary: string;
  };
  "memory.candidate.reviewed": {
    action: MemoryCandidateReviewAction;
    candidateId: string;
    confidence: MemoryConfidence;
    contentPreview: string;
    entryId?: string;
    lifecycleStatus: MemoryCandidateLifecycleStatus;
    memoryType: MemoryType;
    provenance: string;
    reason?: string;
    sensitivityStatus: MemorySensitivityStatus;
    sourceEventIds: string[];
    sourceTaskId?: string;
    status: MemoryCandidateLifecycleStatus;
    summary: string;
  };
  "memory.entry.saved": {
    autoSaved: boolean;
    candidateId: string;
    confidence: MemoryConfidence;
    contentPreview: string;
    entryId: string;
    memoryType: DurableMemoryType;
    provenance: string;
    sensitivityStatus: "non_sensitive";
    sourceEventIds: string[];
    sourceTaskId?: string;
    status: "recorded";
    summary: string;
  };
  "memory.influence.recorded": {
    evidenceEventIds: string[];
    influenceSummary?: string;
    preview: string;
    reason?: string;
    sourceEventIds: string[];
    sourceId: string;
    sourceSessionId?: string;
    sourceTaskId?: string;
    sourceType: MemoryInfluenceSourceType;
    status: MemoryInfluenceStatus;
    summary: string;
  };
  "session.resumed": {
    currentPhase: RuntimeLoopPhase;
    nextStep?: string;
    restoredEventCount: number;
    restoredTaskStatus: TaskExecutionStatus;
    status: "recorded";
    summary: string;
  };
  "session.compacted": {
    artifactId: string;
    firstRetainedEventId?: string;
    previousCompactionArtifactId?: string;
    sourceEventCount: number;
    sourceFirstEventId: string;
    sourceLastEventId: string;
    status: "recorded";
    summary: string;
    triggerReason: (typeof SESSION_COMPACTION_TRIGGER_REASONS)[number];
  };
  "policy.decision.recorded": {
    action: (typeof POLICY_ACTIONS)[number];
    affectedFiles?: string[];
    command?: string;
    cwd?: string;
    envExposure?: "custom" | "none";
    reason: string;
    requestType: (typeof POLICY_REQUEST_TYPES)[number];
    riskLevel: (typeof POLICY_RISK_LEVELS)[number];
    ruleId: string;
    status: "recorded";
    summary: string;
    timeoutMs?: number;
  };
  "approval.requested": {
    affectedFiles?: string[];
    allowedActions: (typeof APPROVAL_ACTIONS)[number][];
    approvalRequestId: string;
    command?: string;
    cwd?: string;
    envExposure?: "custom" | "none";
    reason: string;
    requestType: (typeof POLICY_REQUEST_TYPES)[number];
    riskLevel: (typeof POLICY_RISK_LEVELS)[number];
    ruleId: string;
    status: "pending";
    summary: string;
    timeoutMs: number;
    toolCallId?: string;
  };
  "approval.resolved": {
    approvalRequestId: string;
    decision: (typeof APPROVAL_DECISIONS)[number];
    reason?: string;
    requestType: (typeof POLICY_REQUEST_TYPES)[number];
    status: "resolved";
    summary: string;
    toolCallId?: string;
  };
  "validation.started": {
    command: string;
    cwd: string;
    name?: string;
    status: (typeof VALIDATION_STARTED_STATUSES)[number];
    summary: string;
    timeoutMs?: number;
    toolCallId: string;
    validationId: string;
  };
  "validation.completed": {
    command?: string;
    cwd?: string;
    durationMs?: number;
    errorCode?: string;
    exitCode?: number | null;
    message?: string;
    name?: string;
    outputReference?: RuntimeEventOutputReference;
    status: (typeof VALIDATION_COMPLETED_STATUSES)[number];
    summary: string;
    timeoutMs?: number;
    toolCallId?: string;
    validationId: string;
  };
  "file.edit.applied": {
    affectedFiles: string[];
    editId: string;
    status: "applied";
    summary: string;
    toolCallId: string;
    toolName: "apply_patch";
  };
  "file.edit.failed": {
    affectedFiles: string[];
    editId: string;
    errorCode: string;
    message: string;
    status: "failed";
    summary: string;
    toolCallId: string;
    toolName: "apply_patch";
  };
  "file.edit.requested": {
    affectedFiles: string[];
    editId: string;
    status: "requested";
    summary: string;
    toolCallId: string;
    toolName: "apply_patch";
  };
  "file.activity.recorded": {
    activityId: string;
    kind: FileActivityKind;
    path: string;
    returnedItemCount?: number;
    status: "recorded";
    summary: string;
    toolCallId?: string;
    toolName?: RuntimeToolName;
    totalItemCount?: number;
  };
  "tool.call.requested": {
    command?: string;
    cwd: string;
    query?: string;
    status: "requested";
    summary: string;
    targetPath?: string;
    timeoutMs?: number;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
  "tool.call.started": {
    command?: string;
    cwd: string;
    query?: string;
    status: "started";
    summary: string;
    targetPath?: string;
    timeoutMs?: number;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
  "tool.call.completed": {
    command?: string;
    cwd: string;
    durationMs?: number;
    exitCode?: number | null;
    outputReference?: RuntimeEventOutputReference;
    query?: string;
    status: "completed";
    summary: string;
    targetPath?: string;
    timeoutMs?: number;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
  "tool.call.failed": {
    command?: string;
    cwd: string;
    durationMs?: number;
    errorCode: string;
    exitCode?: number | null;
    message: string;
    outputReference?: RuntimeEventOutputReference;
    query?: string;
    status: "failed";
    summary: string;
    targetPath?: string;
    timeoutMs?: number;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
}

export type RuntimeEventPayload<T extends RuntimeEventType> =
  RuntimeEventPayloadMap[T];

export interface RuntimeEventContext {
  eventId: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  createdAt: string;
}

interface RuntimeEventBase<T extends RuntimeEventType> {
  schemaVersion: typeof RUNTIME_EVENT_SCHEMA_VERSION;
  eventId: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  type: T;
  createdAt: string;
  payload: RuntimeEventPayload<T>;
}

export type RuntimeEventRecord<T extends RuntimeEventType = RuntimeEventType> =
  {
    [EventType in T]: RuntimeEventBase<EventType>;
  }[T];

export type RuntimeEventListener = (event: RuntimeEventRecord) => void;

export function createRuntimeEventRecord<T extends RuntimeEventType>(
  context: RuntimeEventContext,
  type: T,
  payload: RuntimeEventPayload<T>
): RuntimeEventRecord<T> {
  return {
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    eventId: context.eventId,
    sessionId: context.sessionId,
    taskId: context.taskId,
    correlationId: context.correlationId,
    type,
    createdAt: context.createdAt,
    payload
  };
}

export function validateRuntimeEvent(
  event: unknown
): Result<RuntimeEventRecord, SpriteError> {
  if (!isPlainObject(event)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        "Runtime event must be a plain object."
      )
    );
  }

  if (event.schemaVersion !== RUNTIME_EVENT_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Unsupported runtime event schemaVersion '${String(event.schemaVersion)}'.`
      )
    );
  }

  const eventId = requireStringField(event, "eventId");
  const sessionId = requireStringField(event, "sessionId");
  const taskId = requireStringField(event, "taskId");
  const correlationId = requireStringField(event, "correlationId");
  const createdAt = requireStringField(event, "createdAt");
  const eventType = requireStringField(event, "type");

  if (eventId.ok === false) {
    return err(eventId.error);
  }

  if (sessionId.ok === false) {
    return err(sessionId.error);
  }

  if (taskId.ok === false) {
    return err(taskId.error);
  }

  if (correlationId.ok === false) {
    return err(correlationId.error);
  }

  if (createdAt.ok === false) {
    return err(createdAt.error);
  }

  if (eventType.ok === false) {
    return err(eventType.error);
  }

  if (!isRuntimeEventType(eventType.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Unknown runtime event type '${eventType.value}'.`
      )
    );
  }

  if (!isIsoUtcTimestamp(createdAt.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event createdAt '${createdAt.value}' must be a valid ISO 8601 UTC timestamp.`
      )
    );
  }

  if (!isPlainObject(event.payload)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        "Runtime event payload must be a plain object."
      )
    );
  }

  const context: RuntimeEventContext = {
    eventId: eventId.value,
    sessionId: sessionId.value,
    taskId: taskId.value,
    correlationId: correlationId.value,
    createdAt: createdAt.value
  };

  switch (eventType.value) {
    case "task.started": {
      const phase = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "phase",
        RUNTIME_LOOP_PHASES
      );
      const status = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "status",
        TASK_STARTED_STATUSES
      );
      const providerName = requirePayloadString(
        eventType.value,
        event.payload,
        "providerName"
      );
      const model = requirePayloadString(
        eventType.value,
        event.payload,
        "model"
      );

      if (phase.ok === false) {
        return err(phase.error);
      }

      if (status.ok === false) {
        return err(status.error);
      }

      if (providerName.ok === false) {
        return err(providerName.error);
      }

      if (model.ok === false) {
        return err(model.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        phase: phase.value,
        status: status.value,
        providerName: providerName.value,
        model: model.value
      });
    }
    case "task.waiting": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_WAITING_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value
      });
    }
    case "task.completed": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_COMPLETED_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value
      });
    }
    case "task.failed": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_FAILED_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value
      });
    }
    case "task.cancelled": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_CANCELLED_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );
      const note = requirePayloadString(eventType.value, event.payload, "note");

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      if (note.ok === false) {
        return err(note.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value,
        note: note.value
      });
    }
    case "task.steering.received": {
      const note = requirePayloadString(eventType.value, event.payload, "note");

      if (note.ok === false) {
        return err(note.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        note: note.value
      });
    }
    case "task.recovery.recorded": {
      return validateTaskRecoveryRecordedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "learning.review.created": {
      return validateLearningReviewCreatedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "retrospective.review.created": {
      return validateRetrospectiveReviewCreatedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "session.resumed": {
      return validateSessionResumedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "session.compacted": {
      return validateSessionCompactedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "memory.safety.evaluated": {
      return validateMemorySafetyEvaluatedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "memory.candidate.created": {
      return validateMemoryCandidateCreatedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "memory.candidate.reviewed": {
      return validateMemoryCandidateReviewedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "memory.entry.saved": {
      return validateMemoryEntrySavedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "memory.influence.recorded": {
      return validateMemoryInfluenceRecordedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "policy.decision.recorded": {
      return validatePolicyDecisionEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "approval.requested": {
      return validateApprovalRequestedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "approval.resolved": {
      return validateApprovalResolvedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "validation.started": {
      return validateValidationStartedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "validation.completed": {
      return validateValidationCompletedEvent(
        context,
        eventType.value,
        event.payload
      );
    }
    case "file.edit.applied":
    case "file.edit.failed":
    case "file.edit.requested": {
      return validateFileEditEvent(context, eventType.value, event.payload);
    }
    case "file.activity.recorded": {
      return validateFileActivityEvent(context, eventType.value, event.payload);
    }
    case "tool.call.requested": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "requested"
      );
    }
    case "tool.call.started": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "started"
      );
    }
    case "tool.call.completed": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "completed"
      );
    }
    case "tool.call.failed": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "failed"
      );
    }
  }

  return err(
    new SpriteError(
      "INVALID_RUNTIME_EVENT",
      `Unknown runtime event type '${eventType.value}'.`
    )
  );
}

function validateFileActivityEvent(
  context: RuntimeEventContext,
  type: "file.activity.recorded",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"file.activity.recorded">, SpriteError> {
  const forbiddenField = findForbiddenFileActivityField(payload);

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw content field '${forbiddenField}'.`
      )
    );
  }

  const activityId = requirePayloadString(type, payload, "activityId");
  const kind = requirePayloadLiteral(
    type,
    payload,
    "kind",
    FILE_ACTIVITY_KINDS
  );
  const path = requirePayloadString(type, payload, "path");
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const toolCallId = optionalPayloadString(type, payload, "toolCallId");
  const toolName = optionalPayloadLiteral(
    type,
    payload,
    "toolName",
    TOOL_NAMES
  );
  const returnedItemCount = optionalNonNegativeInteger(
    type,
    payload,
    "returnedItemCount"
  );
  const totalItemCount = optionalNonNegativeInteger(
    type,
    payload,
    "totalItemCount"
  );

  if (activityId.ok === false) {
    return err(activityId.error);
  }

  if (kind.ok === false) {
    return err(kind.error);
  }

  if (path.ok === false) {
    return err(path.error);
  }

  const safePath = validateFileActivityPath(path.value);

  if (safePath.ok === false) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        "Runtime event 'file.activity.recorded' payload path must be a safe project-relative path."
      )
    );
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (toolName.ok === false) {
    return err(toolName.error);
  }

  if (returnedItemCount.ok === false) {
    return err(returnedItemCount.error);
  }

  if (totalItemCount.ok === false) {
    return err(totalItemCount.error);
  }

  return okRuntimeEvent(context, type, {
    activityId: activityId.value,
    kind: kind.value,
    path: safePath.value,
    ...(returnedItemCount.value === undefined
      ? {}
      : { returnedItemCount: returnedItemCount.value }),
    status: status.value,
    summary: summary.value,
    ...(toolCallId.value === undefined ? {} : { toolCallId: toolCallId.value }),
    ...(toolName.value === undefined ? {} : { toolName: toolName.value }),
    ...(totalItemCount.value === undefined
      ? {}
      : { totalItemCount: totalItemCount.value })
  });
}

function validateMemorySafetyEvaluatedEvent(
  context: RuntimeEventContext,
  type: "memory.safety.evaluated",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"memory.safety.evaluated">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const action = requirePayloadLiteral(
    type,
    payload,
    "action",
    MEMORY_SAFETY_ACTIONS
  );
  const matchedRuleIds = requirePayloadStringArray(
    type,
    payload,
    "matchedRuleIds"
  );
  const reason = requirePayloadString(type, payload, "reason");
  const redactedPreview = requirePayloadString(
    type,
    payload,
    "redactedPreview"
  );
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const target = requirePayloadLiteral(
    type,
    payload,
    "target",
    SAFETY_RULE_TARGETS
  );

  if (action.ok === false) {
    return err(action.error);
  }

  if (matchedRuleIds.ok === false) {
    return err(matchedRuleIds.error);
  }

  if (reason.ok === false) {
    return err(reason.error);
  }

  if (redactedPreview.ok === false) {
    return err(redactedPreview.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (target.ok === false) {
    return err(target.error);
  }

  const secretCheckedFields = [
    ["reason", reason.value],
    ["redactedPreview", redactedPreview.value],
    ["summary", summary.value],
    ...matchedRuleIds.value.map((ruleId) => ["matchedRuleIds", ruleId] as const)
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    action: action.value,
    matchedRuleIds: matchedRuleIds.value,
    reason: reason.value,
    redactedPreview: redactedPreview.value,
    status: status.value,
    summary: summary.value,
    target: target.value
  });
}

function validateMemoryCandidateCreatedEvent(
  context: RuntimeEventContext,
  type: "memory.candidate.created",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"memory.candidate.created">, SpriteError> {
  const validation = validateMemoryLifecyclePayload(type, payload, {
    idField: "candidateId",
    idPattern: /^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/,
    memoryTypes: MEMORY_TYPES,
    sensitivityStatuses: MEMORY_SENSITIVITY_STATUSES
  });

  if (!validation.ok) {
    return err(validation.error);
  }

  return okRuntimeEvent(context, type, {
    candidateId: validation.value.id,
    confidence: validation.value.confidence,
    contentPreview: validation.value.contentPreview,
    memoryType: validation.value.memoryType as MemoryType,
    provenance: validation.value.provenance,
    sensitivityStatus: validation.value
      .sensitivityStatus as MemorySensitivityStatus,
    sourceEventIds: validation.value.sourceEventIds,
    ...(validation.value.sourceTaskId === undefined
      ? {}
      : { sourceTaskId: validation.value.sourceTaskId }),
    status: validation.value.status,
    summary: validation.value.summary
  });
}

function validateLearningReviewCreatedEvent(
  context: RuntimeEventContext,
  type: "learning.review.created",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"learning.review.created">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const artifactPath = requirePayloadString(type, payload, "artifactPath");
  const evidenceEventIds = requirePayloadStringArray(
    type,
    payload,
    "evidenceEventIds"
  );
  const factCount = requireNonNegativeInteger(type, payload, "factCount");
  const lessonCount = requireNonNegativeInteger(type, payload, "lessonCount");
  const memoryCandidateIds = requirePayloadStringArray(
    type,
    payload,
    "memoryCandidateIds"
  );
  const missedAssumptionCount = requireNonNegativeInteger(
    type,
    payload,
    "missedAssumptionCount"
  );
  const mistakeCount = requireNonNegativeInteger(type, payload, "mistakeCount");
  const mode = requirePayloadLiteral(type, payload, "mode", LEARNING_REVIEW_MODES);
  const skillSignalIds = requirePayloadStringArray(
    type,
    payload,
    "skillSignalIds"
  );
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const testGapCount = requireNonNegativeInteger(type, payload, "testGapCount");
  const checks = [
    artifactPath,
    evidenceEventIds,
    factCount,
    lessonCount,
    memoryCandidateIds,
    missedAssumptionCount,
    mistakeCount,
    mode,
    skillSignalIds,
    status,
    summary,
    testGapCount
  ];
  const failed = checks.find((check) => !check.ok);

  if (failed !== undefined && !failed.ok) {
    return err(failed.error);
  }

  if (
    !artifactPath.ok ||
    !evidenceEventIds.ok ||
    !factCount.ok ||
    !lessonCount.ok ||
    !memoryCandidateIds.ok ||
    !missedAssumptionCount.ok ||
    !mistakeCount.ok ||
    !mode.ok ||
    !skillSignalIds.ok ||
    !status.ok ||
    !summary.ok ||
    !testGapCount.ok
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload is invalid.`
      )
    );
  }

  const artifactPathValidation = validateFileActivityPath(artifactPath.value);

  if (!artifactPathValidation.ok) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' artifactPath must be project-relative and safe.`
      )
    );
  }

  if (evidenceEventIds.value.length === 0 || factCount.value === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must include learning review evidence and at least one fact.`
      )
    );
  }

  for (const candidateId of memoryCandidateIds.value) {
    if (!/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidateId)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' memoryCandidateIds must use memcand_ identifiers.`
        )
      );
    }
  }

  const secretCheckedFields = [
    ["artifactPath", artifactPath.value],
    ["mode", mode.value],
    ["status", status.value],
    ["summary", summary.value],
    ...evidenceEventIds.value.map(
      (eventId) => ["evidenceEventIds", eventId] as const
    ),
    ...memoryCandidateIds.value.map(
      (candidateId) => ["memoryCandidateIds", candidateId] as const
    ),
    ...skillSignalIds.value.map(
      (signalId) => ["skillSignalIds", signalId] as const
    )
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    artifactPath: artifactPathValidation.value,
    evidenceEventIds: evidenceEventIds.value,
    factCount: factCount.value,
    lessonCount: lessonCount.value,
    memoryCandidateIds: memoryCandidateIds.value,
    missedAssumptionCount: missedAssumptionCount.value,
    mistakeCount: mistakeCount.value,
    mode: mode.value,
    skillSignalIds: skillSignalIds.value,
    status: status.value,
    summary: summary.value,
    testGapCount: testGapCount.value
  });
}

function validateRetrospectiveReviewCreatedEvent(
  context: RuntimeEventContext,
  type: "retrospective.review.created",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"retrospective.review.created">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const artifactPath = requirePayloadString(type, payload, "artifactPath");
  const commandCount = requireNonNegativeInteger(type, payload, "commandCount");
  const evidenceEventIds = requirePayloadStringArray(
    type,
    payload,
    "evidenceEventIds"
  );
  const fileCount = requireNonNegativeInteger(type, payload, "fileCount");
  const finalStatus = requirePayloadLiteral(
    type,
    payload,
    "finalStatus",
    RETROSPECTIVE_TERMINAL_STATUSES
  );
  const memoryCandidateCount = requireNonNegativeInteger(
    type,
    payload,
    "memoryCandidateCount"
  );
  const missedAssumptionCount = requireNonNegativeInteger(
    type,
    payload,
    "missedAssumptionCount"
  );
  const nextTimeImprovementCount = requireNonNegativeInteger(
    type,
    payload,
    "nextTimeImprovementCount"
  );
  const skillSignalCount = requireNonNegativeInteger(
    type,
    payload,
    "skillSignalCount"
  );
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const terminalStatus = requirePayloadLiteral(
    type,
    payload,
    "terminalStatus",
    RETROSPECTIVE_TERMINAL_STATUSES
  );
  const checks = [
    artifactPath,
    commandCount,
    evidenceEventIds,
    fileCount,
    finalStatus,
    memoryCandidateCount,
    missedAssumptionCount,
    nextTimeImprovementCount,
    skillSignalCount,
    status,
    summary,
    terminalStatus
  ];
  const failed = checks.find((check) => !check.ok);

  if (failed !== undefined && !failed.ok) {
    return err(failed.error);
  }

  if (
    !artifactPath.ok ||
    !commandCount.ok ||
    !evidenceEventIds.ok ||
    !fileCount.ok ||
    !finalStatus.ok ||
    !memoryCandidateCount.ok ||
    !missedAssumptionCount.ok ||
    !nextTimeImprovementCount.ok ||
    !skillSignalCount.ok ||
    !status.ok ||
    !summary.ok ||
    !terminalStatus.ok
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload is invalid.`
      )
    );
  }

  const artifactPathValidation = validateFileActivityPath(artifactPath.value);

  if (!artifactPathValidation.ok) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' artifactPath must be project-relative and safe.`
      )
    );
  }

  if (
    evidenceEventIds.value.length === 0 ||
    commandCount.value === 0 ||
    fileCount.value === 0
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must include evidence, command, and file counts.`
      )
    );
  }

  const secretCheckedFields = [
    ["artifactPath", artifactPath.value],
    ["finalStatus", finalStatus.value],
    ["status", status.value],
    ["summary", summary.value],
    ["terminalStatus", terminalStatus.value],
    ...evidenceEventIds.value.map(
      (eventId) => ["evidenceEventIds", eventId] as const
    )
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    artifactPath: artifactPathValidation.value,
    commandCount: commandCount.value,
    evidenceEventIds: evidenceEventIds.value,
    fileCount: fileCount.value,
    finalStatus: finalStatus.value,
    memoryCandidateCount: memoryCandidateCount.value,
    missedAssumptionCount: missedAssumptionCount.value,
    nextTimeImprovementCount: nextTimeImprovementCount.value,
    skillSignalCount: skillSignalCount.value,
    status: status.value,
    summary: summary.value,
    terminalStatus: terminalStatus.value
  });
}

function validateMemoryCandidateReviewedEvent(
  context: RuntimeEventContext,
  type: "memory.candidate.reviewed",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"memory.candidate.reviewed">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const action = requirePayloadLiteral(
    type,
    payload,
    "action",
    MEMORY_CANDIDATE_REVIEW_ACTIONS
  );
  const candidateId = requirePayloadString(type, payload, "candidateId");
  const confidence = requirePayloadLiteral(
    type,
    payload,
    "confidence",
    MEMORY_CONFIDENCE_VALUES
  );
  const contentPreview = requirePayloadString(type, payload, "contentPreview");
  const entryId = optionalPayloadString(type, payload, "entryId");
  const lifecycleStatus = requirePayloadLiteral(
    type,
    payload,
    "lifecycleStatus",
    MEMORY_CANDIDATE_LIFECYCLE_STATUSES
  );
  const memoryType = requirePayloadLiteral(
    type,
    payload,
    "memoryType",
    MEMORY_TYPES
  );
  const provenance = requirePayloadString(type, payload, "provenance");
  const reason = optionalPayloadString(type, payload, "reason");
  const sensitivityStatus = requirePayloadLiteral(
    type,
    payload,
    "sensitivityStatus",
    MEMORY_SENSITIVITY_STATUSES
  );
  const sourceEventIds = requirePayloadStringArray(
    type,
    payload,
    "sourceEventIds"
  );
  const sourceTaskId = optionalPayloadString(type, payload, "sourceTaskId");
  const status = requirePayloadLiteral(
    type,
    payload,
    "status",
    MEMORY_CANDIDATE_LIFECYCLE_STATUSES
  );
  const summary = requirePayloadString(type, payload, "summary");
  const checks = [
    action,
    candidateId,
    confidence,
    contentPreview,
    entryId,
    lifecycleStatus,
    memoryType,
    provenance,
    reason,
    sensitivityStatus,
    sourceEventIds,
    sourceTaskId,
    status,
    summary
  ];
  const failed = checks.find((check) => !check.ok);

  if (failed !== undefined && !failed.ok) {
    return err(failed.error);
  }

  if (
    !candidateId.ok ||
    !/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidateId.value)
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field 'candidateId' must use the memcand_ prefix.`
      )
    );
  }

  if (
    entryId.ok &&
    entryId.value !== undefined &&
    !/^mem_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entryId.value)
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field 'entryId' must use the mem_ prefix.`
      )
    );
  }

  if (
    !action.ok ||
    !confidence.ok ||
    !contentPreview.ok ||
    !entryId.ok ||
    !lifecycleStatus.ok ||
    !memoryType.ok ||
    !provenance.ok ||
    !reason.ok ||
    !sensitivityStatus.ok ||
    !sourceEventIds.ok ||
    !sourceTaskId.ok ||
    !status.ok ||
    !summary.ok
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload is invalid.`
      )
    );
  }

  if (status.value !== lifecycleStatus.value) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' status must match lifecycleStatus.`
      )
    );
  }

  if (
    !isMemoryCandidateReviewLifecycleConsistent(
      action.value,
      lifecycleStatus.value
    )
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' action must match lifecycleStatus.`
      )
    );
  }

  const secretCheckedFields = [
    ["action", action.value],
    ["candidateId", candidateId.value],
    ["contentPreview", contentPreview.value],
    ...(entryId.value === undefined
      ? []
      : [["entryId", entryId.value] as const]),
    ["lifecycleStatus", lifecycleStatus.value],
    ["memoryType", memoryType.value],
    ["provenance", provenance.value],
    ...(reason.value === undefined ? [] : [["reason", reason.value] as const]),
    ["sensitivityStatus", sensitivityStatus.value],
    ...(sourceTaskId.value === undefined
      ? []
      : [["sourceTaskId", sourceTaskId.value] as const]),
    ["status", status.value],
    ["summary", summary.value],
    ...sourceEventIds.value.map(
      (eventId) => ["sourceEventIds", eventId] as const
    )
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    action: action.value,
    candidateId: candidateId.value,
    confidence: confidence.value,
    contentPreview: contentPreview.value,
    ...(entryId.value === undefined ? {} : { entryId: entryId.value }),
    lifecycleStatus: lifecycleStatus.value,
    memoryType: memoryType.value,
    provenance: provenance.value,
    ...(reason.value === undefined ? {} : { reason: reason.value }),
    sensitivityStatus: sensitivityStatus.value,
    sourceEventIds: sourceEventIds.value,
    ...(sourceTaskId.value === undefined
      ? {}
      : { sourceTaskId: sourceTaskId.value }),
    status: status.value,
    summary: summary.value
  });
}

function isMemoryCandidateReviewLifecycleConsistent(
  action: MemoryCandidateReviewAction,
  lifecycleStatus: MemoryCandidateLifecycleStatus
): boolean {
  switch (action) {
    case "accept":
      return lifecycleStatus === "accepted";
    case "reject":
      return lifecycleStatus === "rejected";
    case "edit":
      return lifecycleStatus === "edited";
  }
}

function validateMemoryEntrySavedEvent(
  context: RuntimeEventContext,
  type: "memory.entry.saved",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"memory.entry.saved">, SpriteError> {
  const validation = validateMemoryLifecyclePayload(type, payload, {
    idField: "entryId",
    idPattern: /^mem_[A-Za-z0-9][A-Za-z0-9_-]*$/,
    memoryTypes: DURABLE_MEMORY_TYPES,
    sensitivityStatuses: ["non_sensitive"] as const
  });

  if (!validation.ok) {
    return err(validation.error);
  }

  const autoSaved = requirePayloadBoolean(type, payload, "autoSaved");
  const candidateId = requirePayloadString(type, payload, "candidateId");

  if (!autoSaved.ok) {
    return err(autoSaved.error);
  }

  if (!candidateId.ok) {
    return err(candidateId.error);
  }

  if (!/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidateId.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field 'candidateId' must use the memcand_ prefix.`
      )
    );
  }

  if (containsSecretLikeValue(candidateId.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload candidateId must not include secret-looking values.`
      )
    );
  }

  return okRuntimeEvent(context, type, {
    autoSaved: autoSaved.value,
    candidateId: candidateId.value,
    confidence: validation.value.confidence,
    contentPreview: validation.value.contentPreview,
    entryId: validation.value.id,
    memoryType: validation.value.memoryType as DurableMemoryType,
    provenance: validation.value.provenance,
    sensitivityStatus: "non_sensitive",
    sourceEventIds: validation.value.sourceEventIds,
    ...(validation.value.sourceTaskId === undefined
      ? {}
      : { sourceTaskId: validation.value.sourceTaskId }),
    status: validation.value.status,
    summary: validation.value.summary
  });
}

function validateMemoryInfluenceRecordedEvent(
  context: RuntimeEventContext,
  type: "memory.influence.recorded",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"memory.influence.recorded">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const evidenceEventIds = requirePayloadStringArray(
    type,
    payload,
    "evidenceEventIds"
  );
  const influenceSummary = optionalPayloadString(
    type,
    payload,
    "influenceSummary"
  );
  const preview = requirePayloadString(type, payload, "preview");
  const reason = optionalPayloadString(type, payload, "reason");
  const sourceEventIds = requirePayloadStringArray(
    type,
    payload,
    "sourceEventIds"
  );
  const sourceId = requirePayloadString(type, payload, "sourceId");
  const sourceSessionId = optionalPayloadString(
    type,
    payload,
    "sourceSessionId"
  );
  const sourceTaskId = optionalPayloadString(type, payload, "sourceTaskId");
  const sourceType = requirePayloadLiteral(
    type,
    payload,
    "sourceType",
    MEMORY_INFLUENCE_SOURCE_TYPES
  );
  const status = requirePayloadLiteral(
    type,
    payload,
    "status",
    MEMORY_INFLUENCE_STATUSES
  );
  const summary = requirePayloadString(type, payload, "summary");
  const checks = [
    evidenceEventIds,
    influenceSummary,
    preview,
    reason,
    sourceEventIds,
    sourceId,
    sourceSessionId,
    sourceTaskId,
    sourceType,
    status,
    summary
  ];
  const failed = checks.find((check) => !check.ok);

  if (failed !== undefined && !failed.ok) {
    return err(failed.error);
  }

  if (
    !evidenceEventIds.ok ||
    !influenceSummary.ok ||
    !preview.ok ||
    !reason.ok ||
    !sourceEventIds.ok ||
    !sourceId.ok ||
    !sourceSessionId.ok ||
    !sourceTaskId.ok ||
    !sourceType.ok ||
    !status.ok ||
    !summary.ok
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload is invalid.`
      )
    );
  }

  if (evidenceEventIds.value.length === 0 || sourceEventIds.value.length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must include evidenceEventIds and sourceEventIds.`
      )
    );
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(sourceId.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload sourceId must be a safe identifier.`
      )
    );
  }

  if (status.value === "used" && influenceSummary.value === undefined) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload influenceSummary is required when status is used.`
      )
    );
  }

  if (
    (status.value === "ignored" || status.value === "contradicted") &&
    reason.value === undefined
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload reason is required when status is ${status.value}.`
      )
    );
  }

  const secretCheckedFields = [
    ["preview", preview.value],
    ["sourceId", sourceId.value],
    ["sourceType", sourceType.value],
    ["status", status.value],
    ["summary", summary.value],
    ...(influenceSummary.value === undefined
      ? []
      : [["influenceSummary", influenceSummary.value] as const]),
    ...(reason.value === undefined
      ? []
      : [["reason", reason.value] as const]),
    ...(sourceSessionId.value === undefined
      ? []
      : [["sourceSessionId", sourceSessionId.value] as const]),
    ...(sourceTaskId.value === undefined
      ? []
      : [["sourceTaskId", sourceTaskId.value] as const]),
    ...evidenceEventIds.value.map(
      (eventId) => ["evidenceEventIds", eventId] as const
    ),
    ...sourceEventIds.value.map(
      (eventId) => ["sourceEventIds", eventId] as const
    )
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    evidenceEventIds: evidenceEventIds.value,
    ...(influenceSummary.value === undefined
      ? {}
      : { influenceSummary: influenceSummary.value }),
    preview: preview.value,
    ...(reason.value === undefined ? {} : { reason: reason.value }),
    sourceEventIds: sourceEventIds.value,
    sourceId: sourceId.value,
    ...(sourceSessionId.value === undefined
      ? {}
      : { sourceSessionId: sourceSessionId.value }),
    ...(sourceTaskId.value === undefined
      ? {}
      : { sourceTaskId: sourceTaskId.value }),
    sourceType: sourceType.value,
    status: status.value,
    summary: summary.value
  });
}

function validateMemoryLifecyclePayload(
  type: "memory.candidate.created" | "memory.entry.saved",
  payload: Record<string, unknown>,
  options: {
    idField: "candidateId" | "entryId";
    idPattern: RegExp;
    memoryTypes: readonly string[];
    sensitivityStatuses: readonly string[];
  }
): Result<
  {
    confidence: MemoryConfidence;
    contentPreview: string;
    id: string;
    memoryType: string;
    provenance: string;
    sensitivityStatus: string;
    sourceEventIds: string[];
    sourceTaskId?: string;
    status: "recorded";
    summary: string;
  },
  SpriteError
> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const id = requirePayloadString(type, payload, options.idField);
  const confidence = requirePayloadLiteral(
    type,
    payload,
    "confidence",
    MEMORY_CONFIDENCE_VALUES
  );
  const contentPreview = requirePayloadString(type, payload, "contentPreview");
  const memoryType = requirePayloadLiteral(
    type,
    payload,
    "memoryType",
    options.memoryTypes
  );
  const provenance = requirePayloadString(type, payload, "provenance");
  const sensitivityStatus = requirePayloadLiteral(
    type,
    payload,
    "sensitivityStatus",
    options.sensitivityStatuses
  );
  const sourceEventIds = requirePayloadStringArray(
    type,
    payload,
    "sourceEventIds"
  );
  const sourceTaskId = optionalPayloadString(type, payload, "sourceTaskId");
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");

  const checks = [
    id,
    confidence,
    contentPreview,
    memoryType,
    provenance,
    sensitivityStatus,
    sourceEventIds,
    sourceTaskId,
    status,
    summary
  ];
  const failed = checks.find((check) => !check.ok);

  if (failed !== undefined && !failed.ok) {
    return err(failed.error);
  }

  if (!id.ok || !options.idPattern.test(id.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field '${options.idField}' has an invalid ID prefix.`
      )
    );
  }

  if (
    !confidence.ok ||
    !contentPreview.ok ||
    !memoryType.ok ||
    !provenance.ok ||
    !sensitivityStatus.ok ||
    !sourceEventIds.ok ||
    !sourceTaskId.ok ||
    !status.ok ||
    !summary.ok
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload is invalid.`
      )
    );
  }

  const secretCheckedFields = [
    [options.idField, id.value],
    ["contentPreview", contentPreview.value],
    ["memoryType", memoryType.value],
    ["provenance", provenance.value],
    ["sensitivityStatus", sensitivityStatus.value],
    ["summary", summary.value],
    ...(sourceTaskId.value === undefined
      ? []
      : [["sourceTaskId", sourceTaskId.value] as const]),
    ...sourceEventIds.value.map(
      (eventId) => ["sourceEventIds", eventId] as const
    )
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return {
    ok: true,
    value: {
      confidence: confidence.value,
      contentPreview: contentPreview.value,
      id: id.value,
      memoryType: memoryType.value,
      provenance: provenance.value,
      sensitivityStatus: sensitivityStatus.value,
      sourceEventIds: sourceEventIds.value,
      ...(sourceTaskId.value === undefined
        ? {}
        : { sourceTaskId: sourceTaskId.value }),
      status: status.value,
      summary: summary.value
    }
  };
}

function validateSessionResumedEvent(
  context: RuntimeEventContext,
  type: "session.resumed",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"session.resumed">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null || "rawEventPayload" in payload) {
    const field = forbiddenField ?? "rawEventPayload";

    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${field}'.`
      )
    );
  }
  const currentPhase = requirePayloadLiteral(
    type,
    payload,
    "currentPhase",
    RUNTIME_LOOP_PHASES
  );
  const nextStep = optionalPayloadString(type, payload, "nextStep");
  const restoredEventCount = requireNonNegativeInteger(
    type,
    payload,
    "restoredEventCount"
  );
  const restoredTaskStatus = requirePayloadLiteral(
    type,
    payload,
    "restoredTaskStatus",
    TASK_EXECUTION_STATUSES
  );
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");

  if (currentPhase.ok === false) {
    return err(currentPhase.error);
  }
  if (nextStep.ok === false) {
    return err(nextStep.error);
  }
  if (restoredEventCount.ok === false) {
    return err(restoredEventCount.error);
  }
  if (restoredTaskStatus.ok === false) {
    return err(restoredTaskStatus.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }
  if (summary.ok === false) {
    return err(summary.error);
  }

  const secretCheckedFields = [
    ["nextStep", nextStep.value],
    ["summary", summary.value]
  ] as const;
  for (const [field, value] of secretCheckedFields) {
    if (value !== undefined && containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${field}' contains a secret-like value.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    currentPhase: currentPhase.value,
    ...(nextStep.value === undefined ? {} : { nextStep: nextStep.value }),
    restoredEventCount: restoredEventCount.value,
    restoredTaskStatus: restoredTaskStatus.value,
    status: status.value,
    summary: summary.value
  });
}

function validateSessionCompactedEvent(
  context: RuntimeEventContext,
  type: "session.compacted",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"session.compacted">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null || "rawEventPayload" in payload) {
    const field = forbiddenField ?? "rawEventPayload";

    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${field}'.`
      )
    );
  }

  const artifactId = requirePayloadString(type, payload, "artifactId");
  const firstRetainedEventId = optionalPayloadString(
    type,
    payload,
    "firstRetainedEventId"
  );
  const previousCompactionArtifactId = optionalPayloadString(
    type,
    payload,
    "previousCompactionArtifactId"
  );
  const sourceEventCount = requireNonNegativeInteger(
    type,
    payload,
    "sourceEventCount"
  );
  const sourceFirstEventId = requirePayloadString(
    type,
    payload,
    "sourceFirstEventId"
  );
  const sourceLastEventId = requirePayloadString(
    type,
    payload,
    "sourceLastEventId"
  );
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const triggerReason = requirePayloadLiteral(
    type,
    payload,
    "triggerReason",
    SESSION_COMPACTION_TRIGGER_REASONS
  );

  if (artifactId.ok === false) {
    return err(artifactId.error);
  }
  if (firstRetainedEventId.ok === false) {
    return err(firstRetainedEventId.error);
  }
  if (previousCompactionArtifactId.ok === false) {
    return err(previousCompactionArtifactId.error);
  }
  if (sourceEventCount.ok === false) {
    return err(sourceEventCount.error);
  }
  if (sourceFirstEventId.ok === false) {
    return err(sourceFirstEventId.error);
  }
  if (sourceLastEventId.ok === false) {
    return err(sourceLastEventId.error);
  }
  if (status.ok === false) {
    return err(status.error);
  }
  if (summary.ok === false) {
    return err(summary.error);
  }
  if (triggerReason.ok === false) {
    return err(triggerReason.error);
  }

  if (sourceEventCount.value === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field 'sourceEventCount' must be greater than zero.`
      )
    );
  }

  if (!/^cmp-[a-z0-9][a-z0-9-]*$/u.test(artifactId.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field 'artifactId' must be a valid compaction artifact ID.`
      )
    );
  }

  if (
    previousCompactionArtifactId.value !== undefined &&
    !/^cmp-[a-z0-9][a-z0-9-]*$/u.test(previousCompactionArtifactId.value)
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field 'previousCompactionArtifactId' must be a valid compaction artifact ID.`
      )
    );
  }

  const secretCheckedFields = [
    ["artifactId", artifactId.value],
    ["firstRetainedEventId", firstRetainedEventId.value],
    ["previousCompactionArtifactId", previousCompactionArtifactId.value],
    ["sourceFirstEventId", sourceFirstEventId.value],
    ["sourceLastEventId", sourceLastEventId.value],
    ["summary", summary.value]
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (value !== undefined && containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${field}' contains a secret-like value.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    artifactId: artifactId.value,
    ...(firstRetainedEventId.value === undefined
      ? {}
      : { firstRetainedEventId: firstRetainedEventId.value }),
    ...(previousCompactionArtifactId.value === undefined
      ? {}
      : { previousCompactionArtifactId: previousCompactionArtifactId.value }),
    sourceEventCount: sourceEventCount.value,
    sourceFirstEventId: sourceFirstEventId.value,
    sourceLastEventId: sourceLastEventId.value,
    status: status.value,
    summary: summary.value,
    triggerReason: triggerReason.value
  });
}

function validateTaskRecoveryRecordedEvent(
  context: RuntimeEventContext,
  type: "task.recovery.recorded",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"task.recovery.recorded">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const decision = requirePayloadLiteral(
    type,
    payload,
    "decision",
    RECOVERY_DECISIONS
  );
  const errorCode = optionalPayloadString(type, payload, "errorCode");
  const message = optionalPayloadString(type, payload, "message");
  const nextAction = requirePayloadString(type, payload, "nextAction");
  const ruleId = optionalPayloadString(type, payload, "ruleId");
  const sourceEventId = optionalPayloadString(type, payload, "sourceEventId");
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const toolCallId = optionalPayloadString(type, payload, "toolCallId");
  const trigger = requirePayloadLiteral(
    type,
    payload,
    "trigger",
    RECOVERY_TRIGGERS
  );
  const validationId = optionalPayloadString(type, payload, "validationId");

  if (decision.ok === false) {
    return err(decision.error);
  }

  if (errorCode.ok === false) {
    return err(errorCode.error);
  }

  if (message.ok === false) {
    return err(message.error);
  }

  if (nextAction.ok === false) {
    return err(nextAction.error);
  }

  if (ruleId.ok === false) {
    return err(ruleId.error);
  }

  if (sourceEventId.ok === false) {
    return err(sourceEventId.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (trigger.ok === false) {
    return err(trigger.error);
  }

  if (validationId.ok === false) {
    return err(validationId.error);
  }

  const secretCheckedFields = [
    ["errorCode", errorCode.value],
    ["message", message.value],
    ["nextAction", nextAction.value],
    ["ruleId", ruleId.value],
    ["sourceEventId", sourceEventId.value],
    ["summary", summary.value],
    ["toolCallId", toolCallId.value],
    ["validationId", validationId.value]
  ] as const;

  for (const [field, value] of secretCheckedFields) {
    if (value !== undefined && containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload ${field} must not include secret-looking values.`
        )
      );
    }
  }

  return okRuntimeEvent(context, type, {
    decision: decision.value,
    ...(errorCode.value === undefined ? {} : { errorCode: errorCode.value }),
    ...(message.value === undefined ? {} : { message: message.value }),
    nextAction: nextAction.value,
    ...(ruleId.value === undefined ? {} : { ruleId: ruleId.value }),
    ...(sourceEventId.value === undefined
      ? {}
      : { sourceEventId: sourceEventId.value }),
    status: status.value,
    summary: summary.value,
    ...(toolCallId.value === undefined ? {} : { toolCallId: toolCallId.value }),
    trigger: trigger.value,
    ...(validationId.value === undefined
      ? {}
      : { validationId: validationId.value })
  });
}

function validatePolicyDecisionEvent(
  context: RuntimeEventContext,
  type: "policy.decision.recorded",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"policy.decision.recorded">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const action = requirePayloadLiteral(type, payload, "action", POLICY_ACTIONS);
  const affectedFiles = optionalPayloadPathArray(
    type,
    payload,
    "affectedFiles"
  );
  const command = optionalPayloadString(type, payload, "command");
  const cwd = optionalPayloadString(type, payload, "cwd");
  const envExposure = optionalPayloadLiteral(type, payload, "envExposure", [
    "custom",
    "none"
  ] as const);
  const reason = requirePayloadString(type, payload, "reason");
  const requestType = requirePayloadLiteral(
    type,
    payload,
    "requestType",
    POLICY_REQUEST_TYPES
  );
  const riskLevel = requirePayloadLiteral(
    type,
    payload,
    "riskLevel",
    POLICY_RISK_LEVELS
  );
  const ruleId = requirePayloadString(type, payload, "ruleId");
  const status = requirePayloadLiteral(type, payload, "status", [
    "recorded"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const timeoutMs = optionalNonNegativeInteger(type, payload, "timeoutMs");

  if (action.ok === false) {
    return err(action.error);
  }

  if (affectedFiles.ok === false) {
    return err(affectedFiles.error);
  }

  if (command.ok === false) {
    return err(command.error);
  }

  if (cwd.ok === false) {
    return err(cwd.error);
  }

  if (envExposure.ok === false) {
    return err(envExposure.error);
  }

  if (reason.ok === false) {
    return err(reason.error);
  }

  if (containsSecretLikeValue(reason.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload reason must not include secret-looking values.`
      )
    );
  }

  if (requestType.ok === false) {
    return err(requestType.error);
  }

  if (riskLevel.ok === false) {
    return err(riskLevel.error);
  }

  if (ruleId.ok === false) {
    return err(ruleId.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (command.value !== undefined && containsSecretLikeValue(command.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload command must not include secret-looking values.`
      )
    );
  }

  if (timeoutMs.ok === false) {
    return err(timeoutMs.error);
  }

  return okRuntimeEvent(context, type, {
    action: action.value,
    ...(affectedFiles.value === undefined
      ? {}
      : { affectedFiles: affectedFiles.value }),
    ...(command.value === undefined ? {} : { command: command.value }),
    ...(cwd.value === undefined ? {} : { cwd: cwd.value }),
    ...(envExposure.value === undefined
      ? {}
      : { envExposure: envExposure.value }),
    reason: reason.value,
    requestType: requestType.value,
    riskLevel: riskLevel.value,
    ruleId: ruleId.value,
    status: status.value,
    summary: summary.value,
    ...(timeoutMs.value === undefined ? {} : { timeoutMs: timeoutMs.value })
  });
}

function validateApprovalRequestedEvent(
  context: RuntimeEventContext,
  type: "approval.requested",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"approval.requested">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const affectedFiles = optionalPayloadPathArray(
    type,
    payload,
    "affectedFiles"
  );
  const allowedActions = requirePayloadLiteralArray(
    type,
    payload,
    "allowedActions",
    APPROVAL_ACTIONS
  );
  const approvalRequestId = requirePayloadString(
    type,
    payload,
    "approvalRequestId"
  );
  const command = optionalPayloadString(type, payload, "command");
  const cwd = optionalPayloadString(type, payload, "cwd");
  const envExposure = optionalPayloadLiteral(type, payload, "envExposure", [
    "custom",
    "none"
  ] as const);
  const reason = requirePayloadString(type, payload, "reason");
  const requestType = requirePayloadLiteral(
    type,
    payload,
    "requestType",
    POLICY_REQUEST_TYPES
  );
  const riskLevel = requirePayloadLiteral(
    type,
    payload,
    "riskLevel",
    POLICY_RISK_LEVELS
  );
  const ruleId = requirePayloadString(type, payload, "ruleId");
  const status = requirePayloadLiteral(type, payload, "status", [
    "pending"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const timeoutMs = optionalNonNegativeInteger(type, payload, "timeoutMs");
  const toolCallId = optionalPayloadString(type, payload, "toolCallId");

  if (affectedFiles.ok === false) {
    return err(affectedFiles.error);
  }

  if (allowedActions.ok === false) {
    return err(allowedActions.error);
  }

  if (approvalRequestId.ok === false) {
    return err(approvalRequestId.error);
  }

  if (command.ok === false) {
    return err(command.error);
  }

  if (cwd.ok === false) {
    return err(cwd.error);
  }

  if (envExposure.ok === false) {
    return err(envExposure.error);
  }

  if (reason.ok === false) {
    return err(reason.error);
  }

  if (containsSecretLikeValue(reason.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload reason must not include secret-looking values.`
      )
    );
  }

  if (requestType.ok === false) {
    return err(requestType.error);
  }

  if (riskLevel.ok === false) {
    return err(riskLevel.error);
  }

  if (ruleId.ok === false) {
    return err(ruleId.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (command.value !== undefined && containsSecretLikeValue(command.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload command must not include secret-looking values.`
      )
    );
  }

  if (timeoutMs.ok === false) {
    return err(timeoutMs.error);
  }

  if (timeoutMs.value === undefined) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload timeoutMs must be provided.`
      )
    );
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  return okRuntimeEvent(context, type, {
    ...(affectedFiles.value === undefined
      ? {}
      : { affectedFiles: affectedFiles.value }),
    allowedActions: allowedActions.value,
    approvalRequestId: approvalRequestId.value,
    ...(command.value === undefined ? {} : { command: command.value }),
    ...(cwd.value === undefined ? {} : { cwd: cwd.value }),
    ...(envExposure.value === undefined
      ? {}
      : { envExposure: envExposure.value }),
    reason: reason.value,
    requestType: requestType.value,
    riskLevel: riskLevel.value,
    ruleId: ruleId.value,
    status: status.value,
    summary: summary.value,
    timeoutMs: timeoutMs.value,
    ...(toolCallId.value === undefined ? {} : { toolCallId: toolCallId.value })
  });
}

function validateApprovalResolvedEvent(
  context: RuntimeEventContext,
  type: "approval.resolved",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"approval.resolved">, SpriteError> {
  const forbiddenField = findForbiddenPolicyPayloadField(
    payload,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  const approvalRequestId = requirePayloadString(
    type,
    payload,
    "approvalRequestId"
  );
  const decision = requirePayloadLiteral(
    type,
    payload,
    "decision",
    APPROVAL_DECISIONS
  );
  const reason = optionalPayloadString(type, payload, "reason");
  const requestType = requirePayloadLiteral(
    type,
    payload,
    "requestType",
    POLICY_REQUEST_TYPES
  );
  const status = requirePayloadLiteral(type, payload, "status", [
    "resolved"
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const toolCallId = optionalPayloadString(type, payload, "toolCallId");

  if (approvalRequestId.ok === false) {
    return err(approvalRequestId.error);
  }

  if (decision.ok === false) {
    return err(decision.error);
  }

  if (reason.ok === false) {
    return err(reason.error);
  }

  if (reason.value !== undefined && containsSecretLikeValue(reason.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload reason must not include secret-looking values.`
      )
    );
  }

  if (requestType.ok === false) {
    return err(requestType.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  return okRuntimeEvent(context, type, {
    approvalRequestId: approvalRequestId.value,
    decision: decision.value,
    ...(reason.value === undefined ? {} : { reason: reason.value }),
    requestType: requestType.value,
    status: status.value,
    summary: summary.value,
    ...(toolCallId.value === undefined ? {} : { toolCallId: toolCallId.value })
  });
}

function validateValidationStartedEvent(
  context: RuntimeEventContext,
  type: "validation.started",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"validation.started">, SpriteError> {
  const forbiddenField = findForbiddenToolPayloadField(payload);

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw content field '${forbiddenField}'.`
      )
    );
  }

  const command = requirePayloadString(type, payload, "command");
  const cwd = requirePayloadString(type, payload, "cwd");
  const name = optionalPayloadString(type, payload, "name");
  const status = requirePayloadLiteral(
    type,
    payload,
    "status",
    VALIDATION_STARTED_STATUSES
  );
  const summary = requirePayloadString(type, payload, "summary");
  const timeoutMs = optionalNonNegativeInteger(type, payload, "timeoutMs");
  const toolCallId = requirePayloadString(type, payload, "toolCallId");
  const validationId = requirePayloadString(type, payload, "validationId");

  if (command.ok === false) {
    return err(command.error);
  }

  if (containsSecretLikeValue(command.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload command must not include secret-looking values.`
      )
    );
  }

  if (cwd.ok === false) {
    return err(cwd.error);
  }

  if (name.ok === false) {
    return err(name.error);
  }

  if (name.value !== undefined && containsSecretLikeValue(name.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload name must not include secret-looking values.`
      )
    );
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (timeoutMs.ok === false) {
    return err(timeoutMs.error);
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (validationId.ok === false) {
    return err(validationId.error);
  }

  return okRuntimeEvent(context, type, {
    command: command.value,
    cwd: cwd.value,
    ...(name.value === undefined ? {} : { name: name.value }),
    status: status.value,
    summary: summary.value,
    ...(timeoutMs.value === undefined ? {} : { timeoutMs: timeoutMs.value }),
    toolCallId: toolCallId.value,
    validationId: validationId.value
  });
}

function validateValidationCompletedEvent(
  context: RuntimeEventContext,
  type: "validation.completed",
  payload: Record<string, unknown>
): Result<RuntimeEventRecord<"validation.completed">, SpriteError> {
  const forbiddenField = findForbiddenToolPayloadField(payload);

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw content field '${forbiddenField}'.`
      )
    );
  }

  const command = optionalPayloadString(type, payload, "command");
  const cwd = optionalPayloadString(type, payload, "cwd");
  const durationMs = optionalNonNegativeInteger(type, payload, "durationMs");
  const errorCode = optionalPayloadString(type, payload, "errorCode");
  const exitCode = optionalExitCode(type, payload, "exitCode");
  const message = optionalPayloadString(type, payload, "message");
  const name = optionalPayloadString(type, payload, "name");
  const outputReference = optionalOutputReference(type, payload);
  const status = requirePayloadLiteral(
    type,
    payload,
    "status",
    VALIDATION_COMPLETED_STATUSES
  );
  const summary = requirePayloadString(type, payload, "summary");
  const timeoutMs = optionalNonNegativeInteger(type, payload, "timeoutMs");
  const toolCallId = optionalPayloadString(type, payload, "toolCallId");
  const validationId = requirePayloadString(type, payload, "validationId");

  if (command.ok === false) {
    return err(command.error);
  }

  if (command.value !== undefined && containsSecretLikeValue(command.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload command must not include secret-looking values.`
      )
    );
  }

  if (cwd.ok === false) {
    return err(cwd.error);
  }

  if (durationMs.ok === false) {
    return err(durationMs.error);
  }

  if (errorCode.ok === false) {
    return err(errorCode.error);
  }

  if (exitCode.ok === false) {
    return err(exitCode.error);
  }

  if (message.ok === false) {
    return err(message.error);
  }

  if (message.value !== undefined && containsSecretLikeValue(message.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload message must not include secret-looking values.`
      )
    );
  }

  if (name.ok === false) {
    return err(name.error);
  }

  if (name.value !== undefined && containsSecretLikeValue(name.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload name must not include secret-looking values.`
      )
    );
  }

  if (outputReference.ok === false) {
    return err(outputReference.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (timeoutMs.ok === false) {
    return err(timeoutMs.error);
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (validationId.ok === false) {
    return err(validationId.error);
  }

  return okRuntimeEvent(context, type, {
    ...(command.value === undefined ? {} : { command: command.value }),
    ...(cwd.value === undefined ? {} : { cwd: cwd.value }),
    ...(durationMs.value === undefined ? {} : { durationMs: durationMs.value }),
    ...(errorCode.value === undefined ? {} : { errorCode: errorCode.value }),
    ...(exitCode.value === undefined ? {} : { exitCode: exitCode.value }),
    ...(message.value === undefined ? {} : { message: message.value }),
    ...(name.value === undefined ? {} : { name: name.value }),
    ...(outputReference.value === undefined
      ? {}
      : { outputReference: outputReference.value }),
    status: status.value,
    summary: summary.value,
    ...(timeoutMs.value === undefined ? {} : { timeoutMs: timeoutMs.value }),
    ...(toolCallId.value === undefined ? {} : { toolCallId: toolCallId.value }),
    validationId: validationId.value
  });
}

function validateFileEditEvent(
  context: RuntimeEventContext,
  type: "file.edit.applied" | "file.edit.failed" | "file.edit.requested",
  payload: Record<string, unknown>
): Result<
  RuntimeEventRecord<
    "file.edit.applied" | "file.edit.failed" | "file.edit.requested"
  >,
  SpriteError
> {
  const forbiddenField = findForbiddenFileActivityField(payload);

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw content field '${forbiddenField}'.`
      )
    );
  }

  const editId = requirePayloadString(type, payload, "editId");
  const affectedFiles = requirePayloadPathArray(type, payload, "affectedFiles");
  const status = requirePayloadLiteral(type, payload, "status", [
    expectedFileEditStatus(type)
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const toolCallId = requirePayloadString(type, payload, "toolCallId");
  const toolName = requirePayloadLiteral(type, payload, "toolName", [
    "apply_patch"
  ] as const);

  if (editId.ok === false) {
    return err(editId.error);
  }

  if (affectedFiles.ok === false) {
    return err(affectedFiles.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (containsSecretLikeValue(summary.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload summary must not include secret-looking values.`
      )
    );
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (toolName.ok === false) {
    return err(toolName.error);
  }

  if (type === "file.edit.failed") {
    const errorCode = requirePayloadString(type, payload, "errorCode");
    const message = requirePayloadString(type, payload, "message");

    if (errorCode.ok === false) {
      return err(errorCode.error);
    }

    if (message.ok === false) {
      return err(message.error);
    }

    if (containsSecretLikeValue(message.value)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload message must not include secret-looking values.`
        )
      );
    }

    return okRuntimeEvent(context, type, {
      affectedFiles: affectedFiles.value,
      editId: editId.value,
      errorCode: errorCode.value,
      message: message.value,
      status: "failed",
      summary: summary.value,
      toolCallId: toolCallId.value,
      toolName: toolName.value
    });
  }

  return okRuntimeEvent(context, type, {
    affectedFiles: affectedFiles.value,
    editId: editId.value,
    status: type === "file.edit.applied" ? "applied" : "requested",
    summary: summary.value,
    toolCallId: toolCallId.value,
    toolName: toolName.value
  });
}

function validateToolLifecycleEvent<T extends RuntimeEventType>(
  context: RuntimeEventContext,
  type: T,
  payload: Record<string, unknown>,
  expectedStatus: string
): Result<RuntimeEventRecord<T>, SpriteError> {
  const forbiddenField = findForbiddenToolPayloadField(payload);

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw content field '${forbiddenField}'.`
      )
    );
  }

  const cwd = requirePayloadString(type, payload, "cwd");
  const status = requirePayloadLiteral(type, payload, "status", [
    expectedStatus
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const toolCallId = requirePayloadString(type, payload, "toolCallId");
  const toolName = requirePayloadLiteral(type, payload, "toolName", TOOL_NAMES);

  if (cwd.ok === false) {
    return err(cwd.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (toolName.ok === false) {
    return err(toolName.error);
  }

  const targetPath = optionalPayloadString(type, payload, "targetPath");
  const query = optionalPayloadString(type, payload, "query");
  const command = optionalPayloadString(type, payload, "command");
  const timeoutMs = optionalNonNegativeInteger(type, payload, "timeoutMs");

  if (targetPath.ok === false) {
    return err(targetPath.error);
  }

  if (query.ok === false) {
    return err(query.error);
  }

  if (command.ok === false) {
    return err(command.error);
  }

  if (timeoutMs.ok === false) {
    return err(timeoutMs.error);
  }

  if (command.value !== undefined && containsSecretLikeValue(command.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload command must not include secret-looking values.`
      )
    );
  }

  const basePayload = {
    ...(command.value === undefined ? {} : { command: command.value }),
    cwd: cwd.value,
    ...(query.value === undefined ? {} : { query: query.value }),
    status: status.value,
    summary: summary.value,
    ...(targetPath.value === undefined ? {} : { targetPath: targetPath.value }),
    ...(timeoutMs.value === undefined ? {} : { timeoutMs: timeoutMs.value }),
    toolCallId: toolCallId.value,
    toolName: toolName.value
  };

  if (type === "tool.call.completed") {
    const durationMs = optionalNonNegativeInteger(type, payload, "durationMs");
    const exitCode = optionalExitCode(type, payload, "exitCode");
    const outputReference = optionalOutputReference(type, payload);

    if (durationMs.ok === false) {
      return err(durationMs.error);
    }

    if (exitCode.ok === false) {
      return err(exitCode.error);
    }

    if (outputReference.ok === false) {
      return err(outputReference.error);
    }

    return okRuntimeEvent(context, type, {
      ...basePayload,
      ...(durationMs.value === undefined
        ? {}
        : { durationMs: durationMs.value }),
      ...(exitCode.value === undefined ? {} : { exitCode: exitCode.value }),
      ...(outputReference.value === undefined
        ? {}
        : { outputReference: outputReference.value })
    } as RuntimeEventPayload<T>);
  }

  if (type === "tool.call.failed") {
    const durationMs = optionalNonNegativeInteger(type, payload, "durationMs");
    const errorCode = requirePayloadString(type, payload, "errorCode");
    const exitCode = optionalExitCode(type, payload, "exitCode");
    const message = requirePayloadString(type, payload, "message");
    const outputReference = optionalOutputReference(type, payload);

    if (durationMs.ok === false) {
      return err(durationMs.error);
    }

    if (errorCode.ok === false) {
      return err(errorCode.error);
    }

    if (exitCode.ok === false) {
      return err(exitCode.error);
    }

    if (message.ok === false) {
      return err(message.error);
    }

    if (outputReference.ok === false) {
      return err(outputReference.error);
    }

    return okRuntimeEvent(context, type, {
      ...basePayload,
      ...(durationMs.value === undefined
        ? {}
        : { durationMs: durationMs.value }),
      errorCode: errorCode.value,
      ...(exitCode.value === undefined ? {} : { exitCode: exitCode.value }),
      message: message.value,
      ...(outputReference.value === undefined
        ? {}
        : { outputReference: outputReference.value })
    } as RuntimeEventPayload<T>);
  }

  return okRuntimeEvent(context, type, basePayload as RuntimeEventPayload<T>);
}

function okRuntimeEvent<T extends RuntimeEventType>(
  context: RuntimeEventContext,
  type: T,
  payload: RuntimeEventPayload<T>
): Result<RuntimeEventRecord<T>, SpriteError> {
  return { ok: true, value: createRuntimeEventRecord(context, type, payload) };
}

function requireStringField(
  event: Record<string, unknown>,
  field: string
): Result<string, SpriteError> {
  const value = event[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event field '${field}' must be a non-empty string.`
      )
    );
  }

  return { ok: true, value };
}

function requirePayloadString(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string, SpriteError> {
  const value = payload[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' is missing required payload field '${key}'.`
      )
    );
  }

  return { ok: true, value };
}

function optionalPayloadString(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string | undefined, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field '${key}' must be a non-empty string when provided.`
      )
    );
  }

  return { ok: true, value };
}

function optionalPayloadLiteral<T extends string>(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[]
): Result<T | undefined, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field '${key}' must be a non-empty string when provided.`
      )
    );
  }

  if (!allowedValues.includes(value as T)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field '${key}' has unsupported value '${value}'.`
      )
    );
  }

  return { ok: true, value: value as T };
}

function requireNonNegativeInteger(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<number, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' required payload field '${key}' is missing.`
      )
    );
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' required payload field '${key}' must be a non-negative integer.`
      )
    );
  }

  return { ok: true, value };
}

function optionalNonNegativeInteger(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<number | undefined, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field '${key}' must be a non-negative integer when provided.`
      )
    );
  }

  return { ok: true, value };
}

function optionalExitCode(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<number | null | undefined, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field '${key}' must be a non-negative integer or null when provided.`
      )
    );
  }

  return { ok: true, value };
}

function optionalPayloadPathArray(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string[] | undefined, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return requirePayloadPathArray(type, payload, key);
}

function requirePayloadPathArray(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string[], SpriteError> {
  const value = payload[key];

  if (!Array.isArray(value) || value.length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field '${key}' must be a non-empty array.`
      )
    );
  }

  const safePaths: string[] = [];

  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${key}' must contain non-empty strings.`
        )
      );
    }

    const safePath = validateFileActivityPath(item);

    if (safePath.ok === false) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${key}' must contain safe project-relative paths.`
        )
      );
    }

    safePaths.push(safePath.value);
  }

  return { ok: true, value: safePaths };
}

function requirePayloadLiteralArray<T extends string>(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[]
): Result<T[], SpriteError> {
  const value = payload[key];

  if (!Array.isArray(value) || value.length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field '${key}' must be a non-empty array.`
      )
    );
  }

  const literals: T[] = [];

  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${key}' must contain non-empty strings.`
        )
      );
    }

    if (!allowedValues.includes(item as T)) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${key}' has unsupported value '${item}'.`
        )
      );
    }

    literals.push(item as T);
  }

  return { ok: true, value: literals };
}

function requirePayloadStringArray(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string[], SpriteError> {
  const value = payload[key];

  if (!Array.isArray(value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field '${key}' must be an array.`
      )
    );
  }

  const strings: string[] = [];

  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${type}' payload field '${key}' must contain non-empty strings.`
        )
      );
    }

    strings.push(item);
  }

  return { ok: true, value: strings };
}

function optionalOutputReference(
  type: RuntimeEventType,
  payload: Record<string, unknown>
): Result<RuntimeEventOutputReference | undefined, SpriteError> {
  const value = payload.outputReference;

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!isPlainObject(value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' outputReference must be a plain object.`
      )
    );
  }

  if (typeof value.fullOutputStored !== "boolean") {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' outputReference.fullOutputStored must be a boolean.`
      )
    );
  }

  const reason = requirePayloadString(type, value, "reason");
  const outputPath = optionalPayloadString(type, value, "path");

  if (reason.ok === false) {
    return err(reason.error);
  }

  if (outputPath.ok === false) {
    return err(outputPath.error);
  }

  return {
    ok: true,
    value: {
      fullOutputStored: value.fullOutputStored,
      reason: reason.value,
      ...(outputPath.value === undefined ? {} : { path: outputPath.value })
    }
  };
}

function requirePayloadLiteral<T extends string>(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[]
): Result<T, SpriteError> {
  const value = requirePayloadString(type, payload, key);

  if (value.ok === false) {
    return err(value.error);
  }

  if (!allowedValues.includes(value.value as T)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field '${key}' has unsupported value '${value.value}'.`
      )
    );
  }

  return { ok: true, value: value.value as T };
}

function requirePayloadBoolean(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<boolean, SpriteError> {
  const value = payload[key];

  if (typeof value !== "boolean") {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' is missing required boolean payload field '${key}'.`
      )
    );
  }

  return { ok: true, value };
}

function isRuntimeEventType(value: string): value is RuntimeEventType {
  return RUNTIME_EVENT_TYPES.includes(value as RuntimeEventType);
}

function expectedFileEditStatus(
  type: (typeof FILE_EDIT_EVENT_TYPES)[number]
): "applied" | "failed" | "requested" {
  switch (type) {
    case "file.edit.applied":
      return "applied";
    case "file.edit.failed":
      return "failed";
    case "file.edit.requested":
      return "requested";
  }
}

function findForbiddenToolPayloadField(
  payload: Record<string, unknown>
): string | null {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_TOOL_PAYLOAD_FIELDS.has(key)) {
      return key;
    }
  }

  return null;
}

function findForbiddenPolicyPayloadField(
  value: unknown,
  seen: WeakSet<object>
): string | null {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    for (const item of value) {
      const nested = findForbiddenPolicyPayloadField(item, seen);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_POLICY_PAYLOAD_FIELDS.has(key)) {
      return key;
    }

    const nested = findForbiddenPolicyPayloadField(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!value.endsWith("Z")) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

export class RuntimeEventBus {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly history: RuntimeEventRecord[] = [];

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: RuntimeEventRecord): Result<RuntimeEventRecord, SpriteError> {
    const validation = validateRuntimeEvent(event);

    if (!validation.ok) {
      return validation;
    }

    const storedEvent = cloneRuntimeEventRecord(validation.value);
    this.history.push(storedEvent);

    for (const listener of this.listeners) {
      try {
        listener(cloneRuntimeEventRecord(storedEvent));
      } catch {
        // Subscriber failures must not control runtime state transitions.
      }
    }

    return { ok: true, value: cloneRuntimeEventRecord(storedEvent) };
  }

  getHistory(taskId?: string): RuntimeEventRecord[] {
    if (taskId === undefined) {
      return this.history.map(cloneRuntimeEventRecord);
    }

    return this.history
      .filter((event) => event.taskId === taskId)
      .map(cloneRuntimeEventRecord);
  }
}

function cloneRuntimeEventRecord<T extends RuntimeEventRecord>(event: T): T {
  return {
    ...event,
    payload: clonePayloadObject(event.payload) as T["payload"]
  };
}

function clonePayloadObject(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return clonePayloadValue(payload, new WeakMap()) as Record<string, unknown>;
}

function clonePayloadValue(
  value: unknown,
  seen: WeakMap<object, unknown>
): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const clone: unknown[] = [];
    seen.set(value, clone);

    for (const item of value) {
      clone.push(clonePayloadValue(item, seen));
    }

    return clone;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const clone: Record<string, unknown> = {};
    seen.set(value, clone);

    for (const [key, nestedValue] of Object.entries(value)) {
      clone[key] = clonePayloadValue(nestedValue, seen);
    }

    return clone;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
