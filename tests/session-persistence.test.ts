import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  compactSessionManually,
  createRuntimeEventRecord,
  validateRuntimeEvent,
  type CompactedSessionContext
} from "@sprite/core";
import { SpriteError, err } from "@sprite/shared";
import type { MemoryStore, SessionStore } from "@sprite/storage";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

function createTempWorkspace(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-session-runtime-"));

  return {
    homeDir: join(rootDir, "home"),
    projectDir: join(rootDir, "project"),
    rootDir
  };
}

function readNdjson(path: string): Record<string, unknown>[] {
  const content = readFileSync(path, "utf8").trim();

  return content.length === 0
    ? []
    : content
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function getRuntimeSessionStore(runtime: AgentRuntime): SessionStore {
  return (runtime as unknown as { sessionStore: SessionStore }).sessionStore;
}

function getRuntimeMemoryStore(runtime: AgentRuntime): MemoryStore {
  return (runtime as unknown as { memoryStore: MemoryStore }).memoryStore;
}

type ResumeSessionResult = {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    inspection: {
      latestTask?: {
        goal: string;
        latestPlan?: Array<{ status: string; summary: string }>;
        status: string;
      };
      pendingApprovalCount: number;
    };
    restoredEventCount: number;
    resumeEventId: string;
    sessionId: string;
    status: string;
    taskId: string;
    warnings?: string[];
  };
};

type ResumableRuntime = AgentRuntime & {
  resumeSession?: (sessionId: string) => ResumeSessionResult;
};

function resumeSession(
  runtime: AgentRuntime,
  sessionId: string
): ResumeSessionResult {
  const resume = (runtime as ResumableRuntime).resumeSession;

  if (resume === undefined) {
    throw new Error("Expected AgentRuntime.resumeSession(sessionId) to exist.");
  }

  return resume.call(runtime, sessionId);
}

