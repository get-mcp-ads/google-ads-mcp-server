import { afterEach, describe, expect, it, vi } from "vitest";
import { collect, writeToolNames } from "./catalogue";
import { normalizeGooglePlan } from "../../src/platforms/google-ads/extended-writes";
const cid = "9956210494",
  root = `customers/${cid}/`;
const config = {
  clientId: "client",
  clientSecret: "secret",
  refreshToken: "refresh",
  developerToken: "dev",
  loginCustomerId: "8417946348",
};
const args = {
  customerId: cid,
  currency: "EUR",
  testAccountOnly: true,
  operations: [
    {
      kind: "adGroupOperation",
      create: { name: "Test", campaign: root + "campaigns/123" },
    },
  ],
};
const tool = () =>
  collect("google_ads", config).find(
    (t) => t.name === "google_ads_apply_plan",
  )!;
const data = (r: any) => JSON.parse(r.content[0].text);
afterEach(() => vi.unstubAllGlobals());
function mock(currency = "EUR", test = true) {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      calls.push({ url, body: String(init.body), headers: init.headers });
      if (url.includes("oauth2")) return Response.json({ access_token: "x" });
      if (url.endsWith("search"))
        return Response.json({
          results: [
            {
              customer: { id: cid, currencyCode: currency, testAccount: test },
            },
          ],
        });
      return Response.json({
        mutateOperationResponses: [
          { adGroupResult: { resourceName: root + "adGroups/1" } },
        ],
      });
    }),
  );
  return calls;
}
describe("Google atomic plan", () => {
  it("is gated as a write tool", () =>
    expect(writeToolNames("google_ads")).toContain("google_ads_apply_plan"));
  it("previews without network and forces paused creations", async () => {
    const calls = mock();
    const r = data(await tool().handler(args));
    expect(calls).toHaveLength(0);
    expect(r.applied).toBe(false);
    expect(r.operations[0].adGroupOperation.create.status).toBe("PAUSED");
    expect(r.planHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("requires exactly the previewed plan, including account/currency/test constraint", async () => {
    const calls = mock();
    const preview = data(await tool().handler(args));
    for (const change of [
      { currency: "USD" },
      { testAccountOnly: false },
      {
        operations: [
          {
            kind: "adGroupOperation",
            create: { name: "Changed", campaign: root + "campaigns/123" },
          },
        ],
      },
    ])
      await expect(
        tool().handler({
          ...args,
          ...change,
          confirm: true,
          expectedPlanHash: preview.planHash,
        }),
      ).rejects.toThrow("Preview");
    expect(calls).toHaveLength(0);
  });
  it("applies atomically after checking native currency and identity", async () => {
    const calls = mock();
    const p = data(await tool().handler(args));
    const r = data(
      await tool().handler({
        ...args,
        confirm: true,
        expectedPlanHash: p.planHash,
      }),
    );
    expect(r.applied).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[2].headers["login-customer-id"]).toBe("8417946348");
    expect(JSON.parse(calls[2].body)).toMatchObject({
      partialFailure: false,
      validateOnly: false,
    });
  });
  it("validateOnly never applies even with confirm", async () => {
    const calls = mock();
    const r = data(
      await tool().handler({ ...args, confirm: true, validateOnly: true }),
    );
    expect(r.applied).toBe(false);
    expect(JSON.parse(calls[2].body).validateOnly).toBe(true);
  });
  it.each([
    ["USD", true],
    ["EUR", false],
  ])("rejects wrong currency or production account", async (currency, test) => {
    const calls = mock(currency as string, test as boolean);
    await expect(
      tool().handler({ ...args, validateOnly: true }),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url.endsWith("mutate"))).toHaveLength(0);
  });
  it.each([
    {
      kind: "adGroupOperation",
      create: { campaign: "customers/1111111111/campaigns/2" },
    },
    { kind: "campaignOperation", remove: "customers/1111111111/campaigns/2" },
    {
      kind: "adGroupOperation",
      update: { resourceName: root + "campaigns/1" },
      updateMask: "name",
    },
    { kind: "campaignOperation", create: { status: "ENABLED" } },
    { kind: "campaignOperation", create: { advertisingChannelType: "VIDEO" } },
    { kind: "campaignOperation", create: { advertisingChannelType: "SEARCH" } },
    { kind: "adGroupOperation", create: {}, remove: root + "adGroups/1" },
    { kind: "adGroupOperation", update: { resourceName: root + "adGroups/1" } },
    {
      kind: "adGroupOperation",
      update: { resourceName: root + "adGroups/1" },
      updateMask: "*",
    },
    { kind: "adGroupOperation", create: { access_token: "secret" } },
    { kind: "customerOperation", create: {} },
  ])("rejects unsafe or ambiguous native operations %#", (op) =>
    expect(() => normalizeGooglePlan(cid, [op])).toThrow(),
  );
  it("redacts media from preview but binds its exact bytes to hash", async () => {
    const t = tool();
    const a = {
      ...args,
      operations: [
        {
          kind: "assetOperation",
          create: { imageAsset: { data: "aGVsbG8=" } },
        },
      ],
    };
    const x = data(await t.handler(a));
    expect(JSON.stringify(x)).not.toContain("aGVsbG8=");
    const y = data(
      await t.handler({
        ...a,
        operations: [
          {
            kind: "assetOperation",
            create: { imageAsset: { data: "d29ybGQ=" } },
          },
        ],
      }),
    );
    expect(x.planHash).not.toBe(y.planHash);
  });
  it("rejects immutable ad names before any Google request", async () => {
    const calls = mock();
    await expect(tool().handler({ ...args, validateOnly: true, operations: [{
      kind: "adOperation", update: { resourceName: root + "ads/1", name: "New name" }, updateMask: "name",
    }] })).rejects.toThrow("ad.name is immutable");
    expect(calls).toHaveLength(0);
  });
  it("checks the decoded image size and rejects malformed base64", () => {
    const image = (data: string) => [{ kind: "assetOperation", create: { imageAsset: { data } } }];
    expect(() => normalizeGooglePlan(cid, image(Buffer.alloc(5 * 1024 * 1024).toString("base64")))).not.toThrow();
    expect(() => normalizeGooglePlan(cid, image(Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")))).toThrow("5 MiB");
    expect(() => normalizeGooglePlan(cid, image("a"))).toThrow("base64");
  });
  it("returns field-level Google errors without echoing triggers", async () => {
    mock();
    (fetch as any)
      .mockImplementationOnce(async () => Response.json({ access_token: "x" }))
      .mockImplementationOnce(async () =>
        Response.json({
          results: [
            { customer: { id: cid, currencyCode: "EUR", testAccount: true } },
          ],
        }),
      )
      .mockImplementationOnce(async () =>
        Response.json(
          {
            error: {
              details: [
                {
                  errors: [
                    {
                      errorCode: { fieldError: "REQUIRED" },
                      message: "Missing name",
                      trigger: { stringValue: "SECRET" },
                    },
                  ],
                },
              ],
            },
          },
          { status: 400 },
        ),
      );
    await expect(
      tool().handler({ ...args, validateOnly: true }),
    ).rejects.toThrow("REQUIRED");
  });
});

describe("Google video writes", () => {
  const videoArgs = {
    customerId: cid,
    currency: "EUR",
    testAccountOnly: true,
    bytesBase64: "aGVsbG8=",
    mimeType: "video/mp4",
    title: "Test",
    description: "Synthetic test only",
    visibility: "UNLISTED",
  };
  const videoTool = () =>
    collect("google_ads", config).find(
      (t) => t.name === "google_ads_upload_video",
    )!;
  it("previews metadata without exposing video bytes or doing network I/O", async () => {
    const calls = mock();
    const r = data(await videoTool().handler(videoArgs));
    expect(calls).toHaveLength(0);
    expect(r).toMatchObject({
      description: "Synthetic test only",
      visibility: "UNLISTED",
      byteLength: 5,
    });
    expect(JSON.stringify(r)).not.toContain("aGVsbG8=");
  });
  it("requires a nonempty description in the public schema", () => {
    expect(videoTool().shape.description.safeParse("").success).toBe(false);
    expect(videoTool().shape.description.safeParse(undefined).success).toBe(
      false,
    );
  });
  it("never sends bytes to an unexpected upload host", async () => {
    mock();
    (fetch as any)
      .mockImplementationOnce(async () => Response.json({ access_token: "x" }))
      .mockImplementationOnce(async () =>
        Response.json({
          results: [
            { customer: { id: cid, currencyCode: "EUR", testAccount: true } },
          ],
        }),
      )
      .mockImplementationOnce(
        async () =>
          new Response(null, {
            headers: {
              "x-goog-upload-url": "https://untrusted.example/upload",
            },
          }),
      );
    const p = data(await videoTool().handler(videoArgs));
    await expect(
      videoTool().handler({
        ...videoArgs,
        confirm: true,
        expectedPlanHash: p.planHash,
      }),
    ).rejects.toThrow("Unexpected");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("uploads with the tested native metadata and returns a processing follow-up", async () => {
    const calls: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        if (url.includes("oauth2")) return Response.json({ access_token: "x" });
        if (url.endsWith("search"))
          return Response.json({
            results: [
              { customer: { id: cid, currencyCode: "EUR", testAccount: true } },
            ],
          });
        if (url.includes("resumable"))
          return new Response(null, {
            headers: {
              "x-goog-upload-url":
                "https://googleads.googleapis.com/test-upload",
            },
          });
        return Response.json({
          resourceName: root + "youTubeVideoUploads/123",
        });
      }),
    );
    const p = data(await videoTool().handler(videoArgs));
    const r = data(
      await videoTool().handler({
        ...videoArgs,
        confirm: true,
        expectedPlanHash: p.planHash,
      }),
    );
    expect(JSON.parse(calls[2].init.body)).toMatchObject({
      customer_id: cid,
      you_tube_video_upload: {
        video_title: "Test",
        video_description: "Synthetic test only",
        video_privacy: "UNLISTED",
      },
    });
    expect(calls[3].init.redirect).toBe("error");
    expect(r.resourceName).toBe(root + "youTubeVideoUploads/123");
    expect(r.nextAction).toContain("PROCESSED");
  });
  it("removes only the selected customer upload after preview", async () => {
    const calls = mock();
    const t = collect("google_ads", config).find(
      (t) => t.name === "google_ads_remove_video_upload",
    )!;
    const a = {
      customerId: cid,
      currency: "EUR",
      testAccountOnly: true,
      uploadId: "123",
    };
    const p = data(await t.handler(a));
    await t.handler({ ...a, confirm: true, expectedPlanHash: p.planHash });
    expect(calls[2].url).toContain("youTubeVideoUploads:remove");
    expect(JSON.parse(calls[2].body)).toEqual({
      resourceNames: [root + "youTubeVideoUploads/123"],
    });
  });
});
