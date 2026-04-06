import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { signOut } from "firebase/auth"
import { collection, getDocs, query, where } from "firebase/firestore"
import { auth, db } from "../../firebase/firebase"
import Header from "../../components/Header"
import { loadAllEquipment } from "../../utils/equipmentHelper"
// import { migrateAllImagesToStorage } from "../../utils/migrateImagesToStorage"
// import type { MigrationResult } from "../../utils/migrateImagesToStorage"

// Cache configuration
interface CacheData {
  data: any
  timestamp: number
}

const dashboardCache: { lowStock?: CacheData; pendingBookings?: CacheData; outOfStockAssets?: CacheData } = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const getCachedData = (key: 'lowStock' | 'pendingBookings' | 'outOfStockAssets'): any => {
  const cached = dashboardCache[key]
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Using cached ${key}`)
    return cached.data
  }
  return null
}

const setCachedData = (key: 'lowStock' | 'pendingBookings' | 'outOfStockAssets', data: any) => {
  dashboardCache[key] = { data, timestamp: Date.now() }
}

interface Equipment {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
}

interface RoomBooking {
  id: string
  roomCode: string
  roomType: string
  userName: string
  date: string
  startTime: string
  endTime: string
  status: "pending" | "approved" | "completed" | "cancelled" | "returned"
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [lowStockItems, setLowStockItems] = useState<Equipment[]>([])
  const [outOfStockAssets, setOutOfStockAssets] = useState<{ id: string; name: string }[]>([])
  const [pendingBookings, setPendingBookings] = useState<RoomBooking[]>([])
  // const [migrating, setMigrating] = useState(false)
  // const [migrationProgress, setMigrationProgress] = useState("")
  // const [migrationDone, setMigrationDone] = useState<null | { equipment: MigrationResult; equipmentMaster: MigrationResult; rooms: MigrationResult }>(null)

  // Load low stock items and out of stock assets using unified equipmentHelper
  useEffect(() => {
    const loadEquipmentStatus = async () => {
      try {
        // Load all equipment with proper caching and synced counts
        const result = await loadAllEquipment()
        const allEquipment = result.items

        // Filter low stock items (consumables with quantity < threshold)
        const LOW_STOCK_THRESHOLD = 10
        const lowStockItems = allEquipment.filter(
          item => item.category === 'consumable' && (item.quantity ?? 0) < LOW_STOCK_THRESHOLD
        ).map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity ?? 0,
          unit: item.unit || 'ชิ้น'
        }))

        // Filter out of stock assets (assets with availableCount === 0 and quantity > 0 means all units borrowed)
        const outOfStockAssets = allEquipment.filter(
          item => item.category === 'asset' && (item.availableCount ?? 0) === 0 && (item.quantity ?? 0) > 0
        ).map(item => ({
          id: item.id,
          name: item.name
        }))

        // Update state with fresh data
        setCachedData('lowStock', lowStockItems)
        setLowStockItems(lowStockItems)
        setCachedData('outOfStockAssets', outOfStockAssets)
        setOutOfStockAssets(outOfStockAssets)
      } catch (error) {
        console.error("Error loading equipment status:", error)
      }
    }
    loadEquipmentStatus()
  }, [])

  // Load pending and upcoming room bookings from Firestore
  useEffect(() => {
    const loadPendingBookings = async () => {
      try {
        // Check cache first
        const cached = getCachedData('pendingBookings')
        if (cached) {
          setPendingBookings(cached)
          return
        }

        const q = query(collection(db, "roomBookings"), where("status", "==", "pending"))
        const querySnapshot = await getDocs(q)
        const bookings: RoomBooking[] = []
        querySnapshot.forEach((doc) => {
          const data = doc.data()
          bookings.push({
            id: doc.id,
            roomCode: data.roomCode || "",
            roomType: data.roomType || "",
            userName: data.userName || "",
            date: data.date || "",
            startTime: data.startTime || "",
            endTime: data.endTime || "",
            status: data.status || "pending"
          })
        })
        
        // Cache the results
        setCachedData('pendingBookings', bookings)
        setPendingBookings(bookings)
      } catch (error) {
        console.error("Error loading pending bookings:", error)
      }
    }
    loadPendingBookings()
  }, [])

  const handleLogout = async () => {
    try {
      await signOut(auth)
      navigate('/login')
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  // const handleMigrateImages = async () => {
  //   if (!window.confirm('ย้ายรูปภาพทั้งหมดไปยัง Firebase Storage?\n(ทำครั้งเดียวเท่านั้น หลังจากทำแล้วหน้าเว็บจะโหลดเร็วขึ้นมาก)')) return
  //   setMigrating(true)
  //   setMigrationDone(null)
  //   try {
  //     const results = await migrateAllImagesToStorage((col, current, total, _id) => {
  //       setMigrationProgress(`${col}: ${current}/${total}`)
  //     })
  //     setMigrationDone(results)
  //   } catch (err) {
  //     console.error('Migration error:', err)
  //     alert('เกิดข้อผิดพลาดในการย้ายรูปภาพ ดูรายละเอียดใน Console')
  //   } finally {
  //     setMigrating(false)
  //     setMigrationProgress("")
  //   }
  // }

  return (
    <div
      className="
        min-h-screen
        bg-white
        bg-[radial-gradient(#dbeafe_1px,transparent_1px)]
        bg-size-[18px_18px]
      "
    >
      {/* ===== HEADER ===== */}
      <Header title="จัดการข้อมูลห้องและสถิติ" />

      {/* ===== CONTENT ===== */}
      <div className="mt-8 flex justify-center">
        <div className="w-full max-w-90 px-4 flex flex-col items-center">
          {/* Room Booking Alert */}
          {pendingBookings.length > 0 && (
            <div className="w-full mb-6 bg-amber-50 rounded-lg p-4 border border-amber-200">
              <h3 className="text-sm font-semibold text-amber-800 mb-3">🔔 มีการจองห้องรอการอนุมัติ</h3>
              <div className="flex flex-col gap-2 mb-4">
                <div className="text-sm text-gray-700">
                  <span className="font-semibold text-amber-700">{pendingBookings.length} รายการ</span>
                  <span> รอการอนุมัติ</span>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/room-booking-history')}
                className="w-full py-2 bg-orange-500 text-white text-sm font-semibold rounded-full hover:bg-orange-600 transition"
              >
                ดูการจองห้อง
              </button>
            </div>
          )}

          {/* Low Stock / Out-of-Stock Alert */}
          {(lowStockItems.length > 0 || outOfStockAssets.length > 0) && (
            <div className="w-full mb-8 bg-red-50 rounded-lg p-4 border border-red-200">
              <h3 className="text-sm font-semibold text-red-800 mb-3">⚠️ สต๊อกอุปกรณ์ไม่เพียงพอ</h3>
              {(() => {
                const outOfStockConsumableCount = lowStockItems.filter(item => item.quantity === 0).length
                const lowStockCount = lowStockItems.filter(item => item.quantity > 0).length
                const outOfStockAssetCount = outOfStockAssets.length
                const totalOutOfStock = outOfStockConsumableCount + outOfStockAssetCount
                return (
                  <>
                    <div className="flex flex-col gap-2 mb-4">
                      {totalOutOfStock > 0 && (
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold text-red-700">{totalOutOfStock} รายการ</span>
                          <span> หมดสต๊อก</span>
                        </div>
                      )}
                      {lowStockCount > 0 && (
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold text-red-600">{lowStockCount} รายการ</span>
                          <span> สต๊อกใกล้หมด</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {totalOutOfStock > 0 && (
                        <button
                          onClick={() => navigate('/admin/manage-equipment', { state: { stockFilter: 'outOfStock' } })}
                          className="w-full py-2 bg-red-700 text-white text-sm font-semibold rounded-full hover:bg-red-800 transition"
                        >
                          ดูรายการหมดสต๊อก ({totalOutOfStock})
                        </button>
                      )}
                      {lowStockCount > 0 && (
                        <button
                          onClick={() => navigate('/admin/manage-equipment', { state: { stockFilter: 'lowStock' } })}
                          className="w-full py-2 bg-red-500 text-white text-sm font-semibold rounded-full hover:bg-red-600 transition"
                        >
                          ดูรายการสต๊อกน้อย ({lowStockCount})
                        </button>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* Admin Buttons */}
          <div className="w-full flex flex-col gap-4">
            {/* Manage Rooms Button */}
            <button
              onClick={() => navigate('/admin/manage-rooms')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              จัดการห้อง
            </button>

            {/* Manage Calendar/Equipment Button */}
            <button
              onClick={() => navigate('/admin/manage-equipment')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              จัดการอุปกรณ์/ครุภัณฑ์
            </button>

            {/* Equipment Condition Report Button */}
            <button
              onClick={() => navigate('/admin/equipment-condition')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              รายงานสภาพอุปกรณ์
            </button>

            {/* Borrow/Return History Button */}
            <button
              onClick={() => navigate('/admin/borrow-return-history')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              ประวัติการยืม/คืน
            </button>

            {/* Room Booking History Button */}
            <button
              onClick={() => navigate('/admin/room-booking-history')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              ประวัติการจองห้อง
            </button>

            {/* Admin History Button */}
            <button
              onClick={() => navigate('/admin/history')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              ประวัติการจัดการของแอดมิน
            </button>

            {/* Admin Management Button */}
            <button
              onClick={() => navigate('/admin/management')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              จัดการแอดมิน
            </button>

            {/* Manage Users Button */}
            <button
              onClick={() => navigate('/admin/manage-users')}
              className="
                w-full
                py-4
                rounded-full
                text-white
                text-base font-semibold
                hover:opacity-90
                transition
              "
              style={{ backgroundColor: "#FF7F50" }}
            >
              จัดการผู้ใช้งาน
            </button>
          </div>

          {/* Image Migration Tool */}
          {/* <button
            onClick={handleMigrateImages}
            disabled={migrating}
            className="
              w-full
              mt-6
              py-3
              rounded-full
              border border-gray-400
              text-gray-700
              text-sm font-medium
              hover:bg-gray-100
              transition
              disabled:opacity-50
            "
          >
            {migrating ? `⏳ กำลังย้ายรูปภาพ... ${migrationProgress}` : '🖼️ ย้ายรูปภาพไปยัง Storage (ทำ 1 ครั้ง)'}
          </button> */}

          {/* Migration result */}
          {/* {migrationDone && (
            <div className="w-full mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <p className="font-semibold mb-1">✅ ย้ายรูปภาพสำเร็จ!</p>
              {(['equipment', 'equipmentMaster', 'rooms'] as const).map((col) => {
                const r = migrationDone[col]
                return (
                  <p key={col} className="text-xs">
                    {col}: ย้าย {r.migrated} | ข้าม {r.skipped} | ผิดพลาด {r.failed}
                    {r.errors.length > 0 && <span className="text-red-600"> ({r.errors.join(', ')})</span>}
                  </p>
                )
              })}
            </div>
          )} */}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="
              w-full
              mt-16
              py-3
              rounded-full
              border border-gray-400
              text-white
              text-sm font-medium
              hover:bg-gray-100
              transition
              mb-6
            "
            style={{ backgroundColor: "#DC2626" }}
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  )
}
