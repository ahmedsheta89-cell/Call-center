import fs from 'fs';
import os from 'os';
import path from 'path';

export const CURRENT_SCHEMA_VERSION = 2;
export const SUPPORTED_LEGACY_VERSIONS = new Set(['1.0', '1.1.0-enterprise-p1', '1.3.2-enterprise-p1-3-2']);
export const SCHEMA_V2_COLLECTION_KEYS = [
  'organizations', 'users', 'teams', 'agents', 'customers', 'customerChannels',
  'conversations', 'messages', 'calls', 'tickets', 'slaPolicies', 'knowledgeDocuments',
  'qaRubrics', 'qaEvaluations', 'automationRules', 'shifts', 'channelConfigs',
  'recommendations', 'coachingPlans', 'macros', 'teamQaFeedback', 'connectedDevices', 'crossDeviceSyncEvents'
];

export interface StorageRecoveryEvent { timestamp: string; reason: string; code: string; primaryPath: string; backupSourcePath: string; quarantinedCorruptPath: string | null; restoredSchemaVersion: number; }
const FORBIDDEN_SYS = /^([a-zA-Z]:[\\/](Windows|Program Files|Program Files \(x86\))([\\/]|$)|\/(proc|sys|dev|etc)(\/|$))/i;

export function verifyDirectoryWritable(dirPath: string): { ok: boolean; errorCode?: string; errorMessage?: string } {
  try {
    if (fs.existsSync(dirPath)) { if (!fs.statSync(dirPath).isDirectory()) return { ok: false, errorCode: 'INVALID_DATA_DIR', errorMessage: 'Path is a file' }; }
    else fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    const p = path.join(dirPath, '.probe.' + process.pid + '.' + Date.now() + '.tmp');
    const fd = fs.openSync(p, 'w', 0o600); fs.writeFileSync(fd, 'ok', 'utf8'); try { fs.fsyncSync(fd); } catch (_) {} fs.closeSync(fd); fs.unlinkSync(p);
    return { ok: true };
  } catch (e: any) { return { ok: false, errorCode: ['EACCES', 'EPERM', 'EROFS'].includes(e?.code) ? 'DATA_DIR_NOT_WRITABLE' : 'INVALID_DATA_DIR', errorMessage: e?.message || 'Not writable' }; }
}

export function resolveDurableDataPath(customPath: string | null = null, envObj: NodeJS.ProcessEnv = process.env) {
  if (customPath !== null && customPath !== undefined) {
    const t = String(customPath).trim();
    if (!t || t.includes('\0')) return { ok: false, filePath: '', dirPath: '', source: 'CUSTOM_OVERRIDE', errorCode: 'INVALID_DATA_DIR', errorMessage: 'Empty custom path' };
    if (FORBIDDEN_SYS.test(t) || FORBIDDEN_SYS.test(path.dirname(path.resolve(t)))) return { ok: false, filePath: t, dirPath: path.dirname(t), source: 'CUSTOM_OVERRIDE', errorCode: 'FORBIDDEN_SYSTEM_DATA_DIR', errorMessage: 'Protected OS path' };
    return { ok: true, filePath: path.resolve(t), dirPath: path.dirname(path.resolve(t)), source: 'CUSTOM_OVERRIDE' };
  }
  if (envObj.OMNIFLOW_DATA_DIR !== undefined) {
    const t = String(envObj.OMNIFLOW_DATA_DIR).trim();
    if (!t || t.includes('\0')) return { ok: false, filePath: '', dirPath: '', source: 'OMNIFLOW_DATA_DIR', errorCode: 'INVALID_DATA_DIR', errorMessage: 'Empty OMNIFLOW_DATA_DIR' };
    if (FORBIDDEN_SYS.test(t) || FORBIDDEN_SYS.test(path.resolve(t))) return { ok: false, filePath: t + '/db_state.json', dirPath: t, source: 'OMNIFLOW_DATA_DIR', errorCode: 'FORBIDDEN_SYSTEM_DATA_DIR', errorMessage: 'Protected OS path' };
    const dir = path.resolve(t); const chk = verifyDirectoryWritable(dir);
    if (!chk.ok) return { ok: false, filePath: path.join(dir, 'db_state.json'), dirPath: dir, source: 'OMNIFLOW_DATA_DIR', errorCode: chk.errorCode, errorMessage: chk.errorMessage };
    return { ok: true, filePath: path.join(dir, 'db_state.json'), dirPath: dir, source: 'OMNIFLOW_DATA_DIR' };
  }
  const defDir = path.resolve(process.cwd(), 'data');
  return { ok: true, filePath: path.join(defDir, 'db_state.json'), dirPath: defDir, source: 'DEFAULT_DATA_DIR' };
}

