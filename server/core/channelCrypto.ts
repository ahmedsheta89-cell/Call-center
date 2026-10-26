/**
 * @file server/core/channelCrypto.ts
 * Phase P.1.2 — Authenticated Encryption-at-Rest (AES-256-GCM + AAD) for Channel Secrets
 *
 * Security Properties:
 * 1. External Key Only: Reads `CHANNEL_SECRET_ENCRYPTION_KEY` from environment.
 * 2. Strict Key Encoding: Must be a 64-character lowercase hex string (`^[0-9a-f]{64}$` = 32 bytes).
 *    Rejects missing keys, wrong lengths, non-hex encodings, and trivial repeated-nibble keys.
 *    Never derives keys from passphrases/hashes (`crypto.createHash` is forbidden) and never uses hardcoded fallbacks.
 * 3. Per-Operation Random Nonce: Generates a fresh 12-byte (96-bit) cryptographically random IV per field encryption.
 * 4. Cryptographic Context Binding (AAD): Binds every encrypted secret to `AAD = "${organizationId}:${channelId}"`
 *    so swapping an encrypted block across tenants or across channels fails GCM authentication (`AUTH_TAG_MISMATCH`)
 *    even when the valid key is used.
 * 5. Fixed JSON Envelope Schema:
 *    `{ __encrypted: true, version: 1, iv: "<base64>", authTag: "<base64>", ciphertext: "<base64>" }`
 * 6. Zero Secret Leakage in Diagnostics: Error messages report deterministic reason codes without exposing
 *    keys, plaintexts, or full ciphertexts.
 */

import crypto from 'crypto';

export const CHANNEL_SECRET_ENV_VAR = 'CHANNEL_SECRET_ENCRYPTION_KEY';

/**
 * Exhaustive inventory of secret field names in `channelConfigs` and integration payloads.
 * Synchronized 100% with `redactSensitiveValue()` in `server/core/audit.ts` and storage log sanitization.
 */
export const EXPLICIT_CHANNEL_SECRET_FIELDS = [
  'apiToken',
  'webhookSecret',
  'authSecret',
  'accessToken',
  'refreshToken',
  'verifyToken',
  'appSecret',
  'clientSecret',
  'sipPassword',
  'smtpPassword',
  'imapPassword',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'passphrase',
  'credential',
  'authorization',
  'password',
  'secret',
  'token',
] as const;

export const CHANNEL_SECRET_KEY_REGEX =
  /password|secret|token|apikey|api_key|authorization|privatekey|private_key|passphrase|credential(?!sConfigured\b)|creditcard|cvv/i;

const NON_SECRET_CHANNEL_METADATA_KEYS = new Set(['credentialsconfigured']);

export function isChannelSecretField(fieldName: unknown): boolean {
  if (typeof fieldName !== 'string' || fieldName.trim().length === 0) {
    return false;
  }
  const normalized = fieldName.trim();
  if (NON_SECRET_CHANNEL_METADATA_KEYS.has(normalized.toLowerCase())) {
    return false;
  }
  return CHANNEL_SECRET_KEY_REGEX.test(normalized);
}

