import { createMemoryCandidate } from "@sprite/memory";
import { createLocalMemoryStore } from "@sprite/storage";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function createTempProject(): { projectDir: string; rootDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-memory-store-"));

  return {
    projectDir: join(rootDir, "project"),
    rootDir
  };
}

describe("LocalMemoryStore candidate review APIs", () => {
  it("lists, reads, and atomically updates memory candidates with lifecycle metadata", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const store = createLocalMemoryStore();
      const created = createMemoryCandidate({
        candidateId: "memcand_review_api_test",
        confidence: "medium",
        content: "Memory review candidates should stay in project storage.",
        createdAt: "2026-05-08T13:00:00.000Z",
        provenance: "storage test",
        sourceEventIds: ["evt_storage_source"],
        sourceTaskId: "task_storage",
        type: "semantic"
      });

      expect(created.ok).toBe(true);
      if (!created.ok || created.value.candidate === null) {
        return;
      }

      const written = store.writeCandidate(projectDir, created.value.candidate);

      expect(written.ok).toBe(true);
      if (!written.ok) {
        return;
      }

      const listed = store.listCandidates(projectDir);
      expect(listed.ok).toBe(true);
      if (!listed.ok) {
        return;
      }
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]).toMatchObject({
        id: "memcand_review_api_test",
        lifecycleStatus: "pending_review",
        recommendedAction: "review"
      });

      const read = store.readCandidate(projectDir, "memcand_review_api_test");
      expect(read.ok).toBe(true);
      if (!read.ok) {
        return;
      }
      expect(read.value).toMatchObject({
        id: "memcand_review_api_test",
        lifecycleStatus: "pending_review"
      });

      const updated = store.updateCandidate(projectDir, {
        ...read.value,
        lifecycleStatus: "rejected",
        reviewedAt: "2026-05-08T13:01:00.000Z",
        reviewedBy: "tester",
        reviewReason: "Not actionable.",
        updatedAt: "2026-05-08T13:01:00.000Z"
      });

      expect(updated.ok).toBe(true);
      if (!updated.ok) {
        return;
      }
      expect(
        JSON.parse(readFileSync(updated.value.path, "utf8"))
      ).toMatchObject({
        id: "memcand_review_api_test",
        lifecycleStatus: "rejected",
        reviewReason: "Not actionable."
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects candidate path escapes and unsafe serialized artifacts", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const store = createLocalMemoryStore();

      expect(store.readCandidate(projectDir, "../memcand_escape").ok).toBe(
        false
      );

      const unsafe = store.updateCandidate(projectDir, {
        confidence: "medium",
        content: "OPENAI_API_KEY=sk-test-secret",
        contentPreview: "OPENAI_API_KEY=sk-test-secret",
        createdAt: "2026-05-08T13:05:00.000Z",
        id: "memcand_unsafe_storage",
        lifecycleStatus: "pending_review",
        provenance: "unsafe storage fixture",
        recommendedAction: "review",
        safetyDecision: {
          action: "allow",
          matchedRuleIds: [],
          reason: "No safety rule matched.",
          redactedPreview: "OPENAI_API_KEY=sk-test-secret",
          target: "memory_candidate"
        },
        schemaVersion: 1,
        sensitivityStatus: "non_sensitive",
        sourceEventIds: [],
        type: "semantic",
        updatedAt: "2026-05-08T13:05:00.000Z"
      });

      expect(unsafe.ok).toBe(false);
      if (!unsafe.ok) {
        expect(unsafe.error.code).toBe("MEMORY_ARTIFACT_INVALID");
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