export function isProcessAlive(pid: number): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

export function getLockFilePathForTarget(target: string): string {
  const d = path.dirname(path.resolve(target)), b = path.basename(target);
  return b === 'db_state.json' ? path.join(d, 'db_state.lock') : path.join(d, b + '.lock');
}

export function acquireDirectoryLock(target: string, currentPid: number = process.pid, currentHost: string = os.hostname()) {
  const resolvedTarget = path.resolve(target);
  const lockPath = getLockFilePathForTarget(resolvedTarget);
  try { fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 }); } catch (e: any) { return { ok: false, lockPath, errorCode: 'LOCK_DIR_CREATE_FAILED', errorMessage: e?.message }; }
  const makePayload = () => JSON.stringify({ pid: currentPid, hostname: currentHost, startedAt: new Date().toISOString(), targetPath: resolvedTarget });
  try {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try { fs.writeFileSync(fd, makePayload(), 'utf8'); try { fs.fsyncSync(fd); } catch (_) {} } finally { fs.closeSync(fd); }
    return { ok: true, lockPath, ownerPid: currentPid };
  } catch (e: any) { if (e?.code !== 'EEXIST') return { ok: false, lockPath, errorCode: e?.code || 'LOCK_ACQUIRE_FAILED', errorMessage: e?.message }; }
  let ex: any = null;
  try { ex = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (_) { return { ok: false, lockPath, errorCode: 'MALFORMED_LOCK_FILE', errorMessage: 'Malformed lock file' }; }
  if (!ex || typeof ex !== 'object' || typeof ex.pid !== 'number' || !Number.isInteger(ex.pid) || typeof ex.hostname !== 'string' || !ex.hostname) return { ok: false, lockPath, errorCode: 'MALFORMED_LOCK_FILE', errorMessage: 'Invalid lock metadata' };
  if (ex.hostname !== currentHost) return { ok: false, lockPath, ownerPid: ex.pid, errorCode: 'LOCK_OWNED_BY_DIFFERENT_HOST', errorMessage: 'Locked by host ' + ex.hostname };
  if (ex.pid === currentPid) return { ok: true, lockPath, ownerPid: currentPid };
  if (isProcessAlive(ex.pid)) return { ok: false, lockPath, ownerPid: ex.pid, errorCode: 'STORAGE_LOCKED_BY_ACTIVE_PROCESS', errorMessage: 'Locked by active PID ' + ex.pid };
  const claimPath = lockPath + '.reclaiming';
  let claimFd: number | null = null;
  try { claimFd = fs.openSync(claimPath, 'wx', 0o600); } catch (_) { return { ok: false, lockPath, errorCode: 'CONCURRENT_STALE_LOCK_RECOVERY', errorMessage: 'Concurrent recovery' }; }
  try {
    const recheck = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (recheck.hostname !== currentHost || (recheck.pid !== ex.pid && isProcessAlive(recheck.pid))) return { ok: false, lockPath, ownerPid: recheck.pid, errorCode: 'STORAGE_LOCKED_BY_ACTIVE_PROCESS', errorMessage: 'Claimed by another process' };
    const tmpLock = lockPath + '.claim.' + currentPid + '.' + Date.now() + '.tmp';
    const fd = fs.openSync(tmpLock, 'wx', 0o600);
    try { fs.writeFileSync(fd, makePayload(), 'utf8'); try { fs.fsyncSync(fd); } catch (_) {} } finally { fs.closeSync(fd); }
    fs.renameSync(tmpLock, lockPath);
    return { ok: true, lockPath, ownerPid: currentPid, recoveredStalePid: ex.pid };
  } catch (e: any) { return { ok: false, lockPath, errorCode: 'STALE_LOCK_RECOVERY_FAILED', errorMessage: e?.message }; }
  finally { if (claimFd !== null) { try { fs.closeSync(claimFd); } catch (_) {} try { if (fs.existsSync(claimPath)) fs.unlinkSync(claimPath); } catch (_) {} } }
}

