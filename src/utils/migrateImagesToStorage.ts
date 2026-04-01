/**
 * ONE-TIME MIGRATION SCRIPT: base64 images → Firebase Storage
 *
 * Run this ONCE from Admin Dashboard or a temporary admin route.
 * After it completes, all `picture` fields in Firestore will be Storage download URLs.
 *
 * Collections migrated:
 *   - equipment        (consumables / legacy assets)
 *   - equipmentMaster  (new asset masters)
 *   - rooms
 */

import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage'
import { db } from '../firebase/firebase'

export interface MigrationResult {
  total: number
  migrated: number
  skipped: number   // already a URL (already migrated or no picture)
  failed: number
  errors: string[]
}

/**
 * Upload one base64 string to Firebase Storage and return the download URL.
 * storageKey example: "equipment/abc123/picture"
 */
async function uploadBase64(base64: string, storageKey: string): Promise<string> {
  const storage = getStorage()
  const fileRef = ref(storage, storageKey)

  // base64 string starts with "data:image/jpeg;base64,..." or similar
  await uploadString(fileRef, base64, 'data_url')
  return await getDownloadURL(fileRef)
}

/**
 * Migrate a single collection's `picture` field.
 * collectionName: 'equipment' | 'equipmentMaster' | 'rooms'
 * fieldName: 'picture' or 'image'
 */
async function migrateCollection(
  collectionName: string,
  fieldName: string,
  onProgress?: (current: number, total: number, docId: string) => void
): Promise<MigrationResult> {
  const result: MigrationResult = { total: 0, migrated: 0, skipped: 0, failed: 0, errors: [] }

  const snapshot = await getDocs(collection(db, collectionName))
  result.total = snapshot.size

  let current = 0
  for (const docSnap of snapshot.docs) {
    current++
    const data = docSnap.data()
    const value: string | undefined = data[fieldName]

    onProgress?.(current, result.total, docSnap.id)

    if (!value) {
      result.skipped++
      continue
    }

    // Already a URL (previously migrated) — skip
    if (!value.startsWith('data:')) {
      result.skipped++
      continue
    }

    try {
      const storageKey = `${collectionName}/${docSnap.id}/${fieldName}`
      const downloadUrl = await uploadBase64(value, storageKey)
      await updateDoc(doc(db, collectionName, docSnap.id), { [fieldName]: downloadUrl })
      result.migrated++
    } catch (err: any) {
      result.failed++
      result.errors.push(`${collectionName}/${docSnap.id}: ${err?.message ?? err}`)
      console.error(`Migration failed for ${collectionName}/${docSnap.id}:`, err)
    }
  }

  return result
}

/**
 * Main migration entry point.
 * Call this from a one-time admin UI button.
 *
 * @param onProgress  optional callback for live progress updates
 * @returns combined results per collection
 */
export async function migrateAllImagesToStorage(
  onProgress?: (collection: string, current: number, total: number, docId: string) => void
): Promise<{ equipment: MigrationResult; equipmentMaster: MigrationResult; rooms: MigrationResult }> {
  console.log('[Migration] Starting image migration to Firebase Storage...')

  const equipmentResult = await migrateCollection(
    'equipment', 'picture',
    (c, t, id) => onProgress?.('equipment', c, t, id)
  )
  console.log('[Migration] equipment done:', equipmentResult)

  const masterResult = await migrateCollection(
    'equipmentMaster', 'picture',
    (c, t, id) => onProgress?.('equipmentMaster', c, t, id)
  )
  console.log('[Migration] equipmentMaster done:', masterResult)

  const roomsResult = await migrateCollection(
    'rooms', 'image',
    (c, t, id) => onProgress?.('rooms', c, t, id)
  )
  console.log('[Migration] rooms done:', roomsResult)

  console.log('[Migration] Complete.')
  return { equipment: equipmentResult, equipmentMaster: masterResult, rooms: roomsResult }
}