export interface EncryptedSecretEnvelope {
  __encrypted: true;
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export type ChannelCryptoErrorCode =
  | 'CHANNEL_SECRET_KEY_MISSING'
  | 'INVALID_KEY_LENGTH'
  | 'INVALID_KEY_ENCODING'
  | 'INVALID_ENCRYPTED_ENVELOPE'
  | 'AUTH_TAG_MISMATCH'
  | 'INVALID_AAD_CONTEXT'
  | 'ENCRYPTION_VERIFICATION_FAILED';

export interface KeyValidationResult {
  valid: boolean;
  code?: ChannelCryptoErrorCode;
  reason?: string;
  keyBuffer?: Buffer;
}

/**
 * Validates `CHANNEL_SECRET_ENCRYPTION_KEY` strictly against `^[0-9a-f]{64}$` (32 bytes).
 * Never includes the raw key value in returned error reasons.
 */
export function validateChannelEncryptionKey(
  rawKey: string | undefined = process.env[CHANNEL_SECRET_ENV_VAR]
): KeyValidationResult {
  if (rawKey === undefined || rawKey === null || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return {
      valid: false,
      code: 'CHANNEL_SECRET_KEY_MISSING',
      reason: `${CHANNEL_SECRET_ENV_VAR} is missing or empty. Configure a 64-character lowercase hex key (32 bytes).`,
    };
  }

  const trimmed = rawKey.trim();

  if (trimmed.length !== 64) {
    return {
      valid: false,
      code: 'INVALID_KEY_LENGTH',
      reason: `${CHANNEL_SECRET_ENV_VAR} has invalid length (${trimmed.length}); expected exactly 64 lowercase hex characters (32 bytes).`,
    };
  }

  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_KEY_ENCODING',
      reason: `${CHANNEL_SECRET_ENV_VAR} has invalid encoding; must match ^[0-9a-f]{64}$ (64 lowercase hexadecimal characters).`,
    };
  }

  if (/^([0-9a-f])\1{63}$/.test(trimmed)) {
    return {
      valid: false,
      code: 'INVALID_KEY_ENCODING',
      reason: `${CHANNEL_SECRET_ENV_VAR} uses a forbidden weak/repeated single-character hex pattern.`,
    };
  }

  const keyBuffer = Buffer.from(trimmed, 'hex');
  if (keyBuffer.byteLength !== 32) {
    return {
      valid: false,
      code: 'INVALID_KEY_LENGTH',
      reason: `${CHANNEL_SECRET_ENV_VAR} decoded buffer length is not 32 bytes.`,
    };
  }

  return {
    valid: true,
    keyBuffer,
  };
}

export function isEncryptedSecretEnvelope(val: unknown): val is EncryptedSecretEnvelope {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val) && (val as any).__encrypted === true);
}

export function buildChannelSecretAAD(organizationId: string, channelId: string): Buffer {
  const org = typeof organizationId === 'string' ? organizationId.trim() : '';
  const chan = typeof channelId === 'string' ? channelId.trim() : '';
  if (!org || !chan) {
    throw Object.assign(
      new Error('Valid organizationId and channelId are required to construct cryptographic AAD context (INVALID_AAD_CONTEXT).'),
      {
        status: 400,
        code: 'INVALID_AAD_CONTEXT' as ChannelCryptoErrorCode,
      }
    );
  }
  return Buffer.from(`${org}:${chan}`, 'utf-8');
}

function isStrictBase64(str: string, decoded: Buffer): boolean {
  if (typeof str !== 'string' || str.length === 0) return false;
  return decoded.toString('base64') === str;
}

/**
 * Encrypts a single plaintext secret string using AES-256-GCM bound to `AAD = "${organizationId}:${channelId}"`.
 */
export function encryptSecretValue(
  plaintext: string,
  organizationId: string,
  channelId: string,
  rawKeyOverride?: string
): EncryptedSecretEnvelope {
  const keyCheck = validateChannelEncryptionKey(
    rawKeyOverride !== undefined ? rawKeyOverride : process.env[CHANNEL_SECRET_ENV_VAR]
  );
  if (!keyCheck.valid || !keyCheck.keyBuffer) {
    throw Object.assign(new Error(keyCheck.reason || `Invalid ${CHANNEL_SECRET_ENV_VAR} (${keyCheck.code})`), {
      status: 503,
      code: keyCheck.code || ('CHANNEL_SECRET_KEY_MISSING' as ChannelCryptoErrorCode),
    });
  }

  const aad = buildChannelSecretAAD(organizationId, channelId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyCheck.keyBuffer, iv, { authTagLength: 16 });
  cipher.setAAD(aad);

  const ciphertextBuf = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf-8')), cipher.final()]);
  const authTagBuf = cipher.getAuthTag();

  return {
    __encrypted: true,
    version: 1,
    iv: iv.toString('base64'),
    authTag: authTagBuf.toString('base64'),
    ciphertext: ciphertextBuf.toString('base64'),
  };
}

