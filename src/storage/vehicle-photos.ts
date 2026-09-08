import { Directory, File, Paths } from 'expo-file-system';

function vehicleDirectory(vehicleId: number) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Invalid vehicle.');
  return new Directory(Paths.document, 'vehicle-photos', String(vehicleId));
}

export function deleteVehiclePhotoDirectory(vehicleId: number) {
  // Only this constructor determines the recursive deletion target. No DB URI.
  const directory = vehicleDirectory(vehicleId);
  // exists can also be false when access is denied. Enumerate the owned parents
  // so an unreadable directory throws rather than being treated as cleaned up.
  if (!new Directory(Paths.document).list().some((entry) => entry.name === 'vehicle-photos')) return;
  const root = new Directory(Paths.document, 'vehicle-photos');
  if (!root.list().some((entry) => entry.name === String(vehicleId))) return;
  directory.delete();
  if (directory.exists) throw new Error('The vehicle photo directory could not be removed.');
}

export function ownedPhotoFile(vehicleId: number, photoId: string, uri: string) {
  if (!/^[a-f0-9-]{36}$/.test(photoId)) throw new Error('Invalid photo ID.');
  // Decode individual segments, never the whole path: encoded separators and
  // traversal must not acquire path semantics. Expo Go encodes its scope prefix.
  if (!uri.startsWith('file:///') || /[?#\\\u0000-\u001f]/.test(uri)) {
    throw new Error('Invalid photo URI.');
  }
  const segments = uri.slice('file:///'.length).split('/').map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (!decoded || decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f]/.test(decoded)) {
      throw new Error('Invalid photo path segment.');
    }
    return decoded;
  });
  const name = segments[segments.length - 1];
  if (!new RegExp(`^${photoId}\\.(jpg|jpeg|png|webp|heic|heif|gif|avif)$`).test(name)) {
    throw new Error('Photo path is outside this vehicle’s storage.');
  }
  // Rebase an old iOS sandbox prefix, but only for an exact owned directory suffix.
  if (segments[segments.length - 3] !== 'vehicle-photos' || segments[segments.length - 2] !== String(vehicleId)) {
    throw new Error('Photo path is outside this vehicle’s storage.');
  }
  // Never construct a file from the supplied prefix, including for deletion.
  return new File(vehicleDirectory(vehicleId), name);
}

export async function copyPhoto(
  vehicleId: number,
  photoId: string,
  sourceUri: string
) {
  const directory = vehicleDirectory(vehicleId);

  directory.create({
    intermediates: true,
    idempotent: true,
  });

  const extension = sourceUri
    .split('?')[0]
    .split('.')
    .pop()
    ?.toLowerCase();

  const suffix =
    extension &&
      /^(jpg|jpeg|png|webp|heic|heif|gif|avif)$/.test(extension)
      ? extension
      : 'jpg';

  const destination = new File(
    directory,
    `${photoId}.${suffix}`
  );

  try {
    const source = new File(sourceUri);

    await source.copy(destination);

    // Temporary metadata-only diagnostics for native verification; remove once verified.
    if (__DEV__) console.debug('[vehicle-photo] copied', {
      vehicleId, photoId, sourceUri, savedUri: destination.uri,
      resolvedUri: destination.uri, exists: destination.exists, size: destination.size,
    });

    if (!destination.exists || destination.size === 0) {
      throw new Error('The image could not be copied.');
    }

    return destination.uri;
  } catch (error) {
    if (destination.exists) {
      destination.delete();
    }

    throw error;
  }
}

export function availablePhotoUri(vehicleId: number, photoId: string, uri: string): string | null {
  try {
    const file = ownedPhotoFile(vehicleId, photoId, uri);
    if (__DEV__) console.debug('[vehicle-photo] resolve', {
      vehicleId, photoId, savedUri: uri, resolvedUri: file.uri, exists: file.exists, size: file.size,
    });
    return file.exists ? file.uri : null;
  } catch (error) {
    if (__DEV__) console.debug('[vehicle-photo] rejected', { vehicleId, photoId, savedUri: uri, error });
    return null;
  }
}
