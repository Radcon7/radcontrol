// Keys come from the validated O2 registry projection, filtered for operator visibility.
// The client contract declares required projects, not a closed roster.
export function hasRequiredProjectKeys(actual: readonly string[], required: readonly string[]): boolean {
  const keys = new Set(actual);
  return actual.every((key) => typeof key === "string" && key.length > 0 && key === key.trim()) &&
    keys.size === actual.length && required.every((key) => keys.has(key));
}

type RuntimeReadiness = {
  runtimeMode: string | undefined;
  runtimeFilesReady: boolean;
  workReady: boolean;
  registryState: "loading" | "ready" | "error";
  projectKeys: readonly string[];
  requiredProjectKeys: readonly string[];
  todoAvailable: boolean;
  localToolsCount: number;
  sentinelAvailable: boolean;
};

export function runtimeProductReady(state: RuntimeReadiness): boolean {
  return state.runtimeMode === "production" &&
    state.runtimeFilesReady &&
    state.workReady &&
    state.registryState === "ready" &&
    hasRequiredProjectKeys(state.projectKeys, state.requiredProjectKeys) &&
    state.todoAvailable &&
    state.localToolsCount === 2 &&
    state.sentinelAvailable;
}