export function releaseDirectoryLock(target: string, currentPid: number = process.pid, currentHost: string = os.hostname()): boolean {
  const lockPath = getLockFilePathForTarget(path.resolve(target));
  if (!fs.existsSync(lockPath)) return true;
  try {
    const p = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (!p || p.pid !== currentPid || (p.hostname && p.hostname !== currentHost)) return false;
    fs.unlinkSync(lockPath); return true;
  } catch (_) { return false; }
}

export function writeVerifiedAtomicFileSync(target: string, content: string): void {
  const dir = path.dirname(target); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, '.callcenter-db.' + process.pid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8) + '.tmp');
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, 'w', 0o600); fs.writeFileSync(fd, content, 'utf8'); try { fs.fsyncSync(fd); } catch (_) {} fs.closeSync(fd); fd = null;
    if (fs.statSync(tmp).size <= 0) throw new Error('Empty staging write');
    JSON.parse(fs.readFileSync(tmp, 'utf8'));
    fs.renameSync(tmp, target);
    try { const dfd = fs.openSync(dir, 'r'); try { fs.fsyncSync(dfd); } catch (_) {} fs.closeSync(dfd); } catch (_) {}
  } catch (e) { if (fd !== null) try { fs.closeSync(fd); } catch (_) {} try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {} throw e; }
}

export function isValidSnapshotObject(p: any): boolean {
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Array.isArray(p.organizations) || p.organizations.length === 0) return false;
  if (p.schemaVersion !== undefined && (typeof p.schemaVersion !== 'number' || !Number.isInteger(p.schemaVersion) || p.schemaVersion < 1 || p.schemaVersion > CURRENT_SCHEMA_VERSION)) return false;
  return true;
}

export function preserveLastKnownGoodBackup(primary: string, newContent?: string): string {
  const bak = primary + '.bak';
  if (fs.existsSync(primary)) { try { const r = fs.readFileSync(primary, 'utf8'); if (isValidSnapshotObject(JSON.parse(r))) { writeVerifiedAtomicFileSync(bak, r); return bak; } } catch (_) {} }
  if (newContent && !fs.existsSync(bak)) { try { writeVerifiedAtomicFileSync(bak, newContent); } catch (_) {} }
  return bak;
}

export function quarantineCorruptFile(corruptPath: string): string | null {
  if (!fs.existsSync(corruptPath)) return null;
  const q = corruptPath + '.corrupt.' + Date.now() + '.json';
  try { const r = fs.readFileSync(corruptPath); const fd = fs.openSync(q, 'w', 0o600); fs.writeFileSync(fd, r); try { fs.fsyncSync(fd); } catch (_) {} fs.closeSync(fd); return q; } catch (_) { return null; }
}

