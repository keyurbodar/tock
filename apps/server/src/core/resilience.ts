import type { AssistantMessage } from "@earendil-works/pi-ai";
import { isContextOverflow } from "@earendil-works/pi-ai/utils/overflow";
import { isRetryableAssistantError } from "@earendil-works/pi-ai/utils/retry";
import { GenerationTask, hook, type HookRegistration } from "@earendil-works/pi-durable";

const TRANSIENT = new RegExp(
  [
    "invalid.?response",
    "empty.?response",
    "malformed",
    "bad.?gateway",
    "gateway.?time.?out",
    "could not parse .*(?:sse|event|chunk|stream)",
    "invalid .*stream(?:ing)? event",
    "unexpected event type",
    "unexpected end of json",
    "unexpected token .* in json",
    "is not valid json",
    "json.?parse",
    "unterminated string in json",
    "stream completed with an unfinished tool call",
    "response has no body",
    "no response body",
    "(?<![a-z0-9])(?:408|425|522|523|529|530)(?![a-z0-9])",
  ].join("|"),
  "i",
);

const FINAL =
  /^\s*4(?!08|25|29)\d\d\b|(?:http|status|code)\D{0,3}4(?!08|25|29)\d\d\b|credit.?balance/i;

export const TRANSIENT_PREFIX = "Provider returned an error: ";

export function needsRetry(message: AssistantMessage): boolean {
  if (message.stopReason !== "error" || message.errorMessage === undefined) return false;
  if (isRetryableAssistantError(message) || isContextOverflow(message)) return false;
  if (!TRANSIENT.test(message.errorMessage) || FINAL.test(message.errorMessage)) return false;
  return isRetryableAssistantError({
    ...message,
    errorMessage: `${TRANSIENT_PREFIX}${message.errorMessage}`,
  });
}

export const transientRetries: HookRegistration = hook(GenerationTask, {
  afterResponse: (message) => {
    if (needsRetry(message))
      message.errorMessage = `${TRANSIENT_PREFIX}${message.errorMessage ?? ""}`;
  },
});

export async function isBackgroundReadOnlyViolation(
  toolName: string,
  args: unknown,
  isMcpToolReadOnly: (server: string, tool: string) => Promise<boolean>,
): Promise<string | null> {
  if (toolName === "http_request" && args && typeof args === "object") {
    const method = String((args as { method?: unknown }).method ?? "GET").toUpperCase();
    if (method !== "GET") {
      return `background_read_only: http_request ${method} is blocked during background turns`;
    }
  }
  if (toolName === "mcp_call" && args && typeof args === "object") {
    const server = String((args as { server?: unknown }).server ?? "");
    const remoteTool = String((args as { tool?: unknown }).tool ?? "");
    const readOnly = await isMcpToolReadOnly(server, remoteTool);
    if (!readOnly) {
      return `background_read_only: MCP tool "${remoteTool}" lacks readOnlyHint=true and is blocked during background turns`;
    }
  }
  return null;
}
