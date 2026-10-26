/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";
import { logger } from "./core/logger.js";
import { ACCOUNT_IDS_ENV, parseAccountIds } from "./core/account-scope.js";

const configSchema = z.object({
  developerToken: z.string().min(1, "GOOGLE_ADS_DEVELOPER_TOKEN is required"),
  clientId: z.string().min(1, "GOOGLE_ADS_CLIENT_ID is required"),
  clientSecret: z.string().min(1, "GOOGLE_ADS_CLIENT_SECRET is required"),
  refreshToken: z.string().min(1, "GOOGLE_ADS_REFRESH_TOKEN is required"),
  loginCustomerId: z.string().optional(),
  /** Customer IDs every tool is limited to. Undefined: every account the credentials reach. */
  allowedAccountIds: z.array(z.string()).optional(),
  /** Write tools are registered only when this is true. */
  enableWrites: z.boolean().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).prefault("info"),
});

export type GoogleAdsConfig = z.infer<typeof configSchema>;

export function loadConfig(): GoogleAdsConfig {
  const raw = {
    developerToken: process.env["GOOGLE_ADS_DEVELOPER_TOKEN"] ?? "",
    clientId: process.env["GOOGLE_ADS_CLIENT_ID"] ?? "",
    clientSecret: process.env["GOOGLE_ADS_CLIENT_SECRET"] ?? "",
    refreshToken: process.env["GOOGLE_ADS_REFRESH_TOKEN"] ?? "",
    loginCustomerId: process.env["GOOGLE_ADS_LOGIN_CUSTOMER_ID"] || undefined,
    allowedAccountIds: parseAccountIds(process.env[ACCOUNT_IDS_ENV]),
    enableWrites: readWriteFlag(process.env["GOOGLE_ADS_ENABLE_WRITES"]).enabled,
    logLevel: process.env["LOG_LEVEL"] ?? "info",
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.message).join(", ");
    logger.error("config", `Missing credentials: ${missing}`);
    throw new Error(`Missing Google Ads credentials: ${missing}`);
  }

  return result.data;
}

/** Values 2.0 accepted. 3.0.0 will accept only `true`. */
const LEGACY_WRITE_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * GOOGLE_ADS_ENABLE_WRITES. `true` enables the write tools. The other values
 * 2.0 accepted (`1`, `yes`, `on`, in any case) still do, with a deprecation
 * notice. Anything else keeps them off.
 */
export function readWriteFlag(value: string | undefined): { enabled: boolean; notice?: string } {
  const flag = value?.trim() ?? "";
  if (flag === "true") return { enabled: true };
  if (LEGACY_WRITE_VALUES.has(flag.toLowerCase())) {
    return {
      enabled: true,
      notice: `GOOGLE_ADS_ENABLE_WRITES=${flag} still enables the write tools, but 3.0.0 will accept only true. Set it to true.`,
    };
  }
  if (flag !== "" && flag.toLowerCase() !== "false") {
    return { enabled: false, notice: "GOOGLE_ADS_ENABLE_WRITES accepts true or false. Write tools stay disabled." };
  }
  return { enabled: false };
}

/**
 * Lines the CLI writes to stderr at startup, never to stdout, which carries the
 * MCP protocol. Nothing here changes what the server does.
 */
export function startupNotices(env: NodeJS.ProcessEnv = process.env): string[] {
  const notices: string[] = [];
  const writeNotice = readWriteFlag(env["GOOGLE_ADS_ENABLE_WRITES"]).notice;
  if (writeNotice) notices.push(writeNotice);
  if (!env[ACCOUNT_IDS_ENV]?.trim()) {
    notices.push(
      `${ACCOUNT_IDS_ENV} is not set, so every account these credentials reach is available. ` +
        "List the customer IDs this server may use. The variable becomes required in 3.0.0.",
    );
  }
  return notices;
}
