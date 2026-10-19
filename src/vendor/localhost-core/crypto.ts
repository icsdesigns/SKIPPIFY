import _sodium from "libsodium-wrappers-sumo";

const sodium = _sodium;

export type DeviceKeys = { publicKey: string; secretKey: string };

export async function ready(): Promise<void> {
  await sodium.ready;
}

const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;

export function b64(u: Uint8Array): string {
  return sodium.to_base64(u, B64());
}

export function unb64(s: string): Uint8Array {
  return sodium.from_base64(s, B64());
}

export function randomBytes(n: number): Uint8Array {
  return sodium.randombytes_buf(n);
}

export function newDeviceKeys(): DeviceKeys {
  const kp = sodium.crypto_sign_keypair();
  return { publicKey: b64(kp.publicKey), secretKey: b64(kp.privateKey) };
}

export function sign(msg: Uint8Array, sk: string): string {
  return b64(sodium.crypto_sign_detached(msg, unb64(sk)));
}

export function verify(msg: Uint8Array, sig: string, pk: string): boolean {
  try {
    return sodium.crypto_sign_verify_detached(unb64(sig), msg, unb64(pk));
  } catch {
    return false;
  }
}

export function seal(msg: Uint8Array, recipientEdPk: string): string {
  const curvePk = sodium.crypto_sign_ed25519_pk_to_curve25519(unb64(recipientEdPk));
  return b64(sodium.crypto_box_seal(msg, curvePk));
}

export function openSealed(box: string, keys: DeviceKeys): Uint8Array | null {
  try {
    const curvePk = sodium.crypto_sign_ed25519_pk_to_curve25519(unb64(keys.publicKey));
    const curveSk = sodium.crypto_sign_ed25519_sk_to_curve25519(unb64(keys.secretKey));
    return sodium.crypto_box_seal_open(unb64(box), curvePk, curveSk);
  } catch {
    return null;
  }
}

export function aeadEncrypt(plain: Uint8Array, key: Uint8Array, ad: Uint8Array): string {
  const nonce = randomBytes(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, ad, null, nonce, key);
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return b64(out);
}

export function aeadDecrypt(box: string, key: Uint8Array, ad: Uint8Array): Uint8Array | null {
  try {
    const raw = unb64(box);
    const n = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    if (raw.length < n) return null;
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, raw.subarray(n), ad, raw.subarray(0, n), key,
    );
  } catch {
    return null;
  }
}

export function hmac(key: Uint8Array, msg: string): string {
  const st = sodium.crypto_auth_hmacsha256_init(key);
  sodium.crypto_auth_hmacsha256_update(st, sodium.from_string(msg));
  return b64(sodium.crypto_auth_hmacsha256_final(st));
}

export function sha256(msg: Uint8Array): string {
  return b64(sodium.crypto_hash_sha256(msg));
}

export function deriveKey(secret: Uint8Array, context: string): Uint8Array {
  return sodium.crypto_generichash(32, context, secret);
}

/** Argon2id13 cost parameters; recorded in every backup file. */
export type KdfParams = { opslimit: number; memlimit: number };

/** INTERACTIVE: affordable on phones. */
export function defaultKdf(): KdfParams {
  return {
    opslimit: sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE, memlimit: sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
  };
}

/**
 * Between libsodium's MIN and a cap of SENSITIVE passes (4) and MODERATE memory (256 MiB, R55), so a
 * file cannot make a restore hang or exhaust memory. (The wrappers' *_MAX constants overflow to negatives.)
 */
export function isKdfParams(p: KdfParams): boolean {
  return Number.isInteger(p.opslimit) && Number.isInteger(p.memlimit)
    && p.opslimit >= sodium.crypto_pwhash_OPSLIMIT_MIN && p.opslimit <= sodium.crypto_pwhash_OPSLIMIT_SENSITIVE
    && p.memlimit >= sodium.crypto_pwhash_MEMLIMIT_MIN && p.memlimit <= sodium.crypto_pwhash_MEMLIMIT_MODERATE;
}

export function passwordKey(password: string, salt: Uint8Array, kdf: KdfParams = defaultKdf()): Uint8Array {
  return sodium.crypto_pwhash(
    32,
    password,
    salt,
    kdf.opslimit,
    kdf.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}
