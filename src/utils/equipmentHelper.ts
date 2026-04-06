/**
 * EQUIPMENT MANAGEMENT SYSTEM
 * ==============================
 * 
 * TWO-COLLECTION ARCHITECTURE:
 * 
 * 1. CONSUMABLES & MAIN ITEMS (equipment collection)
 *    - Documents: { id, name, category: 'consumable'|'main', quantity, unit, ... }
 *    - Simple quantity tracking: total stock count
 *    - No serial codes or condition tracking
 *    - Examples: electrodes (rolls), oil (liters), wood (sheets)
 * 
 * 2. ASSETS (two related collections)
 *    a) equipmentMaster: Master record for each asset type
 *       - { id, name, category: 'asset', quantity, equipmentTypes, ... }
 *       - quantity = total instances of this asset
 *       - syncedQuantity/syncedAvailable = synced borrow counts
 *    
 *    b) assetInstances: Individual physical units
 *       - { id, equipmentId, serialCode, available, condition, ... }
 *       - serialCode = unique identifier (e.g., 'WM-001', 'LM-002')
 *       - available = boolean (true if not borrowed)
 *       - condition = optional condition report (good/damage/etc)
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Parallel collection queries (Promise.all for 3 collections)
 * - Client-side caching with 5-minute TTL
 * - Optional pagination support (slice-based, 30 items/page)
 * - Only loads data when necessary (cache check first)
 * 
 * PAGINATION STRATEGY:
 * - Loads all documents from Firestore (no limit() in queries)
 * - Slices results in memory (pageLimit & pageIndex parameters)
 * - Future: Can add limit() in queries for true server-side pagination
 * - Returns: { items: [...], hasMore: boolean, total: number }
 */