/**
 * Decrypts and authenticates an `EncryptedSecretEnvelope` using AES-256-GCM and `AAD = "${organizationId}:${channelId}"`.
 * Fails closed with `AUTH_TAG_MISMATCH` or `INVALID_ENCRYPTED_ENVELOPE` if tampered or if AAD context differs.
 */
export function decryptSecretValue(
  envelope: unknown,
  organizationId: string,
  channelId: string,
  rawKeyOverride?: string
): string {
  const keyCheck = validateChannelEncryptionKey(
    rawKeyOverride !== undefined ? rawKeyOverride : process.env[CHANNEL_SECRET_ENV_VAR]
  );
  if (!keyCheck.valid || !keyCheck.keyBuffer) {
    throw Object.assign(new Error(keyCheck.reason || `Invalid ${CHANNEL_SECRET_ENV_VAR} (${keyCheck.code})`), {
      status: 503,
      code: keyCheck.code || ('CHANNEL_SECRET_KEY_MISSING' as ChannelCryptoErrorCode),
    });
  }

  const aad = buildChannelSecretAAD(organizationId, channelId);

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw Object.assign(new Error('Encrypted secret envelope must be a non-null JSON object (INVALID_ENCRYPTED_ENVELOPE).'), {
      status: 400,
      code: 'INVALID_ENCRYPTED_ENVELOPE' as ChannelCryptoErrorCode,
    });
  }

  const envObj = envelope as Record<string, unknown>;
  if (
    envObj.__encrypted !== true ||
    envObj.version !== 1 ||
    typeof envObj.iv !== 'string' ||
    typeof envObj.authTag !== 'string' ||
    typeof envObj.ciphertext !== 'string'
  ) {
    throw Object.assign(
      new Error('Encrypted secret envelope is missing required schema fields {__encrypted:true, version:1, iv, authTag, ciphertext} (INVALID_ENCRYPTED_ENVELOPE).'),
      {
        status: 400,
        code: 'INVALID_ENCRYPTED_ENVELOPE' as ChannelCryptoErrorCode,
      }
    );
  }

  const ivBuf = Buffer.from(envObj.iv, 'base64');
  const authTagBuf = Buffer.from(envObj.authTag, 'base64');
  const ciphertextBuf = Buffer.from(envObj.ciphertext, 'base64');

  if (
    ivBuf.byteLength !== 12 ||
    authTagBuf.byteLength !== 16 ||
    !isStrictBase64(envObj.iv, ivBuf) ||
    !isStrictBase64(envObj.authTag, authTagBuf) ||
    (envObj.ciphertext.length > 0 && !isStrictBase64(envObj.ciphertext, ciphertextBuf))
  ) {
    throw Object.assign(
      new Error('Encrypted secret envelope contains malformed base64 or invalid IV/authTag byte lengths (INVALID_ENCRYPTED_ENVELOPE).'),
      {
        status: 400,
        code: 'INVALID_ENCRYPTED_ENVELOPE' as ChannelCryptoErrorCode,
      }
    );
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyCheck.keyBuffer, ivBuf, { authTagLength: 16 });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTagBuf);
    const plaintextBuf = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
    return plaintextBuf.toString('utf-8');
  } catch {
    throw Object.assign(
      new Error(
        `Authenticated decryption failed (AUTH_TAG_MISMATCH) for channel context [${organizationId.trim()}:${channelId.trim()}]. Ciphertext, authTag, key, or AAD context does not match.`
      ),
      {
        status: 400,
        code: 'AUTH_TAG_MISMATCH' as ChannelCryptoErrorCode,
      }
    );
  }
}

/**
 * Encrypts all secret fields in a channel `config` object for disk persistence,
 * and immediately performs a trial decryption verification on each field to guarantee integrity before disk write.
 */
