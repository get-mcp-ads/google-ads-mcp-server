/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { RateLimitError } from "./errors.js";
import { logger } from "./logger.js";

export class RateLimiter {
  private timestamps: number[] = [];
  private maxPerSecond = 5;
  private maxPerMinute = 300;
  private maxRetries = 3;

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < 60_000);
    const lastSec = this.timestamps.filter(t => now - t < 1000);
    if (lastSec.length >= this.maxPerSecond) {
      const wait = 1000 - (now - lastSec[0]!) + 50;
      logger.debug("google-ads", `Rate limit: waiting ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
    if (this.timestamps.length >= this.maxPerMinute) {
      const wait = 60_000 - (now - this.timestamps[0]!) + 100;
      logger.warn("google-ads", `Rate limit: waiting ${wait}ms (per-minute)`);
      await new Promise(r => setTimeout(r, wait));
    }
    this.timestamps.push(Date.now());
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 0; i <= this.maxRetries; i++) {
      await this.acquire();
      try { return await fn(); }
      catch (e) {
        const errorRecord = typeof e === "object" && e !== null
          ? e as Record<string, unknown>
          : {};
        const isRL = e instanceof RateLimitError
          || errorRecord["code"] === 429
          || errorRecord["status"] === "RESOURCE_EXHAUSTED"
          || (e instanceof Error && e.message.toLowerCase().includes("rate limit"));
        if (isRL && i < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, i) + Math.floor(Math.random() * 500), 30_000);
          logger.warn("google-ads", `Rate limited, retry ${i+1}/${this.maxRetries} in ${backoff}ms`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw e;
      }
    }
    throw new RateLimitError();
  }
}

/**
 * Keyword Planning methods have a stricter one-request-per-second quota per
 * customer ID. This keyed queue also serializes concurrent MCP tool calls for
 * the same customer while allowing different customers to proceed separately.
 */
export class KeywordPlannerRateLimiter {
  private readonly minIntervalMs: number;
  private readonly lastStartedAt = new Map<string, number>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(minIntervalMs = 1_050) {
    this.minIntervalMs = minIntervalMs;
  }

  async acquire(customerId: string): Promise<void> {
    const previous = this.tails.get(customerId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        const lastStartedAt = this.lastStartedAt.get(customerId) ?? 0;
        const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - lastStartedAt));
        if (waitMs > 0) {
          logger.debug("google-ads", `Keyword Planner quota: waiting ${waitMs}ms for customer ${customerId}`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.lastStartedAt.set(customerId, Date.now());
      });

    this.tails.set(customerId, current);
    try {
      await current;
    } finally {
      if (this.tails.get(customerId) === current) {
        this.tails.delete(customerId);
      }
    }
  }
}
