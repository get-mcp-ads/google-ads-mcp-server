import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { collect } from "./catalogue";

const config = { clientId: "c", clientSecret: "s", refreshToken: "r", developerToken: "d" };
const tool = (name: string) => collect("google_ads", config).find((t) => t.name === name)!;

afterEach(() => vi.unstubAllGlobals());

function provider() {
  const calls: { url: string; body: unknown; redirect?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "access", expires_in: 3600 });
      calls.push({ url, body: JSON.parse(String(init.body)), redirect: init.redirect });
      return Response.json({ results: [{ resourceName: "x" }] });
    }),
  );
  return calls;
}

describe("Google Ads renames", () => {
  it.each([
    ["google_ads_rename_adgroup", "adGroupId", "adGroups"],
    ["google_ads_rename_asset_group", "assetGroupId", "assetGroups"],
  ])("%s previews, then mutates the name field only", async (name, param, resource) => {
    const calls = provider();
    const preview: any = await tool(name).handler({ customerId: "123-456-7890", [param]: "42", name: "FR_Search" });
    expect(JSON.parse(preview.content[0].text)).toMatchObject({ applied: false, action: name, change: { newName: "FR_Search" } });
    expect(calls).toHaveLength(0);

    await tool(name).handler({ customerId: "123-456-7890", [param]: "42", name: "FR_Search", confirm: true });
    expect(calls.map((c) => [c.url, c.body])).toEqual([[
      `https://googleads.googleapis.com/v26/customers/1234567890/${resource}:mutate`,
      { operations: [{ update: { resourceName: `customers/1234567890/${resource}/42`, name: "FR_Search" }, updateMask: "name" }] },
    ]]);
    expect(calls[0].redirect).toBe("error");
  });

  it("renames the account through CustomerService's single update operation", async () => {
    const calls = provider();
    const preview: any = await tool("google_ads_rename_account").handler({ customerId: "1234567890", name: "Client FR" });
    expect(JSON.parse(preview.content[0].text)).toMatchObject({ applied: false, change: { customer: "1234567890", newName: "Client FR" } });
    expect(calls).toHaveLength(0);

    await tool("google_ads_rename_account").handler({ customerId: "1234567890", name: "Client FR", confirm: true });
    expect(calls.map((c) => [c.url, c.body])).toEqual([[
      "https://googleads.googleapis.com/v26/customers/1234567890:mutate",
      { operation: { update: { resourceName: "customers/1234567890", descriptiveName: "Client FR" }, updateMask: "descriptive_name" } },
    ]]);
  });

  it("refuses line breaks, oversized names and non-numeric IDs before any request", () => {
    const adGroup = z.object(tool("google_ads_rename_adgroup").shape);
    expect(adGroup.safeParse({ customerId: "1", adGroupId: "2", name: "a\nb" }).success).toBe(false);
    expect(adGroup.safeParse({ customerId: "1", adGroupId: "2/../x", name: "ok" }).success).toBe(false);
    expect(adGroup.safeParse({ customerId: "1/x", adGroupId: "2", name: "ok" }).success).toBe(false);
    const assetGroup = z.object(tool("google_ads_rename_asset_group").shape);
    expect(assetGroup.safeParse({ customerId: "1", assetGroupId: "2", name: "x".repeat(129) }).success).toBe(false);
    expect(assetGroup.safeParse({ customerId: "1", assetGroupId: "2", name: "x".repeat(128) }).success).toBe(true);
    const account = z.object(tool("google_ads_rename_account").shape);
    expect(account.safeParse({ customerId: "1", name: "" }).success).toBe(false);
  });

  it("is registered as a write that previews", () => {
    for (const name of ["google_ads_rename_account", "google_ads_rename_adgroup", "google_ads_rename_asset_group"]) {
      expect(tool(name).write).toBe(true);
    }
  });
});
