import canonicalize from "canonicalize";

/** RFC 8785 (JCS) canonical JSON, encoded as UTF-8. Throws if `v` is not JSON-serializable. */
export function canonicalBytes(v: unknown): Uint8Array {
  const s = canonicalize(v);
  if (s === undefined) throw new Error("value is not canonicalizable");
  return new TextEncoder().encode(s);
}