export function encryptChannelConfigForDisk(
  config: Record<string, any>,
  organizationId: string,
  channelId: string,
  rawKeyOverride?: string
): Record<string, any> {
  if (!config || typeof config !== 'object') return {};
  const out: Record<string, any> = {};

  for (const [key, val] of Object.entries(config)) {
    if (val === undefined) continue;
    if (isEncryptedSecretEnvelope(val)) {
      // Verify that an already-encrypted envelope is valid for this exact AAD and key
      const verifiedPlaintext = decryptSecretValue(val, organizationId, channelId, rawKeyOverride);
      const reEncrypted = encryptSecretValue(verifiedPlaintext, organizationId, channelId, rawKeyOverride);
      const roundtrip = decryptSecretValue(reEncrypted, organizationId, channelId, rawKeyOverride);
      if (roundtrip !== verifiedPlaintext) {
        throw Object.assign(new Error('Trial decryption verification failed after re-encryption (ENCRYPTION_VERIFICATION_FAILED).'), {
          status: 500,
          code: 'ENCRYPTION_VERIFICATION_FAILED' as ChannelCryptoErrorCode,
        });
      }
      out[key] = reEncrypted;
    } else if (isChannelSecretField(key) && typeof val === 'string' && val.length > 0 && val !== '[REDACTED_SECRET]') {
      const encrypted = encryptSecretValue(val, organizationId, channelId, rawKeyOverride);
      // Immediate trial decryption verification before allowing disk write
      const verifiedPlaintext = decryptSecretValue(encrypted, organizationId, channelId, rawKeyOverride);
      if (verifiedPlaintext !== val) {
        throw Object.assign(new Error('Trial decryption verification failed on encrypted channel secret (ENCRYPTION_VERIFICATION_FAILED).'), {
          status: 500,
          code: 'ENCRYPTION_VERIFICATION_FAILED' as ChannelCryptoErrorCode,
        });
      }
      out[key] = encrypted;
    } else if (isChannelSecretField(key) && val === '[REDACTED_SECRET]') {
      // Never persist literal '[REDACTED_SECRET]' placeholder as a secret on disk
      continue;
    } else {
      out[key] = val;
    }
  }

  return out;
}

/**
 * Inspects a raw `config` object from disk and determines whether it contains:
 * - encrypted secret envelopes (`hasEncryptedSecrets`)
 * - legacy plain-text secret strings (`hasLegacyPlaintextSecrets`)
 */
export function inspectDiskChannelConfigSecrets(config: Record<string, any> | undefined): {
  hasEncryptedSecrets: boolean;
  hasLegacyPlaintextSecrets: boolean;
  secretFieldKeys: string[];
} {
  let hasEncryptedSecrets = false;
  let hasLegacyPlaintextSecrets = false;
  const secretFieldKeys: string[] = [];

  if (!config || typeof config !== 'object') {
    return { hasEncryptedSecrets, hasLegacyPlaintextSecrets, secretFieldKeys };
  }

  for (const [key, val] of Object.entries(config)) {
    if (isEncryptedSecretEnvelope(val)) {
      hasEncryptedSecrets = true;
      secretFieldKeys.push(key);
    } else if (isChannelSecretField(key) && typeof val === 'string' && val.length > 0 && val !== '[REDACTED_SECRET]') {
      hasLegacyPlaintextSecrets = true;
      secretFieldKeys.push(key);
    }
  }

  return { hasEncryptedSecrets, hasLegacyPlaintextSecrets, secretFieldKeys };
}

/**
 * Checks whether a runtime channel `config` object has at least one configured secret credential.
 */
export function hasConfiguredSecretCredential(config: Record<string, any> | undefined): boolean {
  if (!config || typeof config !== 'object') return false;
  for (const [key, val] of Object.entries(config)) {
    if (isChannelSecretField(key) && typeof val === 'string' && val.trim().length > 0 && val !== '[REDACTED_SECRET]') {
      return true;
    }
  }
  return false;
}
