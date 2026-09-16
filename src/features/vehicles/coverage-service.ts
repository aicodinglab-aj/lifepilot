import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { clearCoverageCleanup, deleteCoverageRecord, getCoverageCleanup, getCoverageDocument, getCoverageRecord, queueCoverageCleanup, writeCoverage } from '@/database/vehicle-coverage';
import { copyCoverageDocument, deleteCoverageDocumentFiles } from '@/storage/coverage-documents';
import { coverageFormToDraft, parseCoverageKind, validateCoverageOwner, type CoverageCleanup, type CoverageDocument, type CoverageForm, type CoverageKind } from './coverage-record';
import type { SelectedVehiclePhoto } from './photo-service';
import { withVehicleOperation } from './vehicle-operation';

async function finishCleanup(db: SQLiteDatabase, job: CoverageCleanup) {
  if (await getCoverageDocument(db, job)) throw new Error('Cleanup refused: this document is still attached.');
  await deleteCoverageDocumentFiles(job);
  await clearCoverageCleanup(db, job);
}
async function cleanJobs(db: SQLiteDatabase, vehicleId: number, kind: CoverageKind, recordId: string) {
  let pending = false;
  for (const job of await getCoverageCleanup(db, vehicleId)) {
    if (job.kind !== kind || job.recordId !== recordId) continue;
    try { await finishCleanup(db, job); } catch { pending = true; }
  }
  return pending;
}
export async function saveCoverage(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, form: CoverageForm,
  photos: SelectedVehiclePhoto[], edit?: { id: string; revision: number; removedDocumentIds: string[] }) {
  const draft = coverageFormToDraft(kind, form);
  const id = edit?.id ?? randomUUID();
  validateCoverageOwner(vehicleId, id, ...(edit?.removedDocumentIds ?? []));
  return withVehicleOperation(vehicleId, async () => {
    if (!await db.getFirstAsync('SELECT id FROM vehicles WHERE id = ?', [vehicleId])) throw new Error('This vehicle no longer exists.');
    if (edit) {
      const current = await getCoverageRecord(db, kind, vehicleId, id);
      if (!current || current.revision !== edit.revision) throw new Error('This record changed or was deleted. Reopen it before editing.');
    }
    const staged: CoverageCleanup[] = [];
    let committed = false;
    try {
      const added: CoverageDocument[] = [];
      for (const photo of photos) {
        const job = { kind, vehicleId, recordId: id, documentId: randomUUID() };
        await queueCoverageCleanup(db, job); staged.push(job);
        const localUri = await copyCoverageDocument(job, photo.uri);
        added.push({ id: job.documentId, vehicleId, recordId: id, localUri, createdAt: new Date().toISOString() });
      }
      await writeCoverage(db, kind, vehicleId, id, draft, edit?.revision ?? null, added, edit?.removedDocumentIds ?? []);
      committed = true;
    } catch (cause) {
      // A connection-close failure can occur AFTER commit. Don't duplicate records or remove committed files.
      const saved = await getCoverageRecord(db, kind, vehicleId, id);
      committed = saved?.revision === (edit ? edit.revision + 1 : 1);
      if (!committed) {
        let pending = false;
        for (const job of staged) { try { await finishCleanup(db, job); } catch { pending = true; } }
        if (pending) throw new Error('Changes were not saved. Temporary document cleanup is pending; retry from Insurance & PUC or My Garage.');
        throw cause;
      }
    }
    // Metadata is already committed. Cleanup failure must never encourage saving a duplicate.
    let cleanupPending = false;
    try { cleanupPending = await cleanJobs(db, vehicleId, kind, id); } catch { cleanupPending = true; }
    return { id, cleanupPending };
  });
}
export async function deleteCoverage(db: SQLiteDatabase, kind: CoverageKind, vehicleId: number, recordId: string) {
  parseCoverageKind(kind); validateCoverageOwner(vehicleId, recordId);
  return withVehicleOperation(vehicleId, async () => {
    try { await deleteCoverageRecord(db, kind, vehicleId, recordId); }
    catch (cause) {
      // A failed connection close does not undo a committed deletion.
      if (await getCoverageRecord(db, kind, vehicleId, recordId)) throw cause;
    }
    try { return { cleanupPending: await cleanJobs(db, vehicleId, kind, recordId) }; }
    catch { return { cleanupPending: true }; }
  });
}
export async function retryCoverageCleanup(db: SQLiteDatabase, vehicleId?: number) {
  let failed = false;
  for (const job of await getCoverageCleanup(db, vehicleId)) {
    try { await withVehicleOperation(job.vehicleId, () => finishCleanup(db, job)); }
    catch { failed = true; }
  }
  if (failed) throw new Error('Some Insurance / PUC document files need cleanup. Retry when storage is available.');
}
