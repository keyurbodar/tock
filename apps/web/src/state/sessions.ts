/**
 * Merge a session.list reply into what the client shows. A chat created here a moment ago can be missing from a
 * reply the server built before its first send landed (on prod the list often wins that race), so a local chat
 * the server doesn't list survives while it still has sends in flight or was touched after the request went out.
 */
export function mergeSessions<T extends { readonly id: string; readonly updatedAt: number | null }>(
  server: readonly T[],
  local: readonly T[],
  asked: number,
  inFlight: (id: string) => boolean,
): T[] {
  const known = new Set(server.map((session) => session.id))
  const young = local.filter((session) => !known.has(session.id) && (inFlight(session.id) || (session.updatedAt ?? 0) >= asked))
  return [...young, ...server]
}
