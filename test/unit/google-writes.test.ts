import { afterEach, describe, it, expect, vi } from "vitest";
import { collect } from "./catalogue";
const config = {
  clientId: "client",
  clientSecret: "secret",
  refreshToken: "refresh",
  developerToken: "dev",
  loginCustomerId: "1111111111",
};
const tool = (name: string) =>
  collect("google_ads", config).find((t) => t.name === name)!;
afterEach(() => vi.unstubAllGlobals());
function requests() {
  const bodies: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      if (url.includes("oauth2"))
        return Response.json({ access_token: "access" });
      bodies.push({ url, ...init, body: JSON.parse(init.body) });
      return Response.json({
        mutateOperationResponses: [
          { campaignBudgetResult: { resourceName: "budget" } },
          { campaignResult: { resourceName: "campaign" } },
        ],
      });
    }),
  );
  return bodies;
}
describe("Google write regression", () => {
  it.each([
    ["campaign", "campaigns", "campaignId"],
    ["adgroup", "adGroups", "adGroupId"],
  ])("removes %s using a remove operation", async (level, resource, idKey) => {
    const r = requests();
    await tool(`google_ads_update_${level}_status`).handler({
      customerId: "123",
      [idKey]: "456",
      status: "REMOVED",
      confirm: true,
    });
    expect(r[0].body.operations).toEqual([
      { remove: `customers/123/${resource}/456` },
    ]);
  });
  it("creates campaign and budget atomically and uses inferred MCC", async () => {
    const r = requests();
    await tool("google_ads_create_campaign").handler({
      customerId: "1234567890",
      name: "Test",
      channelType: "SEARCH",
      dailyBudget: 1.23,
      euPoliticalAdvertising: false,
      confirm: true,
    });
    expect(r).toHaveLength(1);
    expect(r[0].headers["login-customer-id"]).toBe("1111111111");
    expect(r[0].body.partialFailure).toBe(false);
    const ops = r[0].body.mutateOperations;
    expect(ops[0].campaignBudgetOperation.create.amountMicros).toBe("1230000");
    expect(ops[1].campaignOperation.create).toMatchObject({
      campaignBudget: ops[0].campaignBudgetOperation.create.resourceName,
      status: "PAUSED",
      containsEuPoliticalAdvertising:
        "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    });
  });
  it("native validation never applies and previews never call Google", async () => {
    const r = requests();
    const args = {
      customerId: "1234567890",
      name: "Test",
      channelType: "SEARCH",
      dailyBudget: 20,
      euPoliticalAdvertising: false,
    };
    await tool("google_ads_create_campaign").handler(args);
    expect(r).toHaveLength(0);
    const out: any = await tool("google_ads_create_campaign").handler({
      ...args,
      validateOnly: true,
      confirm: true,
    });
    expect(r[0].body.validateOnly).toBe(true);
    expect(JSON.parse(out.content[0].text)).toMatchObject({
      applied: false,
      validatedByGoogle: true,
    });
  });
  it("requires explicit declarations and Shopping prerequisites before mutation", async () => {
    const r = requests();
    await expect(
      tool("google_ads_create_campaign").handler({
        customerId: "123",
        name: "Test",
        channelType: "SEARCH",
        dailyBudget: 20,
        confirm: true,
      }),
    ).rejects.toThrow("euPoliticalAdvertising");
    await expect(
      tool("google_ads_create_campaign").handler({
        customerId: "123",
        name: "Test",
        channelType: "SHOPPING",
        dailyBudget: 20,
        confirm: true,
        euPoliticalAdvertising: false,
      }),
    ).rejects.toThrow("merchantId");
    expect(r).toHaveLength(0);
  });
  it("uses v26 calendar fields and can clear end dates", async () => {
    const r = requests();
    const t = tool("google_ads_update_campaign_schedule");
    await t.handler({
      customerId: "123",
      campaignId: "1",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      confirm: true,
    });
    expect(r[0].body.operations[0]).toMatchObject({
      update: {
        startDateTime: "2026-10-01 00:00:00",
        endDateTime: "2026-10-03 23:59:59",
      },
      updateMask: "start_date_time,end_date_time",
    });
    await t.handler({
      customerId: "123",
      campaignId: "1",
      endDate: "2037-12-30",
      confirm: true,
    });
    expect(r[1].body.operations[0].update.endDateTime).toBeUndefined();
    expect(r[1].body.operations[0].updateMask).toBe("end_date_time");
    const bad: any = await t.handler({
      customerId: "123",
      campaignId: "1",
      endDate: "2026-02-30",
      confirm: true,
    });
    expect(bad.isError).toBe(true);
    expect(r).toHaveLength(2);
  });
  it("uses supported PMax bidding with an explicit brand setting", async () => {
    const r = requests();
    await tool("google_ads_create_campaign").handler({
      customerId: "123",
      name: "PMax",
      channelType: "PERFORMANCE_MAX",
      dailyBudget: 20,
      euPoliticalAdvertising: false,
      brandGuidelinesEnabled: false,
      confirm: true,
    });
    const c = r[0].body.mutateOperations[1].campaignOperation.create;
    expect(c.maximizeConversions).toEqual({});
    expect(c.brandGuidelinesEnabled).toBe(false);
    expect(c.manualCpc).toBeUndefined();
  });
});
