import fs from 'fs';
import os from 'os';
import path from 'path';

export const CURRENT_SCHEMA_VERSION = 2;
export interface StorageRecoveryEvent { timestamp: string; reason: string; code: string; primaryPath: string; backupSourcePath: string; quarantinedCorruptPath: string | null; restoredSchemaVersion: number; }
const FORBIDDEN_SYS = /^([a-zA-Z]:[\\/](Windows|Program Files|Program Files \(x86\))([\\/]|$)|\/(proc|sys|dev|etc)(\/|$))/i;

export function verifyDirectoryWritable(dirPath: string): { ok: boolean; errorCode?: string; errorMessage?: string } {
  try {
    if (fs.existsSync(dirPath)) { if (!fs.statSync(dirPath).isDirectory()) return { ok: false, errorCode: 'INVALID_DATA_DIR', errorMessage: 'Path is a file' }; }
    else fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    const p = path.join(dirPath, `.probe.${process.pid}.${Date.now()}.tmp`);
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
    if (FORBIDDEN_SYS.test(t) || FORBIDDEN_SYS.test(path.resolve(t))) return { ok: false, filePath: `${t}/db_state.json`, dirPath: t, source: 'OMNIFLOW_DATA_DIR', errorCode: 'FORBIDDEN_SYSTEM_DATA_DIR', errorMessage: 'Protected OS path' };
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
  const d = path.dirname(target), b = path.basename(target);
  return b === 'db_state.json' ? path.join(d, 'db_state.lock') : path.join(d, `${b}.lock`);
}

export function acquireDirectoryLock(target: string, currentPid: number = process.pid) {
  const lockPath = getLockFilePathForTarget(target);
  try { fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 }); } catch (e: any) { return { ok: false, lockPath, errorCode: 'LOCK_DIR_CREATE_FAILED', errorMessage: e?.message }; }
  const writeExcl = (recoveredStalePid?: number) => {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ pid: currentPid, hostname: os.hostname(), startedAt: new Date().toISOString(), targetPath: target }), 'utf8'); try { fs.fsyncSync(fd); } catch (_) {} } finally { fs.closeSync(fd); }
    return { ok: true, lockPath, ownerPid: currentPid, recoveredStalePid };
  };
  try { return writeExcl(); } catch (e: any) { if (e?.code !== 'EEXIST') return { ok: false, lockPath, errorCode: e?.code || 'LOCK_ACQUIRE_FAILED', errorMessage: e?.message }; }
  let ex: any = null; try { ex = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (_) {}
  if (ex?.pid === currentPid) return { ok: true, lockPath, ownerPid: currentPid };
  if (typeof ex?.pid === 'number' && isProcessAlive(ex.pid)) return { ok: false, lockPath, ownerPid: ex.pid, errorCode: 'STORAGE_LOCKED_BY_ACTIVE_PROCESS', errorMessage: `Locked by PID ${ex.pid}` };
  try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); return writeExcl(typeof ex?.pid === 'number' ? ex.pid : undefined); } catch (e: any) { return { ok: false, lockPath, errorCode: 'STALE_LOCK_RECOVERY_FAILED', errorMessage: e?.message }; }
}

export function releaseDirectoryLock(target: string, currentPid: number = process.pid): boolean {
  const lockPath = getLockFilePathForTarget(target);
  if (!fs.existsSync(lockPath)) return true;
  try { const p = JSON.parse(fs.readFileSync(lockPath, 'utf8')); if (p && typeof p.pid === 'number' && p.pid !== currentPid) return false; } catch (_) {}
  try { fs.unlinkSync(lockPath); return true; } catch (_) { return false; }
}

export function writeVerifiedAtomicFileSync(target: string, content: string): void {
  const dir = path.dirname(target); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.callcenter-db.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, 'w', 0o600); fs.writeFileSync(fd, content, 'utf8'); try { fs.fsyncSync(fd); } catch (_) {} fs.closeSync(fd); fd = null;
    if (fs.statSync(tmp).size <= 0) throw new Error('Empty staging write');
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
  const bak = `${primary}.bak`;
  if (fs.existsSync(primary)) { try { const r = fs.readFileSync(primary, 'utf8'); if (isValidSnapshotObject(JSON.parse(r))) { writeVerifiedAtomicFileSync(bak, r); return bak; } } catch (_) {} }
  if (newContent && !fs.existsSync(bak)) { try { writeVerifiedAtomicFileSync(bak, newContent); } catch (_) {} }
  return bak;
}

export function quarantineCorruptFile(corruptPath: string): string | null {
  if (!fs.existsSync(corruptPath)) return null;
  const q = `${corruptPath}.corrupt.${Date.now()}.json`;
  try { const r = fs.readFileSync(corruptPath); const fd = fs.openSync(q, 'w', 0o600); fs.writeFileSync(fd, r); try { fs.fsyncSync(fd); } catch (_) {} fs.closeSync(fd); return q; } catch (_) { return null; }
}

export function validateAndMigrateSchemaPayload(p: any, target: string, simFail = false) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, migrated: false, errorCode: 'DISK_LOAD_INVALID_SCHEMA', errorMessage: 'Root must be object', protectExistingFile: true };
  if (p.schemaVersion !== undefined) {
    if (typeof p.schemaVersion !== 'number' || !Number.isInteger(p.schemaVersion) || p.schemaVersion < 1) return { ok: false, migrated: false, errorCode: 'INVALID_SCHEMA_VERSION', errorMessage: 'Invalid schemaVersion', protectExistingFile: true };
    if (p.schemaVersion > CURRENT_SCHEMA_VERSION) return { ok: false, migrated: false, errorCode: 'UNSUPPORTED_FUTURE_SCHEMA_VERSION', errorMessage: `Unsupported future schemaVersion ${p.schemaVersion}`, protectExistingFile: true };
  }
  if (!Array.isArray(p.organizations) || p.organizations.length === 0) return { ok: false, migrated: false, errorCode: 'DISK_LOAD_INVALID_SCHEMA', errorMessage: 'Missing organizations', protectExistingFile: true };
  if ((p.schemaVersion ?? 1) === CURRENT_SCHEMA_VERSION) return { ok: true, payload: p, migrated: false };
  const fromVersion = p.schemaVersion ?? String(p.version || '1.0-legacy');
  if (fs.existsSync(target)) { try { writeVerifiedAtomicFileSync(`${target}.pre-migration-v1.bak`, fs.readFileSync(target, 'utf8')); } catch (e: any) { return { ok: false, migrated: false, errorCode: 'PRE_MIGRATION_BACKUP_FAILED', errorMessage: e?.message, protectExistingFile: true }; } }
  if (simFail) return { ok: false, migrated: false, errorCode: 'MIGRATION_EXECUTION_FAILED', errorMessage: 'Mid-migration failure', protectExistingFile: true };
  return { ok: true, payload: { ...p, schemaVersion: CURRENT_SCHEMA_VERSION, migratedAt: new Date().toISOString(), migratedFromSchemaVersion: fromVersion }, migrated: true, fromVersion };
}
