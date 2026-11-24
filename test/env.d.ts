declare module "cloudflare:test" {
  export const env: Record<string, unknown>;
  export const SELF: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}
