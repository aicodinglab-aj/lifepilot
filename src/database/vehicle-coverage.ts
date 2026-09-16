import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { parseCoverageKind, validateCoverageOwner, type CoverageCleanup, type CoverageDocument, type CoverageDraft, type CoverageKind, type CoverageRecord } from '@/features/vehicles/coverage-record';
import { calendarDay } from '@/features/vehicles/coverage-status';

function tables(kind: CoverageKind) {
  parseCoverageKind(kind);
  // SQL identifiers come only from this closed mapping, never route/user strings.
  return kind === 'insurance' ? { records: 'vehicle_insurance', documents: 'insurance_documents', start: 'start_date',
    fields: ['provider', 'policy_number', 'policy_type', 'start_date', 'expiry_date', 'premium_amount', 'notes'],
    select: 'provider, policy_number AS number, policy_type AS policyType, start_date AS startDate, premium_amount AS amount' }
    : { records: 'vehicle_puc', documents: 'puc_documents', start: 'issue_date',
      fields: ['testing_center', 'certificate_number', 'issue_date', 'expiry_date', 'amount', 'notes'],
      select: 'testing_center AS provider, certificate_number AS number, NULL AS policyType, issue_date AS startDate, amount' };
}
function columns(kind: CoverageKind) {
  return `id, vehicle_id AS vehicleId, ${tables(kind).select}, expiry_date AS expiryDate, notes,
    created_at AS createdAt, updated_at AS updatedAt, revision`;
}
export const COVERAGE_PAGE_SIZE = 40;
export function getCoverageRecord(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, recordId: string) {
  validateCoverageOwner(vehicleId, recordId);
  return db.getFirstAsync<CoverageRecord>(`SELECT ${columns(kind)} FROM ${tables(kind).records} WHERE vehicle_id = ? AND id = ?`, [vehicleId, recordId]);
}
export function getCoverageHistory(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, cursor?: CoverageRecord) {
  validateCoverageOwner(vehicleId);
  return db.getAllAsync<CoverageRecord>(`SELECT ${columns(kind)} FROM ${tables(kind).records} WHERE vehicle_id = ?
    ${cursor ? 'AND (expiry_date, created_at, id) < (?, ?, ?)' : ''}
    ORDER BY expiry_date DESC, created_at DESC, id DESC LIMIT ?`,
    cursor ? [vehicleId, cursor.expiryDate, cursor.createdAt, cursor.id, COVERAGE_PAGE_SIZE] : [vehicleId, COVERAGE_PAGE_SIZE]);
}
export async function getCurrentCoverage(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, today: string) {
  validateCoverageOwner(vehicleId);
  if (calendarDay(today) == null) throw new Error('Invalid current date.');
  const table = tables(kind);
  // Prefer an already effective, unexpired record. A future renewal must not mask current coverage.
  const current = await db.getFirstAsync<CoverageRecord>(`SELECT ${columns(kind)} FROM ${table.records}
    WHERE vehicle_id = ? AND expiry_date >= ? AND (${table.start} IS NULL OR ${table.start} <= ?)
    ORDER BY expiry_date DESC, created_at DESC, id DESC LIMIT 1`, [vehicleId, today, today]);
  if (current) return current;
  return db.getFirstAsync<CoverageRecord>(`SELECT ${columns(kind)} FROM ${table.records} WHERE vehicle_id = ?
    ORDER BY expiry_date DESC, created_at DESC, id DESC LIMIT 1`, [vehicleId]);
}
export function getCoverageDocuments(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, recordId: string) {
  validateCoverageOwner(vehicleId, recordId);
  return db.getAllAsync<CoverageDocument>(`SELECT id, vehicle_id AS vehicleId, record_id AS recordId, local_uri AS localUri,
    created_at AS createdAt FROM ${tables(kind).documents} WHERE vehicle_id = ? AND record_id = ? ORDER BY created_at, id`, [vehicleId, recordId]);
}
export function getCoverageDocument(db: SQLiteDatabase, job: CoverageCleanup) {
  validateCoverageOwner(job.vehicleId, job.recordId, job.documentId);
  return db.getFirstAsync(`SELECT id FROM ${tables(job.kind).documents} WHERE vehicle_id = ? AND record_id = ? AND id = ?`,
    [job.vehicleId, job.recordId, job.documentId]);
}
async function transaction(db: SQLiteDatabase, action: (tx: SQLiteDatabase) => Promise<void>) {
  const slash = db.databasePath.lastIndexOf('/');
  const tx = await openDatabaseAsync(db.databasePath.slice(slash + 1), { ...db.options, useNewConnection: true }, db.databasePath.slice(0, slash));
  try {
    await tx.execAsync('PRAGMA foreign_keys = ON;');
    await tx.withTransactionAsync(() => action(tx));
  } finally { await tx.closeAsync(); }
}
export async function writeCoverage(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, id: string,
  draft: CoverageDraft, revision: number | null, added: CoverageDocument[], removed: string[]) {
  validateCoverageOwner(vehicleId, id, ...removed);
  const table = tables(kind);
  await transaction(db, async (tx) => {
    const now = new Date().toISOString();
    const values = kind === 'insurance'
      ? [draft.provider, draft.number, draft.policyType, draft.startDate, draft.expiryDate, draft.amount, draft.notes]
      : [draft.provider, draft.number, draft.startDate, draft.expiryDate, draft.amount, draft.notes];
    if (revision == null) {
      if (removed.length) throw new Error('A new record has no saved documents to remove.');
      await tx.runAsync(`INSERT INTO ${table.records} (id, vehicle_id, ${table.fields.join(', ')}, created_at, updated_at)
        VALUES (?, ?, ${table.fields.map(() => '?').join(', ')}, ?, ?)`, [id, vehicleId, ...values, now, now]);
    } else {
      const result = await tx.runAsync(`UPDATE ${table.records} SET ${table.fields.map((field) => `${field} = ?`).join(', ')},
        updated_at = ?, revision = revision + 1 WHERE vehicle_id = ? AND id = ? AND revision = ?`, [...values, now, vehicleId, id, revision]);
      if (result.changes !== 1) throw new Error('This record changed or was deleted. Reopen it before editing.');
    }
    for (const documentId of new Set(removed)) {
      const result = await tx.runAsync(`DELETE FROM ${table.documents} WHERE vehicle_id = ? AND record_id = ? AND id = ?`, [vehicleId, id, documentId]);
      if (result.changes !== 1) throw new Error('This document no longer belongs to the record. Reopen the editor.');
    }
    for (const doc of added) {
      validateCoverageOwner(vehicleId, doc.id);
      if (doc.vehicleId !== vehicleId || doc.recordId !== id) throw new Error('Invalid document owner.');
      await tx.runAsync(`INSERT INTO ${table.documents} (id, vehicle_id, record_id, local_uri, created_at) VALUES (?, ?, ?, ?, ?)`,
        [doc.id, vehicleId, id, doc.localUri, doc.createdAt]);
      await clearCoverageCleanup(tx, { kind, vehicleId, recordId: id, documentId: doc.id });
    }
  });
}
export async function deleteCoverageRecord(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, recordId: string) {
  validateCoverageOwner(vehicleId, recordId);
  await transaction(db, async (tx) => {
    await tx.runAsync(`DELETE FROM ${tables(kind).records} WHERE vehicle_id = ? AND id = ?`, [vehicleId, recordId]);
  });
}
export async function queueCoverageCleanup(db: SQLiteDatabase, job: CoverageCleanup) {
  parseCoverageKind(job.kind); validateCoverageOwner(job.vehicleId, job.recordId, job.documentId);
  await db.runAsync(`INSERT INTO coverage_document_cleanup (kind, vehicle_id, record_id, document_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    [job.kind, job.vehicleId, job.recordId, job.documentId, new Date().toISOString()]);
}
export function getCoverageCleanup(db: SQLiteDatabase, vehicleId?: number) {
  return db.getAllAsync<CoverageCleanup>(`SELECT kind, vehicle_id AS vehicleId, record_id AS recordId, document_id AS documentId
    FROM coverage_document_cleanup ${vehicleId == null ? '' : 'WHERE vehicle_id = ?'}`, vehicleId == null ? [] : [vehicleId]);
}
export async function clearCoverageCleanup(db: SQLiteDatabase, job: CoverageCleanup) {
  await db.runAsync('DELETE FROM coverage_document_cleanup WHERE kind = ? AND vehicle_id = ? AND record_id = ? AND document_id = ?',
    [job.kind, job.vehicleId, job.recordId, job.documentId]);
}
