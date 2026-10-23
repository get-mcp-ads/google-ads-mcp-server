import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collect } from "./catalogue";

/**
 * Handlers de la bibliothèque créative Google Ads, exercés avec fetch mocké
 * sur des exemples synthétiques compatibles avec Google Ads v26 : images simgad stables, vidéos = assets YouTube (aucun fichier,
 * embed + vignettes publiques), ads Demand Gen référençant leurs assets.
 * Particularité du client : un premier fetch d'échange OAuth précède chaque
 * session, et searchStream renvoie un TABLEAU de batches [{results: [...]}].
 */

const CONFIG = {
  developerToken: "dev-token",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
} as const;

type ToolResult = { content: [{ type: "text"; text: string }]; isError?: boolean };

function googleTool(name: string) {
  const tool = collect("google_ads", CONFIG).find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} introuvable dans le registre google_ads`);
  return tool;
}

function parsePayload(result: ToolResult): Record<string, unknown> {
  expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

/** Mock fetch : répond au refresh OAuth, puis délègue les searchStream successifs. */
function stubGoogleFetch(streamBatches: unknown[][]) {
  let streamCall = 0;
  const gaqlQueries: string[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "at-123", expires_in: 3600 });
    }
    if (url.endsWith("customers:listAccessibleCustomers")) return jsonResponse({resourceNames:["customers/1234567890"]});
    expect(url).toContain("googleads.googleapis.com/v26/customers/1234567890/googleAds:searchStream");
    gaqlQueries.push(String(JSON.parse(init?.body ?? "{}").query ?? ""));
    const batch = streamBatches[Math.min(streamCall, streamBatches.length - 1)];
    streamCall += 1;
    return jsonResponse(batch);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, gaqlQueries };
}

const IMAGE_ROW = {
  asset: {
    resourceName: "customers/1234567890/assets/10000000001",
    id: "10000000001",
    name: "unnamed.jpg",
    type: "IMAGE",
    source: "ADVERTISER",
    imageAsset: {
      mimeType: "IMAGE_JPEG",
      fileSize: "200614",
      fullSize: { url: "https://tpc.googlesyndication.com/simgad/1000000000000000001", widthPixels: "1200", heightPixels: "1200" },
    },
  },
};

const VIDEO_ROW = {
  asset: {
    resourceName: "customers/1234567890/assets/10000000002",
    id: "10000000002",
    type: "YOUTUBE_VIDEO",
    youtubeVideoAsset: { youtubeVideoId: "fixture0001", youtubeVideoTitle: "Fixture winter creative" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("google_ads_list_image_assets", () => {
  it("liste la bibliothèque d'images via FROM asset avec filtres échappés", async () => {
    const { gaqlQueries } = stubGoogleFetch([[{ results: [IMAGE_ROW] }]]);

    const result = (await googleTool("google_ads_list_image_assets").handler({
      customerId: "1234567890",
      nameFilter: "l'hiver",
      minWidth: 600,
    })) as ToolResult;
    const payload = parsePayload(result);

    expect(gaqlQueries[0]).toContain("FROM asset");
    expect(gaqlQueries[0]).toContain("asset.type = 'IMAGE'");
    expect(gaqlQueries[0]).toContain("asset.name LIKE '%l\\'hiver%'");
    expect(gaqlQueries[0]).toContain("asset.image_asset.full_size.width_pixels >= 600");

    const rows = payload.imageAssets as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(payload.count).toBe(1);
    expect((payload.limitations as string[]).join(" ")).toContain("simgad");
  });
});

describe("google_ads_list_video_assets", () => {
  it("dérive watch, embed et vignettes publiques depuis le youtube_video_id", async () => {
    stubGoogleFetch([[{ results: [VIDEO_ROW] }]]);

    const result = (await googleTool("google_ads_list_video_assets").handler({
      customerId: "1234567890",
    })) as ToolResult;
    const payload = parsePayload(result);

    const rows = payload.videoAssets as Record<string, unknown>[];
    const derived = rows[0].derivedUrls as Record<string, string>;
    expect(derived.watch_url).toBe("https://www.youtube.com/watch?v=fixture0001");
    expect(derived.embed_url).toBe("https://www.youtube.com/embed/fixture0001");
    expect(derived.thumbnail_url).toBe("https://i.ytimg.com/vi/fixture0001/maxresdefault.jpg");
    expect(derived.thumbnail_fallback_url).toBe("https://i.ytimg.com/vi/fixture0001/hqdefault.jpg");
    expect((payload.limitations as string[]).join(" ")).toContain("embed");
  });
});

describe("google_ads_get_demand_gen_assets", () => {
  it("résout les assets référencés par les ads Demand Gen en une seconde requête", async () => {
    const adRow = {
      campaign: { id: "23275919694", name: "20251119 - DemandGen - Black Friday" },
      adGroup: { id: "200000000001", name: "Prospection" },
      adGroupAd: {
        status: "ENABLED",
        ad: {
          id: "300000000001",
          name: "Fixture winter video",
          type: "DEMAND_GEN_VIDEO_RESPONSIVE_AD",
          demandGenVideoResponsiveAd: {
            videos: [
              { asset: "customers/1234567890/assets/10000000003" },
              { asset: "customers/1234567890/assets/10000000004" },
            ],
            logoImages: [{ asset: "customers/1234567890/assets/10000000001" }],
          },
        },
      },
    };
    const resolutionRows = [
      { asset: { id: "10000000003", type: "YOUTUBE_VIDEO", youtubeVideoAsset: { youtubeVideoId: "fixture0002", youtubeVideoTitle: "Fixture video hook" } } },
      { asset: { id: "10000000004", type: "YOUTUBE_VIDEO", youtubeVideoAsset: { youtubeVideoId: "fixture0003", youtubeVideoTitle: "Fixture video hook" } } },
      IMAGE_ROW.asset ? { asset: { ...IMAGE_ROW.asset } } : {},
    ];
    const { gaqlQueries } = stubGoogleFetch([[{ results: [adRow] }], [{ results: resolutionRows }]]);

    const result = (await googleTool("google_ads_get_demand_gen_assets").handler({
      customerId: "1234567890",
      campaignId: "23275919694",
    })) as ToolResult;
    const payload = parsePayload(result);

    expect(gaqlQueries[0]).toContain("campaign.advertising_channel_type = 'DEMAND_GEN'");
    expect(gaqlQueries[0]).toContain("campaign.id = 23275919694");
    expect(gaqlQueries[1]).toContain("FROM asset WHERE asset.id IN (");

    expect(payload.count).toBe(1);
    expect(payload.referencedAssetCount).toBe(3);
    expect(payload.resolvedAssetCount).toBe(3);
    const ads = payload.ads as Record<string, unknown>[];
    const resolved = ads[0].resolvedAssets as Record<string, unknown>[];
    expect(resolved).toHaveLength(3);
    const youtubeResolved = resolved.find((a) => a.id === "10000000003") as Record<string, unknown>;
    expect((youtubeResolved.derivedUrls as Record<string, string>).embed_url).toBe("https://www.youtube.com/embed/fixture0002");
    const imageResolved = resolved.find((a) => a.id === "10000000001") as Record<string, unknown>;
    expect(imageResolved.imageAsset).toBeTruthy();
  });

  it("dégrade proprement quand la résolution d'assets échoue", async () => {
    const adRow = {
      campaign: { id: "1", name: "DG" },
      adGroupAd: { ad: { id: "9", type: "DEMAND_GEN_VIDEO_RESPONSIVE_AD", demandGenVideoResponsiveAd: { videos: [{ asset: "customers/1234567890/assets/111" }] } } },
    };
    let streamCall = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "at", expires_in: 3600 });
      if (url.endsWith("customers:listAccessibleCustomers")) return jsonResponse({resourceNames:["customers/1234567890"]});
      streamCall += 1;
      if (streamCall === 1) return jsonResponse([{ results: [adRow] }]);
      return new Response(JSON.stringify({ error: { message: "PERMISSION_DENIED", details: [] } }), { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = (await googleTool("google_ads_get_demand_gen_assets").handler({
      customerId: "1234567890",
    })) as ToolResult;
    const payload = parsePayload(result);

    expect(payload.count).toBe(1);
    expect(payload.resolvedAssetCount).toBe(0);
    const warnings = payload.warnings as string[];
    expect(warnings.some((w) => w.includes("Asset resolution failed"))).toBe(true);
    const ads = payload.ads as Record<string, unknown>[];
    const resolved = ads[0].resolvedAssets as Record<string, unknown>[];
    expect(resolved[0].unresolved).toBe(true);
  });
});

describe("ce qu'une limite renvoie vraiment", () => {
  it("trie du plus récent au plus ancien, sur les deux bibliothèques", async () => {
    // Sans ORDER BY, Google rend un ordre non garanti et une LIMIT en découpe
    // une tranche arbitraire, en pratique les plus anciens identifiants. Un
    // agent a ainsi conclu d'un `limit: 50` que le compte n'avait presque que
    // des créas auto-générées : il regardait le fond de tiroir de 2022 sur un
    // compte qui en contient 2 295.
    const source = readFileSync(
      join(__dirname, "../..", "src/platforms/google-ads/tools.ts"),
      "utf8",
    );
    const queries = source.split("FROM asset${buildWhere(where)}");
    expect(queries).toHaveLength(3);
    for (const after of queries.slice(1)) {
      expect(after.slice(0, 60)).toContain("ORDER BY asset.id DESC");
    }
  });

  it("dit que la bibliothèque n'est pas un rapport de diffusion", () => {
    // La question posée était « les assets qui ont dépensé en juillet ». La
    // bibliothèque ne sait pas y répondre, et ne le disait pas : elle rendait
    // tout le stock, ce qui ressemble à une réponse.
    const source = readFileSync(
      join(__dirname, "../..", "src/platforms/google-ads/tools.ts"),
      "utf8",
    );
    const mentions = source.split("not a delivery report").length - 1;
    expect(mentions).toBe(2);
    expect(source.toLowerCase()).toContain("hosted getmcpads service");
  });
});

describe("google_ads_get_pmax_assets metrics", () => {
  it("does not assume a currency or timezone when account metadata is missing", async () => {
    stubGoogleFetch([[{results:[{customer:{id:"1234567890"}}]}]]);
    const result=await googleTool("google_ads_get_account_details").handler({customerId:"1234567890"}) as ToolResult;
    expect(parsePayload(result)).toMatchObject({currencyCode:"",timeZone:""});
  });
  it("scopes daily reports to one asset and selected groups in both GAQL variants", async () => {
    const {gaqlQueries}=stubGoogleFetch([[{results:[]}]]);
    const result=await googleTool("google_ads_get_pmax_assets").handler({customerId:"1234567890",startDate:"2026-07-01",endDate:"2026-07-31",metrics:["metrics.cost_micros"],assetId:"11",assetGroupIds:["22","33"],daily:true}) as ToolResult;
    parsePayload(result);
    expect(gaqlQueries[0]).toContain("segments.date");expect(gaqlQueries[0]).toContain("asset.id = 11");expect(gaqlQueries[0]).toContain("asset_group.id IN (22,33)");
  });
  it("includes requested attribution and video fields alongside delivery metrics", async () => {
    const {gaqlQueries} = stubGoogleFetch([[{results:[{...IMAGE_ROW, metrics:{viewThroughConversions:"3", videoTrueviewViews:"120"}}]}]]);
    const result = await googleTool("google_ads_get_pmax_assets").handler({customerId:"1234567890",startDate:"2026-07-01",endDate:"2026-07-31",metrics:["metrics.view_through_conversions","metrics.video_trueview_views"]}) as ToolResult;
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(gaqlQueries[0]).toContain("metrics.view_through_conversions"); expect(gaqlQueries[0]).toContain("metrics.video_trueview_views");
    expect(gaqlQueries[0]).toContain("metrics.cost_micros"); expect(gaqlQueries[0]).toContain("FROM asset_group_asset");
  });
});


describe("visual-only PMax delivery selection", () => {
  it("does not add conversion fields to an explicit delivery-only query", async () => {
    const {gaqlQueries} = stubGoogleFetch([[{results:[]}]]);
    await googleTool("google_ads_get_pmax_assets").handler({customerId:"1234567890",startDate:"2026-07-01",endDate:"2026-07-31",metrics:["metrics.impressions","metrics.cost_micros"]});
    expect(gaqlQueries[0]).toContain("metrics.impressions");
    expect(gaqlQueries[0]).not.toContain("metrics.conversions");
  });
});
