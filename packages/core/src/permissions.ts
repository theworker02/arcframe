import { PermissionDeniedError } from "./errors.js";
import type { CapabilityRegistry } from "./capabilities.js";
import type { ArcframeConfig, PermissionDecision, PermissionRequest } from "./types.js";

export class PermissionGate {
  constructor(
    private readonly config: ArcframeConfig,
    private readonly capabilities?: CapabilityRegistry,
  ) {}

  check(request: PermissionRequest): PermissionDecision {
    const destructive = request.destructive ?? false;

    if (request.action === "read") {
      return {
        allowed: true,
        reason: "Reads are automatic",
        requiresExplicitIntent: false,
      };
    }

    if (request.resource === "git.push" || request.action === "mutate" && request.resource.includes("push")) {
      if (this.config.permissions.autoPush) {
        return {
          allowed: false,
          reason: "autoPush is forbidden; Arcframe never auto-pushes",
          requiresExplicitIntent: true,
        };
      }
      return {
        allowed: false,
        reason: "Push requires explicit user intent via CLI/MCP call",
        requiresExplicitIntent: true,
      };
    }

    if (destructive || request.action === "delete" || request.action === "mutate") {
      if (!this.config.permissions.allowDestructive) {
        return {
          allowed: false,
          reason:
            "Destructive operations are disabled. Enable permissions.allowDestructive and pass explicit intent.",
          requiresExplicitIntent: true,
        };
      }
      return {
        allowed: false,
        reason: "Destructive operation requires explicit intent flag",
        requiresExplicitIntent: true,
      };
    }

    if (this.capabilities?.requiresIntent(request.resource)) {
      return {
        allowed: false,
        reason: "Capability requires explicit intent",
        requiresExplicitIntent: true,
      };
    }

    return {
      allowed: true,
      reason: "Permitted",
      requiresExplicitIntent: false,
    };
  }

  assert(request: PermissionRequest, explicitIntent = false): void {
    const decision = this.check(request);
    if (decision.allowed) return;

    const isPush =
      request.resource.includes("push") ||
      (request.action === "mutate" && request.resource.includes("push"));

    // Never honor autoPush; push always needs a deliberate command + intent.
    if (isPush) {
      if (this.config.permissions.autoPush) {
        throw new PermissionDeniedError(request.resource, "autoPush is never allowed");
      }
      if (explicitIntent) return;
      throw new PermissionDeniedError(request.resource, decision.reason);
    }

    // Destructive / intent-gated ops: explicit intent is sufficient.
    if (decision.requiresExplicitIntent && explicitIntent) {
      return;
    }

    throw new PermissionDeniedError(request.resource, decision.reason);
  }

  allowWithIntent(request: PermissionRequest): boolean {
    const decision = this.check(request);
    if (decision.allowed) return true;
    return decision.requiresExplicitIntent;
  }
}

export function createPermissionGate(
  config: ArcframeConfig,
  capabilities?: CapabilityRegistry,
): PermissionGate {
  return new PermissionGate(config, capabilities);
}