export function validateAndMigrateSchemaPayload(p: any, target: string, simFail = false) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, migrated: false, errorCode: 'DISK_LOAD_INVALID_SCHEMA', errorMessage: 'Root must be object', protectExistingFile: true };
  if (p.schemaVersion !== undefined) {
    if (typeof p.schemaVersion !== 'number' || !Number.isInteger(p.schemaVersion) || p.schemaVersion < 1) return { ok: false, migrated: false, errorCode: 'INVALID_SCHEMA_VERSION', errorMessage: 'Invalid schemaVersion', protectExistingFile: true };
    if (p.schemaVersion > CURRENT_SCHEMA_VERSION) return { ok: false, migrated: false, errorCode: 'UNSUPPORTED_FUTURE_SCHEMA_VERSION', errorMessage: 'Unsupported future schemaVersion ' + p.schemaVersion, protectExistingFile: true };
  } else if (p.version !== undefined && !SUPPORTED_LEGACY_VERSIONS.has(String(p.version))) return { ok: false, migrated: false, errorCode: 'UNSUPPORTED_LEGACY_FORMAT', errorMessage: 'Unsupported legacy format', protectExistingFile: true };
  if (!Array.isArray(p.organizations) || p.organizations.length === 0) return { ok: false, migrated: false, errorCode: 'DISK_LOAD_INVALID_SCHEMA', errorMessage: 'Missing organizations', protectExistingFile: true };
  if (p.schemaVersion === CURRENT_SCHEMA_VERSION) return { ok: true, payload: p, migrated: false };
  const fromVersion = p.schemaVersion ?? String(p.version || '1.0');
  if (fs.existsSync(target)) { try { writeVerifiedAtomicFileSync(target + '.pre-migration-v1.bak', fs.readFileSync(target, 'utf8')); } catch (e: any) { return { ok: false, migrated: false, errorCode: 'PRE_MIGRATION_BACKUP_FAILED', errorMessage: e?.message, protectExistingFile: true }; } }
  if (simFail) return { ok: false, migrated: false, errorCode: 'MIGRATION_EXECUTION_FAILED', errorMessage: 'Mid-migration failure', protectExistingFile: true };
  const normalized: Record<string, any> = { ...p, schemaVersion: CURRENT_SCHEMA_VERSION, version: p.version || '1.3.2-enterprise-p1-3-2', migratedAt: new Date().toISOString(), migratedFromSchemaVersion: fromVersion };
  for (const key of SCHEMA_V2_COLLECTION_KEYS) { if (!Array.isArray(normalized[key])) normalized[key] = []; }
  return { ok: true, payload: normalized, migrated: true, fromVersion };
}

