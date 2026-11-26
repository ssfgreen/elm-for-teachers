import { describe, expect, it } from "vitest";
import { WorkspaceExportPayload } from "./exports.js";

describe("WorkspaceExportPayload", () => {
  it("reads an older event, with no account, as before", () => {
    const old = { format: "zip", via: "password", files: 12 };
    expect(WorkspaceExportPayload.parse(old)).toEqual(old);
  });

  it("keeps the admin's account id when one made the export", () => {
    const signedIn = { format: "json", via: "account", files: 12, account_id: "acc_1" };
    expect(WorkspaceExportPayload.parse(signedIn)).toEqual(signedIn);
  });
});