import { collection, getDocs, getDoc, addDoc, query, where, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase/firebase'

// Client-side cache for equipment data with TTL (5 minutes)
interface CacheEntry {
  data: EquipmentDisplay[]
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds
let equipmentCache: CacheEntry | null = null

// Cache for equipment types
let equipmentTypesCache: { [key: string]: string[] } | null = null
let equipmentTypesCacheTime = 0

export interface EquipmentMaster {
  id: string
  name: string
  category: 'asset' | 'consumable' | 'main'
  unit: string
  equipmentTypes: string[]
  equipmentSubTypes: string[]
  picture?: string
  // Synced fields written by syncMasterAvailableCount — authoritative
  syncedQuantity?: number
  syncedAvailable?: number
}

export interface AssetInstance {
  id: string
  equipmentId: string // Reference to equipmentMaster
  serialCode: string
  available: boolean
  condition?: string
  location?: string
}

export interface EquipmentDisplay {
  id: string
  name: string
  category: 'asset' | 'consumable' | 'main'
  quantity: number
  unit: string
  equipmentTypes: string[]
  equipmentSubTypes: string[]
  picture?: string
  // For assets: list of serial codes
  serialCodes?: { id: string; code: string }[]
  allIds?: string[] // For compatibility with existing code
  // Track available count for assets (instances with available: true)
  availableCount?: number
  // Track collection origin for proper deletion/updates
  sourceCollection?: 'equipmentMaster' | 'equipment' // 'equipmentMaster' = new two-collection, 'equipment' = consumables/old assets
  masterInstancePair?: {
    masterId: string
    instanceIds: string[]
  }
}

/**
 * Load all equipment including consumables, assets, and their instances
 * WITH CACHING: Returns cached data if available (TTL: 5 minutes)
 * BATCHED: All three collections read together to minimize round trips
 * WITH PAGINATION: Optional limit parameter for paginated loading
 */
export async function loadAllEquipment(useCache = true, pageLimit?: number, pageIndex = 0): Promise<{ items: EquipmentDisplay[]; hasMore: boolean; total: number }> {
  try {
    // Check cache first (only if no pagination)
    if (useCache && !pageLimit && equipmentCache && Date.now() - equipmentCache.timestamp < CACHE_TTL) {
      return {
        items: equipmentCache.data,
        hasMore: false,
        total: equipmentCache.data.length
      }
    }

    const results: EquipmentDisplay[] = []

    // OPTIMIZATION: Parallel reads instead of sequential
    // Fire all three queries simultaneously
    const [equipmentSnapshot, masterSnapshot, instancesSnapshot] = await Promise.all([
      getDocs(collection(db, 'equipment')),
      getDocs(collection(db, 'equipmentMaster')),
      getDocs(collection(db, 'assetInstances'))
    ])

    // 1. Load consumables and main items from equipment collection
    equipmentSnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      if (data.category === 'consumable' || data.category === 'main') {
        results.push({
          id: docSnap.id,
          name: data.name,
          category: data.category,
          quantity: data.quantity || 0,
          unit: data.unit || 'ชิ้น',
          equipmentTypes: data.equipmentTypes || [],
          equipmentSubTypes: data.equipmentSubTypes || [],
          picture: data.picture,
          allIds: [docSnap.id],
          sourceCollection: 'equipment'
        })
      }
    })

    // 2. Build master map from equipment masters
    const masterMap = new Map<string, EquipmentMaster>()
    masterSnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      masterMap.set(docSnap.id, {
        id: docSnap.id,
        name: data.name,
        category: data.category,
        unit: data.unit,
        equipmentTypes: data.equipmentTypes || [],
        equipmentSubTypes: data.equipmentSubTypes || [],
        picture: data.picture,
        // Preserve synced counts if present (written by syncMasterAvailableCount)
        syncedQuantity: typeof data.quantity === 'number' ? data.quantity : undefined,
        syncedAvailable: typeof data.available === 'number' ? data.available : undefined,
      })
    })

    // 3. Build instances map grouped by master
    const masterInstancesMap = new Map<string, AssetInstance[]>()
    instancesSnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      const equipmentId = data.equipmentId
      if (!masterInstancesMap.has(equipmentId)) {
        masterInstancesMap.set(equipmentId, [])
      }
      masterInstancesMap.get(equipmentId)!.push({
        id: docSnap.id,
        equipmentId: equipmentId,
        serialCode: data.serialCode,
        available: data.available !== false, // Only default to true if field is undefined/null
        condition: data.condition,
        location: data.location
      })
    })

    // 4. Combine masters with their instances
    masterMap.forEach((master, masterId) => {
      const instances = masterInstancesMap.get(masterId) || []
      const instanceIds = instances.map((inst) => inst.id)
      const instanceAvailableCount = instances.filter(inst => inst.available).length

      // If syncMasterAvailableCount has run, its values are authoritative.
      // This catches orphaned instances where master says 0 but instances still exist.
      const quantity = master.syncedQuantity !== undefined ? master.syncedQuantity : instances.length
      const availableCount = master.syncedAvailable !== undefined ? master.syncedAvailable : instanceAvailableCount
      results.push({
        id: masterId,
        name: master.name,
        category: master.category,
        quantity: quantity,
        availableCount: availableCount,
        unit: master.unit,
        equipmentTypes: master.equipmentTypes,
        equipmentSubTypes: master.equipmentSubTypes,
        picture: master.picture,
        serialCodes: instances.map((inst) => ({
          id: inst.id,
          code: inst.serialCode
        })),
        allIds: instanceIds,
        sourceCollection: 'equipmentMaster',
        masterInstancePair: {
          masterId: masterId,
          instanceIds: instanceIds
        }
      })
    })

    // Apply pagination if limit is specified
    const startIndex = pageLimit ? pageIndex * pageLimit : 0
    const endIndex = pageLimit ? startIndex + pageLimit : results.length
    const paginatedResults = results.slice(startIndex, endIndex)
    const hasMore = pageLimit ? endIndex < results.length : false

    // Cache the full results only if not paginating
    if (!pageLimit) {
      equipmentCache = {
        data: results,
        timestamp: Date.now()
      }
    }

    return {
      items: paginatedResults,
      hasMore: hasMore,
      total: results.length
    }
  } catch (error) {
    console.error('Error loading equipment:', error)
    return { items: [], hasMore: false, total: 0 }
  }
}

/**
 * Load equipment types with caching
 * Reduces reads by caching types locally (TTL: 10 minutes)
 */
export async function loadEquipmentTypes(): Promise<{ [key: string]: string[] }> {
  try {
    // Check cache first
    if (equipmentTypesCache && Date.now() - equipmentTypesCacheTime < 10 * 60 * 1000) {
      return equipmentTypesCache
    }

    const types: { [key: string]: string[] } = {}
    const snapshot = await getDocs(collection(db, 'equipmentTypes'))

    snapshot.forEach((doc) => {
      const data = doc.data()
      types[data.name] = data.subtypes || []
    })

    // Cache the results
    equipmentTypesCache = types
    equipmentTypesCacheTime = Date.now()

    return types
  } catch (error) {
    console.error('Error loading equipment types:', error)
    return {}
  }
}

/**
 * Invalidate equipment cache (call after add/edit/delete operations)
 */
export function invalidateEquipmentCache() {
  equipmentCache = null
}

/**
 * Invalidate equipment types cache
 */
export function invalidateEquipmentTypesCache() {
  equipmentTypesCache = null
}

/**
 * Sync available count in master to match actual available instances
 * Call this after changing instance availability status
 */
