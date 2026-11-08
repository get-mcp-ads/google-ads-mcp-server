import { afterEach, expect, it, vi } from 'vitest';
import { GoogleAdsClient } from '../../src/platforms/google-ads/client';
import { collect } from './catalogue';

afterEach(() => vi.restoreAllMocks());
it.each(['google_ads_list_image_assets', 'google_ads_list_video_assets'])('%s preserves exact large cursor IDs in descending queries', async name => {
  const query = vi.spyOn(GoogleAdsClient.prototype, 'searchStream').mockResolvedValue([]);
  const tool = collect('google_ads', {}).find(t => t.name === name)!;
  const cursor = '9223372036854775807';
  const args = { customerId: '1234567890', beforeAssetId: cursor, limit: 25 };
  expect(tool.shape.beforeAssetId.safeParse(cursor).success).toBe(true);
  expect(tool.shape.beforeAssetId.safeParse('1 OR 1=1').success).toBe(false);
  await tool.handler(args);
  expect(query.mock.calls[0][1]).toContain(`asset.id < ${cursor}`);
  expect(query.mock.calls[0][1]).toContain('ORDER BY asset.id DESC LIMIT 25');
});
