import { ok, type Result } from "@sprite/shared";

export interface BootstrapState {
  implemented: false;
  message: string;
  interfaces: string[];
}

export class AgentRuntime {
  getBootstrapState(): Result<BootstrapState> {
    return ok({
      implemented: false,
      message:
        "Sprite Harness bootstrap workspace is ready. Interactive task execution is not implemented yet.",
      interfaces: ["cli"]
    });
  }
}

export function createBootstrapMessage(): string {
  const runtime = new AgentRuntime();
  const state = runtime.getBootstrapState();

  if (!state.ok) {
    throw state.error;
  }

  return `${state.value.message}\nUse --help to inspect the current CLI surface.`;
}
