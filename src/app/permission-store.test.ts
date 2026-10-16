import { describe, it, expect, beforeEach } from "vitest";
import {
  pendingPermissions,
  permissionDecisions,
  requestPermission,
  decidePermission,
  hasPendingPermission,
  type PermissionRequest,
} from "./permission-store";

const sample: PermissionRequest = {
  id: "r1",
  capability: "notifications",
  title: "Allow notifications?",
  body: "Islet can tell you when a round ends.",
};

describe("permission-store", () => {
  beforeEach(() => {
    pendingPermissions.value = [];
    permissionDecisions.value = {};
  });

  it("enqueues a new request", () => {
    requestPermission(sample);
    expect(hasPendingPermission()).toBe(true);
    expect(pendingPermissions.value).toHaveLength(1);
  });

  it("does not enqueue the same capability twice", () => {
    requestPermission(sample);
    requestPermission({ ...sample, id: "r2" });
    expect(pendingPermissions.value).toHaveLength(1);
  });

  it("records a decision and clears the request", () => {
    requestPermission(sample);
    decidePermission("r1", "granted");
    expect(hasPendingPermission()).toBe(false);
    expect(permissionDecisions.value.notifications).toBe("granted");
  });

  it("will not re-ask a decided capability", () => {
    requestPermission(sample);
    decidePermission("r1", "denied");
    requestPermission({ ...sample, id: "r3" });
    expect(hasPendingPermission()).toBe(false);
  });
});
