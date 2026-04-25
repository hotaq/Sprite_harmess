import type {
  CommandPolicyRequest,
  PolicyRequestType,
  RiskLevel
} from "./policy-engine.js";

export const APPROVAL_ACTIONS = [
  "allow",
  "deny",
  "edit",
  "alwaysAllowForSession"
] as const;

export const APPROVAL_RESOLUTION_ACTIONS = [
  "allow",
  "deny",
  "edit",
  "timeout",
  "alwaysAllowForSession"
] as const;

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];
export type ApprovalResolutionAction =
  (typeof APPROVAL_RESOLUTION_ACTIONS)[number];

export interface ApprovalRequest {
  affectedFiles?: string[];
  allowedActions: ApprovalAction[];
  approvalRequestId: string;
  command?: string;
  correlationId: string;
  cwd?: string;
  envExposure?: "custom" | "none";
  reason: string;
  requestType: PolicyRequestType;
  riskLevel: RiskLevel;
  ruleId: string;
  summary: string;
  taskId: string;
  timeoutMs: number;
  toolCallId?: string;
}

export interface ApprovalApplyPatchEdit {
  path: string;
  oldText: string;
  newText: string;
}

export interface ApprovalApplyPatchToolCall {
  input: {
    edits: ApprovalApplyPatchEdit[];
    summary?: string;
  };
  toolName: "apply_patch";
}

export type ApprovalResponse =
  | {
      action: Extract<
        ApprovalResolutionAction,
        "allow" | "alwaysAllowForSession"
      >;
      approvalRequestId: string;
    }
  | {
      action: "deny";
      approvalRequestId: string;
      reason?: string;
    }
  | {
      action: "edit";
      approvalRequestId: string;
      modifiedRequest: CommandPolicyRequest;
      reason?: string;
    }
  | {
      action: "edit";
      approvalRequestId: string;
      modifiedToolCall: ApprovalApplyPatchToolCall;
      reason?: string;
    }
  | {
      action: "timeout";
      approvalRequestId: string;
    };
