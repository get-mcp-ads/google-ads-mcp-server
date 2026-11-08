/** Never forward advertising credentials through an HTTP redirect. */
export const NO_REDIRECT = "manual" as const;

/** Do not expose the Location header: it may include tokens or signed URLs. */
export function refuseRedirect(response: Response, api: string): void {
  if (response.status < 300 || response.status >= 400) return;
  throw new Error(`${api} returned an unexpected HTTP ${response.status} redirect. Redirects are never followed. Check the configured endpoint and authorization.`);
}