export async function syncMasterAvailableCount(masterId: string): Promise<boolean> {
  try {
    // Get all instances for this master
    const instancesSnap = await getDocs(query(
      collection(db, 'assetInstances'),
      where('equipmentId', '==', masterId)
    ))
    
    const instances = instancesSnap.docs.map(doc => doc.data())
    const availableCount = instances.filter(inst => inst.available).length
    const totalCount = instances.length
    
    // Update master with correct available count
    await updateDoc(doc(db, 'equipmentMaster', masterId), {
      available: availableCount,
      quantity: totalCount
    })
    
    // Invalidate cache so next load gets fresh data
    invalidateEquipmentCache()
    return true
  } catch (error) {
    console.error('Error syncing available count:', error)
    return false
  }
}

/**
 * Add new asset equipment (creates master + instances)
 */
export async function addNewAsset(
  nameThai: string,
  nameEnglish: string,
  serialCodes: string[],
  unit: string,
  equipmentTypes: string[],
  equipmentSubTypes: string[],
  picture?: string
): Promise<string | null> {
  try {
    const name = `${nameThai}${nameEnglish ? ` (${nameEnglish})` : ''}`

    // 1. Create master record with initial quantity and available count
    const masterRef = await addDoc(collection(db, 'equipmentMaster'), {
      name,
      category: 'asset',
      unit,
      equipmentTypes,
      equipmentSubTypes,
      picture: picture || null,
      quantity: serialCodes.length,
      available: serialCodes.length,
      createdAt: new Date().toISOString()
    })

    const masterId = masterRef.id

    // 2. Create instance records using batch write (more efficient)
    const batch = writeBatch(db)
    for (const serialCode of serialCodes) {
      const instanceRef = doc(collection(db, 'assetInstances'))
      batch.set(instanceRef, {
        equipmentId: masterId,
        serialCode,
        available: true,
        condition: 'ปกติ',
        createdAt: new Date().toISOString()
      })
    }
    await batch.commit()

    // Invalidate cache after adding new equipment
    invalidateEquipmentCache()

    return masterId
  } catch (error) {
    console.error('Error adding asset:', error)
    return null
  }
}

/**
 * Add stock to existing asset (adds new instance)
 */
export async function addAssetStock(
  equipmentName: string,
  serialCodes: string[]
): Promise<boolean> {
  try {
    // 1. Find the master by name
    const masterQuery = query(collection(db, 'equipmentMaster'), where('name', '==', equipmentName))
    const masterSnapshot = await getDocs(masterQuery)

    if (masterSnapshot.empty) {
      console.error('Equipment master not found:', equipmentName)
      return false
    }

    const masterId = masterSnapshot.docs[0].id
    const masterData = masterSnapshot.docs[0].data()

    // 2. Add instance records for each new serial code using batch write
    const batch = writeBatch(db)
    for (const serialCode of serialCodes) {
      const instanceRef = doc(collection(db, 'assetInstances'))
      batch.set(instanceRef, {
        equipmentId: masterId,
        serialCode,
        available: true,
        condition: 'ปกติ',
        createdAt: new Date().toISOString()
      })
    }

    // 3. Update master's quantity and available to reflect new instances
    const currentQuantity = masterData.quantity || 0
    const currentAvailable = masterData.available || 0
    batch.update(doc(db, 'equipmentMaster', masterId), {
      quantity: currentQuantity + serialCodes.length,
      available: currentAvailable + serialCodes.length
    })

    await batch.commit()

    // Invalidate cache after adding stock
    invalidateEquipmentCache()

    return true
  } catch (error) {
    console.error('Error adding asset stock:', error)
    return false
  }
}

/**
 * Add new consumable (original behavior)
 */
export async function addNewConsumable(
  nameThai: string,
  nameEnglish: string,
  quantity: number,
  unit: string,
  equipmentTypes: string[],
  equipmentSubTypes: string[],
  picture?: string
): Promise<string | null> {
  try {
    const name = `${nameThai}${nameEnglish ? ` (${nameEnglish})` : ''}`

    const docRef = await addDoc(collection(db, 'equipment'), {
      name,
      category: 'consumable',
      quantity,
      unit,
      equipmentTypes,
      equipmentSubTypes,
      picture: picture || null,
      available: true,
      createdAt: new Date().toISOString()
    })

    // Invalidate cache after adding consumable
    invalidateEquipmentCache()

    return docRef.id
  } catch (error) {
    console.error('Error adding consumable:', error)
    return null
  }
}

/**
 * Add stock to consumable
 */
export async function addConsumableStock(
  equipmentId: string,
  quantity: number
): Promise<boolean> {
  try {
    const docRef = doc(db, 'equipment', equipmentId)
    const docSnap = await getDoc(docRef)

    let found = false
    if (docSnap.exists()) {
      const currentQuantity = docSnap.data().quantity || 0
      await updateDoc(docRef, {
        quantity: currentQuantity + quantity,
        available: true
      })
      found = true
    }

    // Invalidate cache after updating
    if (found) {
      invalidateEquipmentCache()
    }

    return found
  } catch (error) {
    console.error('Error adding consumable stock:', error)
    return false
  }
}

