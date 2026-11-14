import crypto from "crypto";
import path from "path";
import { existsSync, mkdirSync, openSync, writeFileSync, readFileSync, fsyncSync, closeSync, unlinkSync } from "fs";
import { validateChannelEncryptionKey } from "./channelCrypto.ts";
import { validateAuditHmacKey } from "./audit.ts";

export type RuntimeEnvironment = "production" | "development" | "test" | "unknown";

export interface KeyProvisioningResult {
  ok: boolean;
  env: RuntimeEnvironment;
  source: "env" | "dev_keyfile_existing" | "dev_keyfile_created" | "none";
  errorCode?: string;
  errorMessage?: string;
  keyFilePath?: string;
}

export function classifyRuntimeEnvironment(rawEnv: string | undefined = process.env.NODE_ENV): RuntimeEnvironment {
  if (rawEnv === "production" || rawEnv === "development" || rawEnv === "test") return rawEnv;
  return "unknown";
}

function writeExclusiveKeyFile(filePath: string, payload: string): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fd = openSync(filePath, "wx", 0o600);
  try {
    writeFileSync(fd, payload, "utf8");
    try { fsyncSync(fd); } catch (_) {}
  } finally {
    try { closeSync(fd); } catch (_) {}
  }
}
function generateDistinctKeyPair(): { channelSecretEncryptionKey: string; auditCheckpointHmacKey: string } {
  const channelSecretEncryptionKey = crypto.randomBytes(32).toString("hex");
  let auditCheckpointHmacKey = crypto.randomBytes(32).toString("hex");
  while (auditCheckpointHmacKey === channelSecretEncryptionKey) {
    auditCheckpointHmacKey = crypto.randomBytes(32).toString("hex");
  }
  return { channelSecretEncryptionKey, auditCheckpointHmacKey };
}

export function ensureRuntimeCryptoKeys(persistFilePath: string): KeyProvisioningResult {
  const env = classifyRuntimeEnvironment(process.env.NODE_ENV);
  if (env === "unknown") {
    return { ok: false, env, source: "none", errorCode: "UNKNOWN_RUNTIME_ENVIRONMENT", errorMessage: "NODE_ENV must be explicitly set to production, development, or test." };
  }

  const hasChannelEnv = typeof process.env.CHANNEL_SECRET_ENCRYPTION_KEY === "string" && process.env.CHANNEL_SECRET_ENCRYPTION_KEY.length > 0;
  const hasAuditEnv = typeof process.env.AUDIT_CHECKPOINT_HMAC_KEY === "string" && process.env.AUDIT_CHECKPOINT_HMAC_KEY.length > 0;

  if (env === "production" || env === "test" || (hasChannelEnv && hasAuditEnv)) {
    const chCheck = validateChannelEncryptionKey(process.env.CHANNEL_SECRET_ENCRYPTION_KEY);
    if (!chCheck.valid) {
      return { ok: false, env, source: "none", errorCode: chCheck.code || "CHANNEL_SECRET_KEY_INVALID", errorMessage: "CHANNEL_SECRET_ENCRYPTION_KEY is missing or invalid for runtime environment." };
    }
    const auCheck = validateAuditHmacKey();
    if (!auCheck.ok) {
      return { ok: false, env, source: "none", errorCode: auCheck.code || "AUDIT_KEY_INVALID", errorMessage: "AUDIT_CHECKPOINT_HMAC_KEY is missing or invalid for runtime environment." };
    }
    return { ok: true, env, source: "env" };
  }
  const keyFilePath = path.join(path.dirname(persistFilePath), ".omniflow-dev-keys.json");
  if (existsSync(keyFilePath)) {
    try {
      const parsed = JSON.parse(readFileSync(keyFilePath, "utf8"));
      const k1 = typeof parsed?.channelSecretEncryptionKey === "string" ? parsed.channelSecretEncryptionKey : "";
      const k2 = typeof parsed?.auditCheckpointHmacKey === "string" ? parsed.auditCheckpointHmacKey : "";
      if (!hasChannelEnv) process.env.CHANNEL_SECRET_ENCRYPTION_KEY = k1;
      if (!hasAuditEnv) process.env.AUDIT_CHECKPOINT_HMAC_KEY = k2;
      const chCheck = validateChannelEncryptionKey(process.env.CHANNEL_SECRET_ENCRYPTION_KEY);
      const auCheck = validateAuditHmacKey();
      if (!chCheck.valid || !auCheck.ok) {
        return { ok: false, env, source: "none", errorCode: "DEV_KEYFILE_CORRUPTED", errorMessage: "Local development keyfile failed validation.", keyFilePath };
      }
      return { ok: true, env, source: "dev_keyfile_existing", keyFilePath };
    } catch (_) {
      return { ok: false, env, source: "none", errorCode: "DEV_KEYFILE_CORRUPTED", errorMessage: "Local development keyfile could not be parsed.", keyFilePath };
    }
  }

  if (existsSync(persistFilePath)) {
    return { ok: false, env, source: "none", errorCode: "DEV_KEYS_MISSING_FOR_EXISTING_DB", errorMessage: "Existing persistence file found without provisioned keys; refusing silent key generation.", keyFilePath };
  }

  const keys = generateDistinctKeyPair();
  const payload = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), ...keys }, null, 2);
  try {
    writeExclusiveKeyFile(keyFilePath, payload);
  } catch (err: any) {
    if (err?.code === "EEXIST" && existsSync(keyFilePath)) {
      return ensureRuntimeCryptoKeys(persistFilePath);
    }
    try { if (existsSync(keyFilePath)) unlinkSync(keyFilePath); } catch (_) {}
    return { ok: false, env, source: "none", errorCode: "DEV_KEYFILE_WRITE_FAILED", errorMessage: "Failed to provision local development keyfile.", keyFilePath };
  }
  if (!hasChannelEnv) process.env.CHANNEL_SECRET_ENCRYPTION_KEY = keys.channelSecretEncryptionKey;
  if (!hasAuditEnv) process.env.AUDIT_CHECKPOINT_HMAC_KEY = keys.auditCheckpointHmacKey;
  return { ok: true, env, source: "dev_keyfile_created", keyFilePath };
}
  
