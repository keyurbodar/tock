import type { Env } from "../types.js";

interface JwkKey extends JsonWebKey {
  kid?: string;
}

interface JwksCache {
  domain: string;
  expiresAt: number;
  keys: Map<string, CryptoKey>;
}

let jwksCache: JwksCache | null = null;

function base64UrlToBytes(input: string): Uint8Array {
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function getAccessKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && jwksCache.domain === teamDomain && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`access_certs_fetch_failed_${res.status}`);
  }
  const body = (await res.json()) as { keys?: JwkKey[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.kid, key);
  }
  jwksCache = { domain: teamDomain, expiresAt: now + 10 * 60_000, keys };
  return keys;
}

export interface AuthResult {
  ok: true;
  owner: string;
}

export interface AuthFailure {
  ok: false;
  reason: string;
}

export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthResult | AuthFailure> {
  if (env.DEV_ALLOW_ANON === "1") {
    const devOwner = request.headers.get("x-tock-owner") || "owner@local";
    return { ok: true, owner: devOwner };
  }

  const accessKey = env.TOCK_ACCESS_KEY?.trim();
  if (accessKey) {
    const presented = presentedKeyDigest(request);
    if (presented && constantTimeEqual(presented, await accessKeyDigest(accessKey))) {
      return { ok: true, owner: env.EMAIL_OWNER?.trim() || "owner@local" };
    }
    if (!env.ACCESS_TEAM_DOMAIN) return { ok: false, reason: "invalid_access_key" };
  }

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  if (!teamDomain || !aud) {
    return { ok: false, reason: "access_not_configured" };
  }

  const token =
    request.headers.get("cf-access-jwt-assertion") ??
    new URL(request.url).searchParams.get("access_token");
  if (!token) {
    return { ok: false, reason: "missing_access_jwt" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed_jwt" };
  }
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { kid?: string; alg?: string };
  let payload: {
    aud?: string[] | string;
    email?: string;
    sub?: string;
    exp?: number;
    iss?: string;
  };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
  } catch {
    return { ok: false, reason: "invalid_jwt_json" };
  }

  if (header.alg !== "RS256" || !header.kid) {
    return { ok: false, reason: "unsupported_jwt_alg" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) {
    return { ok: false, reason: "jwt_expired" };
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(aud)) {
    return { ok: false, reason: "invalid_audience" };
  }

  const keys = await getAccessKeys(teamDomain);
  const key = keys.get(header.kid);
  if (!key) {
    return { ok: false, reason: "unknown_kid" };
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = base64UrlToBytes(sigB64);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }

  const owner = payload.email || payload.sub;
  if (!owner) {
    return { ok: false, reason: "missing_identity" };
  }
  return { ok: true, owner };
}

export const ACCESS_COOKIE = "tock_key";

export async function accessKeyDigest(key: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tock-access:${key}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function presentedKeyDigest(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACCESS_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function accessCookie(digest: string, maxAgeSeconds: number): string {
  return `${ACCESS_COOKIE}=${digest}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