describe("AgentRuntime session persistence", () => {
  it("creates a project-local session and persists started/waiting events in order", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const result = runtime.submitInteractiveTask("persist this task");

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.sessionId).toEqual(expect.stringMatching(/^ses_/));

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        result.value.sessionId
      );
      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting"
      ]);
      for (const event of persistedEvents) {
        expect(validateRuntimeEvent(event).ok).toBe(true);
      }

      expect(readJson(join(sessionDir, "state.json"))).toMatchObject({
        schemaVersion: 1,
        sessionId: result.value.sessionId,
        cwd: projectDir,
        eventCount: 2,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: [],
        lastEventId: result.value.events.at(-1)?.eventId,
        lastEventType: "task.waiting",
        latestTask: {
          taskId: result.value.taskId,
          correlationId: result.value.correlationId,
          status: "waiting-for-input",
          currentPhase: result.value.currentPhase,
          goal: "persist this task"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("persists memory candidate and entry artifacts next to session audit events", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("persist memory");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const recorded = runtime.recordMemoryCandidate({
        confidence: "high",
        content: "Runtime event validation is the audit spine.",
        provenance: "story 4.2 implementation note",
        sourceEventIds: [submitted.value.events[0].eventId],
        type: "episodic"
      });

      expect(recorded.ok).toBe(true);
      if (!recorded.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "memory.safety.evaluated",
        "memory.candidate.created",
        "memory.entry.saved"
      ]);
      expect(
        persistedEvents.every((event) => validateRuntimeEvent(event).ok)
      ).toBe(true);

      const candidatePath = join(
        projectDir,
        ".sprite",
        "memory",
        "candidates",
        `${recorded.value.candidate?.id}.json`
      );
      const entriesPath = join(
        projectDir,
        ".sprite",
        "memory",
        "entries.ndjson"
      );

      expect(existsSync(candidatePath)).toBe(true);
      expect(readJson(candidatePath)).toMatchObject({
        id: recorded.value.candidate?.id,
        schemaVersion: 1,
        sensitivityStatus: "non_sensitive",
        sourceTaskId: submitted.value.taskId,
        type: "episodic"
      });
      expect(readNdjson(entriesPath)).toHaveLength(1);
      expect(JSON.stringify(persistedEvents)).not.toContain("rawContent");
      expect(JSON.stringify(readJson(candidatePath))).not.toContain(
        "OPENAI_API_KEY"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("persists candidate audit events before attempting auto-save entry append", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "persist candidate before failed auto-save"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const memoryStore = getRuntimeMemoryStore(runtime);
      memoryStore.appendEntry = (() =>
        err(
          new SpriteError(
            "TEST_MEMORY_ENTRY_APPEND_FAILED",
            "Entry append failed after candidate persistence."
          )
        )) satisfies MemoryStore["appendEntry"];

      const recorded = runtime.recordMemoryCandidate({
        confidence: "high",
        content: "Candidate audits should not wait on entry persistence.",
        provenance: "story 4.2 review fix",
        sourceEventIds: [submitted.value.events[0].eventId],
        type: "semantic"
      });

      expect(recorded.ok).toBe(false);
      if (recorded.ok) {
        return;
      }

      expect(recorded.error).toMatchObject({
        code: "TEST_MEMORY_ENTRY_APPEND_FAILED"
      });

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "memory.safety.evaluated",
        "memory.candidate.created"
      ]);

      const candidateEvent = persistedEvents.find(
        (event) => event.type === "memory.candidate.created"
      );
      const candidatePayload = candidateEvent?.payload as
        | { candidateId?: unknown }
        | undefined;
      const candidateId = candidatePayload?.candidateId;

      expect(candidateId).toEqual(expect.stringMatching(/^memcand_/));
      if (typeof candidateId !== "string") {
        return;
      }

      const candidatePath = join(
        projectDir,
        ".sprite",
        "memory",
        "candidates",
        `${candidateId}.json`
      );
      const entriesPath = join(
        projectDir,
        ".sprite",
        "memory",
        "entries.ndjson"
      );

      expect(existsSync(candidatePath)).toBe(true);
      expect(readNdjson(entriesPath)).toHaveLength(0);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("lists, opens, accepts, and resumes reviewed memory candidates without replaying entries", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "review memory candidate"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const recorded = runtime.recordMemoryCandidate({
        confidence: "medium",
        content: "Runtime review APIs should create durable memory on accept.",
        provenance: "story 4.3 runtime test",
        sourceEventIds: [submitted.value.events[1].eventId],
        type: "semantic"
      });

      expect(recorded.ok).toBe(true);
      if (!recorded.ok || recorded.value.candidate === null) {
        return;
      }
      expect(recorded.value.autoSaved).toBe(false);

      const listed = runtime.listMemoryCandidates();
      expect(listed.ok).toBe(true);
      if (!listed.ok) {
        return;
      }
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]).toMatchObject({
        candidateId: recorded.value.candidate.id,
        contentSummary:
          "Runtime review APIs should create durable memory on accept.",
        lifecycleStatus: "pending_review",
        recommendedAction: "review"
      });
      expect(listed.value[0]).not.toHaveProperty("content");

      const opened = runtime.openMemoryCandidate(recorded.value.candidate.id);
      expect(opened.ok).toBe(true);
      if (!opened.ok) {
        return;
      }
      expect(opened.value).toMatchObject({
        candidateId: recorded.value.candidate.id,
        sourceTaskId: submitted.value.taskId
      });
      expect(opened.value).not.toHaveProperty("content");

      const reviewed = runtime.reviewMemoryCandidate({
        action: "accept",
        candidateId: recorded.value.candidate.id,
        reason: "Safe and actionable.",
        reviewedAt: "2026-05-08T13:15:00.000Z",
        reviewedBy: "tester"
      });

      expect(reviewed.ok).toBe(true);
      if (!reviewed.ok) {
        return;
      }
      expect(reviewed.value).toMatchObject({
        candidate: {
          acceptedEntryId: expect.stringMatching(/^mem_/),
          lifecycleStatus: "accepted",
          reviewedBy: "tester",
          reviewReason: "Safe and actionable."
        },
        entry: {
          autoSaved: false,
          candidateId: recorded.value.candidate.id,
          type: "semantic"
        }
      });

      const duplicate = runtime.reviewMemoryCandidate({
        action: "accept",
        candidateId: recorded.value.candidate.id,
        reason: "Duplicate accept should be blocked."
      });
      expect(duplicate.ok).toBe(false);

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const eventsPath = join(sessionDir, "events.ndjson");
      const entriesPath = join(
        projectDir,
        ".sprite",
        "memory",
        "entries.ndjson"
      );
      const candidatePath = join(
        projectDir,
        ".sprite",
        "memory",
        "candidates",
        `${recorded.value.candidate.id}.json`
      );

      expect(readNdjson(entriesPath)).toHaveLength(1);
      expect(readJson(candidatePath)).toMatchObject({
        acceptedEntryId: reviewed.value.entry?.id,
        lifecycleStatus: "accepted",
        reviewReason: "Safe and actionable."
      });

      const eventsBeforeResume = readNdjson(eventsPath);
      expect(eventsBeforeResume.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "memory.safety.evaluated",
        "memory.candidate.created",
        "memory.entry.saved",
        "memory.candidate.reviewed"
      ]);
      expect(
        eventsBeforeResume.filter(
          (event) => event.type === "memory.candidate.reviewed"
        )
      ).toHaveLength(1);
      expect(JSON.stringify(eventsBeforeResume)).not.toContain("rawContent");

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, submitted.value.sessionId);
      expect(resumed.ok).toBe(true);

      const eventsAfterResume = readNdjson(eventsPath);
      expect(readNdjson(entriesPath)).toHaveLength(1);
      expect(
        eventsAfterResume.filter(
          (event) => event.type === "memory.candidate.reviewed"
        )
      ).toHaveLength(1);
      expect(
        eventsAfterResume.filter((event) => event.type === "memory.entry.saved")
      ).toHaveLength(1);
      expect(
        eventsAfterResume.filter((event) => event.type === "session.resumed")
      ).toHaveLength(1);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects or blocks unsafe edits without creating durable memory entries", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "reject and edit memory candidate"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const first = runtime.recordMemoryCandidate({
        confidence: "medium",
        content: "Candidate should be rejected by reviewer.",
        provenance: "story 4.3 reject test",
        type: "episodic"
      });
      const second = runtime.recordMemoryCandidate({
        confidence: "medium",
        content: "Candidate should be edited safely before accept.",
        provenance: "story 4.3 edit test",
        type: "semantic"
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (
        !first.ok ||
        first.value.candidate === null ||
        !second.ok ||
        second.value.candidate === null
      ) {
        return;
      }

      const rejected = runtime.reviewMemoryCandidate({
        action: "reject",
        candidateId: first.value.candidate.id,
        reason: "Not useful.",
        reviewedAt: "2026-05-08T13:20:00.000Z",
        reviewedBy: "tester"
      });

      expect(rejected.ok).toBe(true);
      if (!rejected.ok) {
        return;
      }
      expect(rejected.value).toMatchObject({
        candidate: {
          lifecycleStatus: "rejected",
          reviewReason: "Not useful."
        },
        entry: null
      });

      const unsafeEdit = runtime.reviewMemoryCandidate({
        action: "edit",
        candidateId: second.value.candidate.id,
        editedContent: "OPENAI_API_KEY=sk-test-secret",
        reason: "Unsafe edit should be blocked."
      });

      expect(unsafeEdit.ok).toBe(false);
      expect(JSON.stringify(unsafeEdit)).not.toContain("sk-test-secret");

      const entriesPath = join(
        projectDir,
        ".sprite",
        "memory",
        "entries.ndjson"
      );
      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const events = readNdjson(join(sessionDir, "events.ndjson"));

      expect(readNdjson(entriesPath)).toHaveLength(0);
      expect(
        events.filter((event) => event.type === "memory.candidate.reviewed")
      ).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain("OPENAI_API_KEY=");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("appends initial task events as one batch before publishing subscribers", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const sessionStore = getRuntimeSessionStore(runtime);
      const appendEvents = sessionStore.appendEvents.bind(sessionStore);
      const batchSizes: number[] = [];
      const observedTypes: string[] = [];

      sessionStore.appendEvents = ((sessionId, events) => {
        batchSizes.push(events.length);
        expect(runtime.getEventHistory()).toEqual([]);

        return appendEvents(sessionId, events);
      }) satisfies SessionStore["appendEvents"];

      runtime.subscribeToEvents((event) => {
        observedTypes.push(event.type);
      });

      const result = runtime.submitInteractiveTask("batch persist task start");

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(batchSizes[0]).toBe(2);
      expect(observedTypes).toEqual(["task.started", "task.waiting"]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not publish initial task events when batch append fails", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const sessionStore = getRuntimeSessionStore(runtime);
      const observedTypes: string[] = [];

      sessionStore.appendEvents = (() =>
        err(
          new SpriteError(
            "TEST_BATCH_APPEND_FAILED",
            "Batch append failed for regression coverage."
          )
        )) satisfies SessionStore["appendEvents"];

      runtime.subscribeToEvents((event) => {
        observedTypes.push(event.type);
      });

      const result = runtime.submitInteractiveTask("fail before publish");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error).toMatchObject({
        code: "TEST_BATCH_APPEND_FAILED"
      });
      expect(observedTypes).toEqual([]);
      expect(runtime.getEventHistory()).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("persists state snapshot cwd as an absolute project path", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const relativeProjectDir = relative(process.cwd(), projectDir);
      const runtime = new AgentRuntime({
        cwd: relativeProjectDir,
        homeDir
      });
      const result = runtime.submitInteractiveTask("normalize cwd");

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      const state = readJson(
        join(
          projectDir,
          ".sprite",
          "sessions",
          result.value.sessionId,
          "state.json"
        )
      );

      expect(state).toMatchObject({
        cwd: resolve(relativeProjectDir),
        sessionId: result.value.sessionId
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("appends only newly emitted runtime events when task state transitions", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("stop after first loop");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      expect(readNdjson(join(sessionDir, "events.ndjson"))).toHaveLength(2);

      const stopped = runtime.stopActiveTaskForMaxIterations(
        "Stop for persistence test."
      );

      expect(stopped.ok).toBe(true);
      if (!stopped.ok) {
        return;
      }

      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "task.failed"
      ]);
      expect(readJson(join(sessionDir, "state.json"))).toMatchObject({
        eventCount: 3,
        lastError: expect.stringContaining("max-iterations"),
        lastEventId: stopped.value.events.at(-1)?.eventId,
        lastEventType: "task.failed",
        latestTask: {
          taskId: stopped.value.taskId,
          status: "max-iterations",
          currentPhase: stopped.value.currentPhase,
          goal: "stop after first loop"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps snapshot eventCount aligned with the session-wide event log", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const first = runtime.submitInteractiveTask("first task in session");
      const second = runtime.submitInteractiveTask("second task in session");

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }

      expect(second.value.sessionId).toBe(first.value.sessionId);

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        first.value.sessionId
      );
      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));
      const state = readJson(join(sessionDir, "state.json"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "task.started",
        "task.waiting"
      ]);
      expect(state).toMatchObject({
        eventCount: persistedEvents.length,
        lastEventId: second.value.events.at(-1)?.eventId,
        lastEventType: "task.waiting",
        latestTask: {
          taskId: second.value.taskId,
          goal: "second task in session"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not publish runtime events when disk persistence fails", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("guard disk ordering");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const eventsPath = join(sessionDir, "events.ndjson");
      rmSync(eventsPath, { force: true });
      mkdirSync(eventsPath);

      const observedTypes: string[] = [];
      runtime.subscribeToEvents((event) => {
        observedTypes.push(event.type);
      });

      const steered = runtime.steerActiveTask(
        "this should not reach subscribers"
      );

      expect(steered.ok).toBe(false);
      if (steered.ok) {
        return;
      }

      expect(steered.error).toMatchObject({
        code: "SESSION_EVENT_APPEND_FAILED"
      });
      expect(observedTypes).toEqual([]);
      expect(
        runtime
          .getEventHistory(submitted.value.taskId)
          .map((event) => event.type)
      ).toEqual(["task.started", "task.waiting"]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("refreshes bounded snapshot metadata after safe file activity", async () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "package.json"), "{}\n");

      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("summarize files");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const readResult = await runtime.executeToolCall({
        input: { path: "package.json" },
        toolName: "read_file"
      });

      expect(readResult.ok).toBe(true);
      if (!readResult.ok) {
        return;
      }

      const state = readJson(
        join(
          projectDir,
          ".sprite",
          "sessions",
          submitted.value.sessionId,
          "state.json"
        )
      );

      expect(state).toMatchObject({
        eventCount: 6,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: ["package.json"],
        lastEventType: "file.activity.recorded",
        pendingApprovalCount: 0
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("resumes a persisted session conservatively and records a resume event", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume this persisted task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      rmSync(join(sessionDir, "compactions"), { recursive: true, force: true });
      expect(existsSync(join(sessionDir, "compactions"))).toBe(false);

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, submitted.value.sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }

      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));
      const state = readJson(join(sessionDir, "state.json"));
      const resumeEvent = persistedEvents.at(-1);

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "session.resumed"
      ]);
      expect(validateRuntimeEvent(resumeEvent).ok).toBe(true);
      expect(resumeEvent).toMatchObject({
        eventId: resumed.value?.resumeEventId,
        payload: {
          restoredEventCount: 2,
          restoredTaskStatus: "waiting-for-input",
          status: "recorded"
        },
        sessionId: submitted.value.sessionId,
        taskId: submitted.value.taskId,
        type: "session.resumed"
      });
      expect(state).toMatchObject({
        eventCount: persistedEvents.length,
        lastEventId: resumed.value?.resumeEventId,
        lastEventType: "session.resumed",
        latestTask: {
          goal: "resume this persisted task",
          status: "waiting-for-input",
          taskId: submitted.value.taskId
        }
      });
      expect(resumed.value).toMatchObject({
        restoredEventCount: 2,
        sessionId: submitted.value.sessionId,
        status: "waiting-for-input",
        taskId: submitted.value.taskId
      });
      expect(resumed.value?.inspection.pendingApprovalCount).toBe(0);
      expect(
        resumedRuntime
          .getEventHistory(submitted.value.taskId)
          .map((event) => event.type)
      ).toEqual(["task.started", "task.waiting", "session.resumed"]);

      const activeTask = resumedRuntime.getActiveTask();
      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }
      expect(
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "session-state"
        )
      ).toMatchObject({
        metadata: expect.objectContaining({
          restoredEventCount: 2,
          resumed: true,
          sessionId: submitted.value.sessionId,
          taskId: submitted.value.taskId
        }),
        status: "included"
      });
      expect(
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "working-memory"
        )
      ).toMatchObject({
        metadata: expect.objectContaining({
          scope: "session",
          sessionId: submitted.value.sessionId,
          taskId: submitted.value.taskId
        }),
        status: "included",
        trust: "trusted"
      });
      expect(
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "working-memory"
        )?.content
      ).toContain("resume this persisted task");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("resumes with compacted continuity and recoverable precedence notes", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume from compacted continuity"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const statePath = join(sessionDir, "state.json");
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-resume-context-001",
        createdAt: "2026-05-04T01:07:00.000Z",
        eventId: "evt_resume_context_compacted"
      });

      expect(compacted.ok).toBe(true);

      const state = readJson(statePath);
      writeFileSync(
        statePath,
        `${JSON.stringify(
          {
            ...state,
            nextStep: "Use the newer state next step after compaction.",
            latestTask: {
              ...(state.latestTask as Record<string, unknown>),
              latestPlan: [
                {
                  phase: "act",
                  status: "pending",
                  summary:
                    "Use the newer plan step from state after compaction."
                }
              ]
            }
          },
          null,
          2
        )}\n`
      );

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }

      const activeTask = resumedRuntime.getActiveTask();
      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }

      const compactedSection =
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "compacted-context"
        );

      expect(compactedSection).toMatchObject({
        metadata: expect.objectContaining({
          artifactId: "cmp-resume-context-001",
          compactionEventId: "evt_resume_context_compacted",
          noteCodes: expect.arrayContaining(["COMPACTED_CONTEXT_SUPERSEDED"])
        }),
        status: "included"
      });
      expect(compactedSection?.content).toContain(
        "resume from compacted continuity"
      );
      expect(compactedSection?.content).toContain(
        "Use the newer state next step after compaction."
      );
      expect(resumed.value?.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("compacted context")])
      );
      expect(
        resumedRuntime
          .getEventHistory(submitted.value.taskId)
          .filter((event) => event.type === "session.resumed")
      ).toHaveLength(1);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not promote compacted requested or blocked commands to completed", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume compacted command statuses"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-resume-command-statuses",
        createdAt: "2026-05-04T01:07:30.000Z",
        eventId: "evt_resume_command_statuses_compacted"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok) {
        return;
      }

      const compactedArtifact = readJson(
        compacted.value.artifactPath
      ) as unknown as CompactedSessionContext;
      writeFileSync(
        compacted.value.artifactPath,
        `${JSON.stringify(
          {
            ...compactedArtifact,
            summary: {
              ...compactedArtifact.summary,
              continuity: {
                ...compactedArtifact.summary.continuity,
                commandsRun: [
                  "policy.decision.recorded recorded: sudo rm -rf /",
                  "tool.call.requested requested: node",
                  "validation.completed blocked: npm run test"
                ]
              }
            }
          },
          null,
          2
        )}\n`
      );

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }

      const activeTask = resumedRuntime.getActiveTask();
      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }

      const workingMemorySection =
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "working-memory"
        );

      expect(workingMemorySection?.content).toContain(
        "planned: tool.call.requested requested: node"
      );
      expect(workingMemorySection?.content).toContain(
        "blocked: validation.completed blocked: npm run test"
      );
      expect(workingMemorySection?.content).not.toContain(
        "completed: tool.call.requested"
      );
      expect(workingMemorySection?.content).not.toContain(
        "policy.decision.recorded"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("resumes with bounded newer events after compaction in the active task context", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume with newer compacted events"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const eventsPath = join(
        projectDir,
        ".sprite",
        "sessions",
        sessionId,
        "events.ndjson"
      );
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-resume-newer-events",
        createdAt: "2026-05-04T01:08:00.000Z",
        eventId: "evt_resume_newer_events_compacted"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok) {
        return;
      }

      const newerEvent = createRuntimeEventRecord(
        {
          correlationId: submitted.value.correlationId,
          createdAt: "2026-05-04T01:09:00.000Z",
          eventId: "evt_resume_newer_steering",
          sessionId,
          taskId: submitted.value.taskId
        },
        "task.steering.received",
        {
          note: "newer steering event restored after compaction"
        }
      );

      expect(validateRuntimeEvent(newerEvent).ok).toBe(true);
      appendFileSync(eventsPath, `${JSON.stringify(newerEvent)}\n`);

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }

      const activeTask = resumedRuntime.getActiveTask();
      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }

      const compactedSection =
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "compacted-context"
        );

      expect(compactedSection).toMatchObject({
        metadata: expect.objectContaining({
          artifactId: "cmp-resume-newer-events",
          recentEventCount: 1
        }),
        status: "included"
      });
      expect(compactedSection?.content).toContain("evt_resume_newer_steering");
      expect(compactedSection?.content).toContain(
        "newer steering event restored after compaction"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails resume without appending session.resumed when compacted artifact is missing", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume after missing compacted artifact"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const eventsPath = join(
        projectDir,
        ".sprite",
        "sessions",
        sessionId,
        "events.ndjson"
      );
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-missing-during-resume",
        createdAt: "2026-05-04T01:10:00.000Z",
        eventId: "evt_missing_during_resume_compacted"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      rmSync(compacted.value.artifactPath, { force: true });

      const beforeTypes = readNdjson(eventsPath).map((event) => event.type);
      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, sessionId);
      const afterTypes = readNdjson(eventsPath).map((event) => event.type);

      expect(resumed.ok).toBe(false);
      expect(resumed.error?.code).toBe(
        "SESSION_COMPACTION_ARTIFACT_READ_FAILED"
      );
      expect(afterTypes).toEqual(beforeTypes);
      expect(afterTypes).not.toContain("session.resumed");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("restores persisted effect events without replaying side effects", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume without replaying prior effects"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const sentinelPath = join(projectDir, "sentinel.txt");
      writeFileSync(sentinelPath, "original\n");

      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-no-replay-effects",
        createdAt: "2026-05-04T01:11:00.000Z",
        eventId: "evt_no_replay_effects_compacted"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok) {
        return;
      }

      const validationEvent = createRuntimeEventRecord(
        {
          correlationId: submitted.value.correlationId,
          createdAt: "2026-05-04T01:12:00.000Z",
          eventId: "evt_prior_validation_started",
          sessionId,
          taskId: submitted.value.taskId
        },
        "validation.started",
        {
          command:
            "rtk run npm test -- --run tests/session-persistence.test.ts",
          cwd: projectDir,
          status: "started",
          summary: "Prior validation was already started before resume.",
          toolCallId: "tool_prior_validation",
          validationId: "val_prior_validation"
        }
      );
      const fileEditEvent = createRuntimeEventRecord(
        {
          correlationId: submitted.value.correlationId,
          createdAt: "2026-05-04T01:13:00.000Z",
          eventId: "evt_prior_file_edit_applied",
          sessionId,
          taskId: submitted.value.taskId
        },
        "file.edit.applied",
        {
          affectedFiles: ["sentinel.txt"],
          editId: "edit_prior_file",
          status: "applied",
          summary: "Prior file edit event must be restored, not replayed.",
          toolCallId: "tool_prior_file_edit",
          toolName: "apply_patch"
        }
      );

      expect(validateRuntimeEvent(validationEvent).ok).toBe(true);
      expect(validateRuntimeEvent(fileEditEvent).ok).toBe(true);
      appendFileSync(eventsPath, `${JSON.stringify(validationEvent)}\n`);
      appendFileSync(eventsPath, `${JSON.stringify(fileEditEvent)}\n`);

      const eventCountBeforeResume = readNdjson(eventsPath).length;
      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, sessionId);
      const eventsAfterResume = readNdjson(eventsPath);

      expect(resumed.ok).toBe(true);
      expect(readFileSync(sentinelPath, "utf8")).toBe("original\n");
      expect(eventsAfterResume).toHaveLength(eventCountBeforeResume + 1);
      expect(
        eventsAfterResume.filter((event) => event.type === "session.resumed")
      ).toHaveLength(1);
      expect(
        eventsAfterResume.filter((event) => event.type === "file.edit.applied")
      ).toHaveLength(1);
      expect(
        eventsAfterResume.filter((event) => event.type === "validation.started")
      ).toHaveLength(1);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("clears restored pending approval counts when a resumed task becomes terminal", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume task with stale approval"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const statePath = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId,
        "state.json"
      );
      const stateBeforeResume = readJson(statePath);

      writeFileSync(
        statePath,
        `${JSON.stringify(
          {
            ...stateBeforeResume,
            pendingApprovalCount: 1
          },
          null,
          2
        )}\n`
      );

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, submitted.value.sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }
      expect(resumed.value?.inspection.pendingApprovalCount).toBe(1);

      const cancelled = resumedRuntime.cancelActiveTask(
        "Stop resumed task after clearing stale approvals."
      );

      expect(cancelled.ok).toBe(true);
      const stateAfterCancel = readJson(statePath);

      expect(stateAfterCancel).toMatchObject({
        latestTask: {
          status: "cancelled"
        },
        pendingApprovalCount: 0
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns a structured error when resuming a missing session", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const result = resumeSession(runtime, "ses_missing");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "SESSION_NOT_FOUND"
        });
      }
      expect(
        existsSync(join(projectDir, ".sprite", "sessions", "ses_missing"))
      ).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns a structured error when resumed event history violates runtime contracts", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume invalid event"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const eventsPath = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId,
        "events.ndjson"
      );
      const events = readNdjson(eventsPath);
      writeFileSync(
        eventsPath,
        `${events
          .map((event, index) =>
            JSON.stringify(
              index === 0 ? { ...event, type: "task.started.raw" } : event
            )
          )
          .join("\n")}\n`
      );

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const result = resumeSession(resumedRuntime, submitted.value.sessionId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "SESSION_EVENT_RUNTIME_INVALID"
        });
      }
      expect(readNdjson(eventsPath).map((event) => event.type)).toEqual([
        "task.started.raw",
        "task.waiting"
      ]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
