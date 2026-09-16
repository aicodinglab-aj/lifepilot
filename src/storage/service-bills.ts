import { Directory, File, Paths } from 'expo-file-system';

export function validateServiceOwner(vehicleId: number, serviceId: string) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Invalid vehicle.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(serviceId)) throw new Error('Invalid service ID.');
}
function billDirectory(vehicleId: number, serviceId: string) {
  validateServiceOwner(vehicleId, serviceId);
  return new Directory(Paths.document, 'vehicle-photos', String(vehicleId), 'service-bills', serviceId);
}
export function ownedServiceBillFile(vehicleId: number, serviceId: string, photoId: string, uri: string) {
  validateServiceOwner(vehicleId, photoId);
  const directory = billDirectory(vehicleId, serviceId);
  if (!uri.startsWith('file:///') || /[?#\\\u0000-\u001f]/.test(uri)) throw new Error('Invalid bill URI.');
  const segments = uri.slice(8).split('/').map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (!decoded || decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f]/.test(decoded)) throw new Error('Invalid bill path segment.');
    return decoded;
  });
  const name = segments[segments.length - 1];
  if (!new RegExp(`^${photoId}\\.(jpg|jpeg|png|webp|heic|heif|gif|avif)$`).test(name) ||
      segments.slice(-5, -1).join('/') !== `vehicle-photos/${vehicleId}/service-bills/${serviceId}`) {
    throw new Error('Bill path is outside this service storage.');
  }
  // Only the validated suffix is retained when rebasing an old iOS sandbox URI.
  return new File(directory, name);
}
export async function copyServiceBill(vehicleId: number, serviceId: string, photoId: string, sourceUri: string) {
  validateServiceOwner(vehicleId, photoId);
  const directory = billDirectory(vehicleId, serviceId);
  directory.create({ intermediates: true, idempotent: true });
  const extension = sourceUri.split('?')[0].split('.').pop()?.toLowerCase();
  const suffix = extension && /^(jpg|jpeg|png|webp|heic|heif|gif|avif)$/.test(extension) ? extension : 'jpg';
  const destination = new File(directory, `${photoId}.${suffix}`);
  await new File(sourceUri).copy(destination);
  if (!destination.exists || destination.size === 0) throw new Error('The bill image could not be copied.');
  return destination.uri;
}
export async function deleteServiceBillDirectory(vehicleId: number, serviceId: string) {
  const target = billDirectory(vehicleId, serviceId);
  let parent = new Directory(Paths.document);
  // Enumerate each parent so permission errors retain the durable cleanup job.
  for (const name of ['vehicle-photos', String(vehicleId), 'service-bills', serviceId]) {
    if (!parent.list().some((entry) => entry.name === name)) return;
    parent = new Directory(parent, name);
  }
  await target.delete();
  if (target.exists) throw new Error('Could not remove service bill files.');
}
export function availableServiceBillUri(vehicleId: number, serviceId: string, photoId: string, uri: string) {
  try {
    const file = ownedServiceBillFile(vehicleId, serviceId, photoId, uri);
    return file.exists ? file.uri : null;
  } catch { return null; }
}
