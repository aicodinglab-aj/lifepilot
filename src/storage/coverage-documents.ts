import { Directory, File, Paths } from 'expo-file-system';
import { parseCoverageKind, validateCoverageOwner, type CoverageCleanup, type CoverageDocument, type CoverageKind } from '@/features/vehicles/coverage-record';

function segments(job: CoverageCleanup) {
  parseCoverageKind(job.kind); validateCoverageOwner(job.vehicleId, job.recordId, job.documentId);
  return ['vehicle-photos', String(job.vehicleId), job.kind, job.recordId, job.documentId];
}
function documentDirectory(job: CoverageCleanup) { return new Directory(Paths.document, ...segments(job)); }
export function ownedCoverageDocumentFile(job: CoverageCleanup, uri: string) {
  const suffix = segments(job);
  if (!uri.startsWith('file:///') || /[?#\\\u0000-\u001f]/.test(uri)) throw new Error('Invalid document URI.');
  // Match the existing photo safety rules: decode segments, not whole paths.
  const decoded = uri.slice(8).split('/').map((segment) => {
    const value = decodeURIComponent(segment);
    if (!value || value === '.' || value === '..' || /[/\\\u0000-\u001f]/.test(value)) throw new Error('Invalid document path segment.');
    return value;
  });
  const name = decoded[decoded.length - 1];
  if (!/^image\.(jpg|jpeg|png|webp|heic|heif|gif|avif)$/.test(name) || decoded.slice(-6, -1).join('/') !== suffix.join('/')) {
    throw new Error('Document path is outside its owned storage.');
  }
  return new File(documentDirectory(job), name);
}
export async function copyCoverageDocument(job: CoverageCleanup, sourceUri: string) {
  const directory = documentDirectory(job);
  directory.create({ intermediates: true, idempotent: true });
  const extension = sourceUri.split('?')[0].split('.').pop()?.toLowerCase();
  const suffix = extension && /^(jpg|jpeg|png|webp|heic|heif|gif|avif)$/.test(extension) ? extension : 'jpg';
  const destination = new File(directory, `image.${suffix}`);
  await new File(sourceUri).copy(destination);
  if (!destination.exists || destination.size === 0) throw new Error('Could not copy the document image.');
  return destination.uri;
}
export async function deleteCoverageDocumentFiles(job: CoverageCleanup) {
  const ownedSegments = segments(job);
  const target = documentDirectory(job);
  let parent = new Directory(Paths.document);
  // An unreadable parent is an error, not evidence that cleanup succeeded.
  for (const name of ownedSegments) {
    if (!parent.list().some((entry) => entry.name === name)) return;
    parent = new Directory(parent, name);
  }
  target.delete();
  if (target.exists) throw new Error('Document cleanup is incomplete.');
}
export function availableCoverageDocumentUri(kind: CoverageKind, document: CoverageDocument) {
  try {
    const file = ownedCoverageDocumentFile({ kind, vehicleId: document.vehicleId, recordId: document.recordId, documentId: document.id }, document.localUri);
    return file.exists ? file.uri : null;
  } catch { return null; }
}