/**
 * Delete equipment based on its source collection.
 * For new assets (equipmentMaster): deletes both master and all instances
 * For consumables/old assets (equipment): deletes single document
 */
export async function deleteEquipment(equipmentDisplay: EquipmentDisplay): Promise<boolean> {
  try {
    if (equipmentDisplay.sourceCollection === 'equipmentMaster' && equipmentDisplay.masterInstancePair) {
      // Delete all instances + master using batch for efficiency
      const { masterId, instanceIds } = equipmentDisplay.masterInstancePair
      const batch = writeBatch(db)
      
      for (const instanceId of instanceIds) {
        batch.delete(doc(db, 'assetInstances', instanceId))
      }
      
      // Add master delete to batch
      batch.delete(doc(db, 'equipmentMaster', masterId))
      await batch.commit()
      
      // Invalidate cache
      invalidateEquipmentCache()
      return true
    } else {
      // Delete from equipment collection (consumables/old assets)
      await deleteDoc(doc(db, 'equipment', equipmentDisplay.id))
      
      // Invalidate cache
      invalidateEquipmentCache()
      return true
    }
  } catch (error) {
    console.error('Error deleting equipment:', error)
    return false
  }
}

/**
 * Update equipment metadata (name, types, picture, etc.)
 * Automatically handles both equipmentMaster and equipment collections
 */
export async function updateEquipmentMetadata(
  equipmentDisplay: EquipmentDisplay,
  updates: {
    name?: string
    equipmentTypes?: string[]
    equipmentSubTypes?: string[]
    picture?: string
    quantity?: number
    unit?: string
  }
): Promise<boolean> {
  try {
    const collectionName = equipmentDisplay.sourceCollection === 'equipmentMaster' ? 'equipmentMaster' : 'equipment'
    await updateDoc(doc(db, collectionName, equipmentDisplay.id), updates)
    
    // Invalidate cache after update
    invalidateEquipmentCache()
    return true
  } catch (error) {
    console.error('Error updating equipment metadata:', error)
    return false
  }
}

/**
 * Get available asset instances for an equipment master
 * Returns array of instances with id, serialCode, and other metadata
 */
export async function getAvailableAssetInstances(equipmentName: string): Promise<Array<{
  id: string
  serialCode: string
  condition?: string
  available: boolean
}>> {
  try {
    // First find the equipment master by name
    const masterSnapshot = await getDocs(query(
      collection(db, 'equipmentMaster'),
      where('name', '==', equipmentName)
    ))

    if (masterSnapshot.empty) {
      return []
    }

    const masterId = masterSnapshot.docs[0].id

    // Now get all available instances for this master
    const instancesSnapshot = await getDocs(query(
      collection(db, 'assetInstances'),
      where('equipmentId', '==', masterId),
      where('available', '==', true)
    ))

    return instancesSnapshot.docs.map(doc => ({
      id: doc.id,
      serialCode: doc.data().serialCode,
      condition: doc.data().condition,
      available: doc.data().available
    }))
  } catch (error) {
    console.error('Error getting available asset instances:', error)
    return []
  }
}

/**
 * Mark asset instances as borrowed (set available: false)
 */
export async function markAssetInstancesAsBorrowed(instanceIds: string[]): Promise<boolean> {
  try {
    const batch = writeBatch(db)

    for (const instanceId of instanceIds) {
      batch.update(doc(db, 'assetInstances', instanceId), {
        available: false
      })
    }

    await batch.commit()
    return true
  } catch (error) {
    console.error('Error marking assets as borrowed:', error)
    return false
  }
}

/**
 * Update asset instance condition and availability
 * Used when equipment is returned with damage or loss
 */
export async function updateAssetInstanceCondition(
  instanceId: string,
  condition: string,
  available: boolean = true
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'assetInstances', instanceId), {
      condition: condition,
      available: available
    })
    return true
  } catch (error) {
    console.error('Error updating asset instance condition:', error)
    return false
  }
}

/**
 * Find asset instance by serial code
 * Used to locate specific equipment for condition updates
 */
export async function findAssetInstanceBySerialCode(serialCode: string): Promise<{
  id: string
  equipmentId: string
  serialCode: string
  available: boolean
  condition?: string
} | null> {
  try {
    const snapshot = await getDocs(query(
      collection(db, 'assetInstances'),
      where('serialCode', '==', serialCode)
    ))

    if (snapshot.empty) {
      return null
    }

    const doc = snapshot.docs[0]
    return {
      id: doc.id,
      equipmentId: doc.data().equipmentId,
      serialCode: doc.data().serialCode,
      available: doc.data().available,
      condition: doc.data().condition
    }
  } catch (error) {
    console.error('Error finding asset instance:', error)
    return null
  }
}
