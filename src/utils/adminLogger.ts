import { collection, addDoc, doc, getDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '../firebase/firebase'

interface LogAdminActionParams {
  user: User
  action: 'add' | 'edit' | 'delete' | 'update' | 'confirm' | 'cancel' | 'acknowledge'
  type: 'equipment' | 'room' | 'borrow' | 'equipmentType'
  itemName: string
  details: string
  adminName?: string // Optional: pass if already available to avoid read
}

// Cache user info locally to avoid repeated reads
let userCache: { [uid: string]: { name: string; timestamp: number } } = {}
const USER_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export async function logAdminAction({
  user,
  action,
  type,
  itemName,
  details,
  adminName: passedAdminName
}: LogAdminActionParams) {
  try {
    let adminName = passedAdminName || 'Unknown'
    
    // If adminName not provided, try to get from cache or Firestore
    if (!passedAdminName) {
      const now = Date.now()
      
      // Check cache first
      if (userCache[user.uid] && now - userCache[user.uid].timestamp < USER_CACHE_TTL) {
        adminName = userCache[user.uid].name
      } else {
        // Fetch from Firestore only if not cached
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        const fetchedName = userDoc.data()?.fullName || user.displayName || 'Unknown'
        adminName = fetchedName
        
        // Cache the result
        userCache[user.uid] = {
          name: fetchedName,
          timestamp: now
        }
      }
    }

    // Add action to adminLogs collection
    await addDoc(collection(db, 'adminLogs'), {
      adminEmail: user.email,
      adminName: adminName,
      action: action,
      type: type,
      itemName: itemName,
      timestamp: new Date().toISOString(),
      details: details
    })

    console.log(`Admin action logged: ${action} ${type}`)
  } catch (error) {
    console.error('Error logging admin action:', error)
  }
}

/**
 * Clear user cache (optional - call on logout)
 */
export function clearUserCache() {
  userCache = {}
}