export function installDurableStoreLifecycle(store: any): void {
  const origExportFull = store.exportFullBackup.bind(store);
  store.exportFullBackup = () => ({ schemaVersion: CURRENT_SCHEMA_VERSION, ...origExportFull() });
  const origBuildSnap = store.buildEncryptedDiskSnapshot.bind(store);
  store.buildEncryptedDiskSnapshot = () => ({ schemaVersion: CURRENT_SCHEMA_VERSION, ...origBuildSnap() });
  const origLoad = store.loadFromDisk.bind(store);

  store.saveToDisk = (): boolean => {
    const pathRes = resolveDurableDataPath(store.customPersistFilePath ?? null);
    const targetPath = pathRes.ok ? pathRes.filePath : '';
    if (!pathRes.ok || !targetPath) { store.recordStorageError('saveToDisk', pathRes.errorCode || 'PERSIST_PATH_UNAVAILABLE', pathRes.errorMessage || 'Invalid storage path'); return false; }
    store.persistFilePath = targetPath;
    if (store.existingFileProtected) { store.recordStorageError('saveToDisk', 'EXISTING_FILE_PROTECTED', 'Refusing to overwrite: ' + store.existingFileProtectionReason); return false; }
    try {
      const serialized = JSON.stringify(store.buildEncryptedDiskSnapshot(), null, 2);
      preserveLastKnownGoodBackup(targetPath, serialized);
      writeVerifiedAtomicFileSync(targetPath, serialized);
      preserveLastKnownGoodBackup(targetPath, serialized);
      store.lastStorageError = null;
      return true;
    } catch (e: any) { store.recordStorageError('saveToDisk', 'DISK_PERSISTENCE_WRITE_FAILED', e?.message || 'Failed atomic write'); return false; }
  };

  store.loadFromDisk = (): boolean => {
    const pathRes = resolveDurableDataPath(store.customPersistFilePath ?? null);
    const targetPath = pathRes.ok ? pathRes.filePath : '';
    if (!pathRes.ok || !targetPath) { store.existingFileProtected = true; store.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY'; store.recordStorageError('loadFromDisk', pathRes.errorCode || 'INVALID_DATA_DIR', pathRes.errorMessage || 'Invalid data dir'); return false; }
    store.persistFilePath = targetPath;
    const bakPath = targetPath + '.bak';
    const tryRecover = (code: string, msg: string, quarantine: boolean): boolean => {
      if (!fs.existsSync(bakPath)) { store.existingFileProtected = true; store.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY'; store.recordStorageError('loadFromDisk', code, msg); return false; }
      try {
        const bakParsed = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
        const bakSchema = validateAndMigrateSchemaPayload(bakParsed, bakPath);
        if (!bakSchema.ok) { store.existingFileProtected = true; store.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY'; store.recordStorageError('loadFromDisk', 'UNRECOVERABLE_STORAGE_CORRUPTION', 'Primary and backup failed schema'); return false; }
        const tmpVerify = targetPath + '.verify.' + process.pid + '.' + Date.now() + '.tmp';
        writeVerifiedAtomicFileSync(tmpVerify, JSON.stringify(bakSchema.payload, null, 2));
        const prevCustom = store.customPersistFilePath;
        store.customPersistFilePath = tmpVerify; store.persistFilePath = tmpVerify; store.existingFileProtected = false; store.existingFileProtectionReason = 'NONE';
        const ok = origLoad();
        store.customPersistFilePath = prevCustom; store.persistFilePath = targetPath;
        try { if (fs.existsSync(tmpVerify)) fs.unlinkSync(tmpVerify); } catch (_) {}
        if (!ok) { store.existingFileProtected = true; store.recordStorageError('loadFromDisk', 'UNRECOVERABLE_STORAGE_CORRUPTION', 'Backup failed integrity'); return false; }
        const qPath = quarantine && fs.existsSync(targetPath) ? quarantineCorruptFile(targetPath) : null;
        store.existingFileProtected = false; store.existingFileProtectionReason = 'NONE'; store.saveToDisk();
        store.lastRecoveryEvent = { timestamp: new Date().toISOString(), reason: msg, code: 'RECOVERED_FROM_VALIDATED_BACKUP', primaryPath: targetPath, backupSourcePath: bakPath, quarantinedCorruptPath: qPath, restoredSchemaVersion: CURRENT_SCHEMA_VERSION };
        return true;
      } catch (e: any) { store.existingFileProtected = true; store.recordStorageError('loadFromDisk', 'UNRECOVERABLE_STORAGE_CORRUPTION', e?.message || 'Recovery failed'); return false; }
    };
    if (!fs.existsSync(targetPath)) return fs.existsSync(bakPath) ? tryRecover('PRIMARY_MISSING', 'Primary missing', false) : (store.recordStorageError('loadFromDisk', 'FILE_NOT_FOUND', 'Not found: ' + targetPath), false);
    let raw: string, parsed: any;
    try { raw = fs.readFileSync(targetPath, 'utf8'); } catch (e: any) { store.recordStorageError('loadFromDisk', 'DISK_PERSISTENCE_READ_FAILED', e?.message || 'Read failed'); return false; }
    try { parsed = JSON.parse(raw); } catch (e: any) { return tryRecover('DISK_PERSISTENCE_READ_FAILED', e?.message || 'Parse error', true); }
    const sc = validateAndMigrateSchemaPayload(parsed, targetPath);
    if (!sc.ok) {
      if (sc.errorCode === 'UNSUPPORTED_FUTURE_SCHEMA_VERSION' || sc.errorCode === 'INVALID_SCHEMA_VERSION' || sc.errorCode === 'UNSUPPORTED_LEGACY_FORMAT') { store.existingFileProtected = true; store.existingFileProtectionReason = 'CORRUPTED_OR_EMPTY'; store.recordStorageError('loadFromDisk', sc.errorCode, sc.errorMessage || 'Invalid schema'); return false; }
      return tryRecover(sc.errorCode || 'DISK_LOAD_INVALID_SCHEMA', sc.errorMessage || 'Invalid schema', true);
    }
    if (!origLoad()) return store.existingFileProtectionReason === 'SECRET_KEY_PROTECTED' ? false : tryRecover(store.lastStorageError?.code || 'DISK_LOAD_FAILED', store.lastStorageError?.message || 'Load failed', true);
    if (sc.migrated) store.saveToDisk(); else preserveLastKnownGoodBackup(targetPath, raw);
    return true;
  };
}
