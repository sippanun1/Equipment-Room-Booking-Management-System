import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { collection, getDocs } from "firebase/firestore"
import { db } from "../../../firebase/firebase"
import { useAuth } from "../../../hooks/useAuth"
import { loadAllEquipment } from "../../../utils/equipmentHelper"
import shoppingCartIcon from "../../../assets/shoppingcart.svg"
import type { SelectedEquipment } from "../../../App"

interface Equipment {
  id: string
  name: string
  category: "consumable" | "asset" | "main"
  quantity: number
  unit: string
  picture?: string
  inStock: boolean
  available: number
  availableCount?: number
  serialCode?: string
  equipmentTypes?: string[]
  equipmentSubTypes?: string[]
}

interface EquipmentSelectionProps {
  cartItems?: SelectedEquipment[]
  setCartItems: (items: SelectedEquipment[]) => void
}

const ITEMS_PER_PAGE = 30

export default function EquipmentSelection({ setCartItems }: EquipmentSelectionProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState<string>("")
  const [currentTime, setCurrentTime] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<"all" | "consumable" | "asset" | "main">("all")
  const [selectedType, setSelectedType] = useState<string>("ทั้งหมด")
  const [selectedSubType, setSelectedSubType] = useState<string>("ทั้งหมด")
  const [showFilters, setShowFilters] = useState(false)
  const [equipmentData, setEquipmentData] = useState<Equipment[]>([])
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>([])
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [loadingAssetsError, setLoadingAssetsError] = useState(false)
  const [displayedBatches, setDisplayedBatches] = useState(1) // Number of 30-item batches to display
  const [loadingMoreBatches, setLoadingMoreBatches] = useState(false) // Shows if more batches are coming

  // Check if any filter is active
  const hasActiveFilters = selectedCategory !== "all" || selectedType !== "ทั้งหมด" || selectedSubType !== "ทั้งหมด"

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date()
      const date = now.toLocaleDateString("th-TH", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit"
      })
      const time = now.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
      setCurrentDate(date)
      setCurrentTime(time)
    }

    updateDateTime()
    const interval = setInterval(updateDateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Load equipment from Firebase
  useEffect(() => {
    const loadEquipment = async () => {
      try {
        // Phase 1: Load consumables quickly
        const quickSnap = await getDocs(collection(db, "equipment"))
        const quickItems: Equipment[] = []
        quickSnap.forEach((docSnap) => {
          const data = docSnap.data()
          if ((data.category === "consumable" || data.category === "main") && (data.quantity ?? 0) > 0) {
            quickItems.push({
              id: docSnap.id, name: data.name, category: data.category,
              quantity: data.quantity ?? 0, unit: data.unit || "ชิ้น",
              picture: data.picture, inStock: true,
              available: data.quantity ?? 0,
              equipmentTypes: data.equipmentTypes || [],
              equipmentSubTypes: data.equipmentSubTypes || []
            })
          }
        })
        setEquipmentData(quickItems)
        setFilteredEquipment(quickItems)
        setLoading(false)
        setLoadingAssets(true)
        setLoadingAssetsError(false)

        // Phase 2: Full load including assets
        try {
          const result = await loadAllEquipment()
          const allEquipment = result.items
          
          // Step 1: Filter out unavailable items
          const filtered = allEquipment.filter(item => {
            if (item.category === "consumable" || item.category === "main") {
              return (item.quantity ?? 0) > 0
            }
            if (item.category === "asset") {
              // Must have at least one instance AND at least one available
              if ((item.quantity ?? 0) === 0) return false
              return item.availableCount !== undefined
                ? item.availableCount > 0
                : (item.quantity ?? 0) > 0
            }
            return false
          })

          // Step 2: Deduplicate by name — combine available counts and allIds
          // (handles case where two equipmentMaster docs have the same name)
          const nameMap = new Map<string, typeof filtered[0]>()
          filtered.forEach(item => {
            const existing = nameMap.get(item.name)
            if (existing) {
              existing.availableCount = (existing.availableCount ?? 0) + (item.availableCount ?? 0)
              existing.quantity += item.quantity
              existing.allIds = [...(existing.allIds ?? []), ...(item.allIds ?? [])]
            } else {
              nameMap.set(item.name, { ...item, allIds: [...(item.allIds ?? [])] })
            }
          })

          const availableEquipment = Array.from(nameMap.values()).map(item => {
            const displayAvailable =
              item.category === "asset" && item.availableCount !== undefined
                ? item.availableCount
                : item.quantity
            return {
              id: item.id, name: item.name, category: item.category,
              quantity: item.quantity, availableCount: item.availableCount,
              unit: item.unit, picture: item.picture,
              inStock: displayAvailable > 0, available: displayAvailable,
              equipmentTypes: item.equipmentTypes, equipmentSubTypes: item.equipmentSubTypes
            }
          })
          setEquipmentData(availableEquipment)
          setFilteredEquipment(availableEquipment)
        } catch (phase2Error) {
          console.error("Error loading assets:", phase2Error)
          setLoadingAssetsError(true)
        }
      } catch (error) {
        console.error("Error loading equipment:", error)
      } finally {
        setLoading(false)
        setLoadingAssets(false)
      }
    }
    loadEquipment()
  }, [])

  // Retry loading assets (Phase 2) if it failed
  const retryLoadingAssets = async () => {
    try {
      setLoadingAssets(true)
      setLoadingAssetsError(false)

      const result = await loadAllEquipment()
      const allEquipment = result.items
      
      // Step 1: Filter out unavailable items
      const filtered = allEquipment.filter(item => {
        if (item.category === "consumable" || item.category === "main") {
          return (item.quantity ?? 0) > 0
        }
        if (item.category === "asset") {
          if ((item.quantity ?? 0) === 0) return false
          return item.availableCount !== undefined
            ? item.availableCount > 0
            : (item.quantity ?? 0) > 0
        }
        return false
      })

      // Step 2: Deduplicate by name
      const nameMap = new Map<string, typeof filtered[0]>()
      filtered.forEach(item => {
        const existing = nameMap.get(item.name)
        if (existing) {
          existing.availableCount = (existing.availableCount ?? 0) + (item.availableCount ?? 0)
          existing.quantity += item.quantity
          existing.allIds = [...(existing.allIds ?? []), ...(item.allIds ?? [])]
        } else {
          nameMap.set(item.name, { ...item, allIds: [...(item.allIds ?? [])] })
        }
      })

      const availableEquipment = Array.from(nameMap.values()).map(item => {
        const displayAvailable =
          item.category === "asset" && item.availableCount !== undefined
            ? item.availableCount
            : item.quantity
        return {
          id: item.id, name: item.name, category: item.category,
          quantity: item.quantity, availableCount: item.availableCount,
          unit: item.unit, picture: item.picture,
          inStock: displayAvailable > 0, available: displayAvailable,
          equipmentTypes: item.equipmentTypes, equipmentSubTypes: item.equipmentSubTypes
        }
      })
      setEquipmentData(availableEquipment)
      setFilteredEquipment(availableEquipment)
    } catch (error) {
      console.error("Error retrying asset load:", error)
      setLoadingAssetsError(true)
    } finally {
      setLoadingAssets(false)
    }
  }

  // Progressive batch loading: show first batch, load next batch in background
  useEffect(() => {
    const totalItems = filteredEquipment.length
    const maxBatches = Math.ceil(totalItems / ITEMS_PER_PAGE)
    
    // If there are more batches to load
    if (displayedBatches < maxBatches) {
      setLoadingMoreBatches(true)
      
      // Simulate batch loading with small delay for UX feedback
      const timer = setTimeout(() => {
        setDisplayedBatches(displayedBatches + 1)
        setLoadingMoreBatches(false)
      }, 500)
      
      return () => clearTimeout(timer)
    } else {
      setLoadingMoreBatches(false)
    }
  }, [filteredEquipment, displayedBatches])

  useEffect(() => {
    let filtered = equipmentData

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(item => item.category === selectedCategory)
    }

    // Filter by type
    if (selectedType !== "ทั้งหมด") {
      filtered = filtered.filter(item => item.equipmentTypes?.includes(selectedType))
      
      // Filter by subtype if selected
      if (selectedSubType !== "ทั้งหมด") {
        filtered = filtered.filter(item => item.equipmentSubTypes?.includes(selectedSubType))
      }
    }

    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredEquipment(filtered)
    setDisplayedBatches(1) // Reset to first batch when filters change
  }, [searchTerm, selectedCategory, selectedType, selectedSubType, equipmentData])

  // Reset subtype when type changes
  useEffect(() => {
    setSelectedSubType("ทั้งหมด")
  }, [selectedType])

  // Get available types based on current category and search filters (before type filter applied)
  const availableTypes = useMemo(() => {
    const types = new Set<string>()
    let baseFiltered = equipmentData

    // Apply category filter
    if (selectedCategory !== "all") {
      baseFiltered = baseFiltered.filter(item => item.category === selectedCategory)
    }

    // Apply search filter
    if (searchTerm) {
      baseFiltered = baseFiltered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Collect all types from filtered equipment
    baseFiltered.forEach(item => {
      if (item.equipmentTypes && Array.isArray(item.equipmentTypes)) {
        item.equipmentTypes.forEach(type => types.add(type))
      }
    })

    return Array.from(types).sort()
  }, [equipmentData, selectedCategory, searchTerm])

  // Get available subtypes based on selected type and current filters
  const availableSubTypes = useMemo(() => {
    if (selectedType === "ทั้งหมด") return []
    
    const subTypes = new Set<string>()
    let baseFiltered = equipmentData

    // Apply category filter
    if (selectedCategory !== "all") {
      baseFiltered = baseFiltered.filter(item => item.category === selectedCategory)
    }

    // Apply search filter
    if (searchTerm) {
      baseFiltered = baseFiltered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply selected type filter
    baseFiltered = baseFiltered.filter(item => 
      item.equipmentTypes?.includes(selectedType)
    )

    // Collect all subtypes from filtered equipment
    baseFiltered.forEach(item => {
      if (item.equipmentSubTypes && Array.isArray(item.equipmentSubTypes)) {
        item.equipmentSubTypes.forEach(subType => subTypes.add(subType))
      }
    })

    return Array.from(subTypes).sort()
  }, [equipmentData, selectedCategory, selectedType, searchTerm])

  // Get only displayed items based on batches
  const displayedEquipment = filteredEquipment.slice(0, displayedBatches * ITEMS_PER_PAGE)

  const handleAddQuantity = (equipmentId: string) => {
    const equipment = equipmentData.find(e => e.id === equipmentId)
    if (!equipment) return
    
    const currentSelected = selectedItems.get(equipmentId) || 0
    if (currentSelected >= equipment.available) return // Don't exceed available stock
    
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      newMap.set(equipmentId, currentSelected + 1)
      return newMap
    })
  }

  const handleRemoveQuantity = (equipmentId: string) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      const currentQty = newMap.get(equipmentId) || 0
      if (currentQty > 1) {
        newMap.set(equipmentId, currentQty - 1)
      } else {
        newMap.delete(equipmentId)
      }
      return newMap
    })
  }

  const handleCheckout = () => {
    const selectedEquipmentList: SelectedEquipment[] = Array.from(selectedItems.entries()).map(
      ([equipmentId, quantity]) => {
        const equipment = equipmentData.find(e => e.id === equipmentId)!
        return {
          ...equipment,
          selectedQuantity: quantity
        }
      }
    )
    setCartItems(selectedEquipmentList)
    navigate('/borrow/cart')
  }

  const totalItems = Array.from(selectedItems.values()).reduce((sum, qty) => sum + qty, 0)

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
      <div
        className="
          w-full h-14
          bg-[#FF7F50]
          text-white text-xl font-semibold
          flex items-center
          px-6
          z-10
        "
      >
        <span className="flex-1 text-center mr-auto">เลือกอุปกรณ์ที่ต้องการยืม</span>
        <button
          onClick={handleCheckout}
          disabled={totalItems === 0}
          className={`
            relative
            ${totalItems === 0 ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"}
          `}
        >
          <img
            src={shoppingCartIcon}
            alt="Shopping Cart"
            className="w-6 h-6"
          />
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-90 px-4 flex flex-col items-center">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="
              w-full
              py-3
              rounded-full
              border border-gray-400
              text-gray-600
              text-sm font-medium
              hover:bg-gray-100
              transition
              mb-6
              flex items-center justify-center gap-2
            "
          >
            <img src="/arrow.svg" alt="back" className="w-5 h-5" />
          </button>

          {/* Date & Time */}
          <div className="w-full flex justify-between text-gray-600 text-xs mb-4">
            <div>{user?.displayName || user?.email || "User"}</div>
            <div className="text-right">
              <div>{currentDate}</div>
              <div>Time {currentTime}</div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="w-full mb-4">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่ออุปกรณ์..."
                className="
                  w-full h-10
                  px-4
                  rounded-full
                  border border-gray-300
                  outline-none
                  text-sm
                  placeholder-gray-400
                  focus:border-orange-500
                "
              />
              <span className="absolute right-3 text-gray-400">🔍</span>
            </div>
          </div>

          {/* Filter Section */}
          <div className="w-full bg-gray-50 border border-gray-200 rounded-lg mb-4 overflow-hidden">
            {/* Filter Header - Always Visible */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">🔧 ตัวกรอง</span>
                {hasActiveFilters && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">
                    กำลังใช้งาน
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  พบ <span className="font-semibold text-orange-600">{filteredEquipment.length}</span> รายการ
                </span>
                <span className={`text-gray-400 transition-transform ${showFilters ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </button>

            {/* Collapsible Filter Content */}
            {showFilters && (
              <div className="px-4 pb-4 border-t border-gray-200">
                {/* Category Filter */}
                <div className="mt-4 mb-4">
                  <div className="text-xs font-semibold text-gray-600 mb-2">หมวดหมู่:</div>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { key: "all", label: "ทั้งหมด" },
                      { key: "consumable", label: "วัสดุสิ้นเปลือง" },
                      { key: "asset", label: "ครุภัณฑ์" },
                      { key: "main", label: "เครื่องจักร" },
                    ] as const).map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => setSelectedCategory(cat.key)}
                        className={`
                          px-4 py-2
                          rounded-full
                          text-sm font-medium
                          transition
                          ${selectedCategory === cat.key
                            ? "bg-orange-500 text-white"
                            : "border border-gray-300 text-gray-700 hover:border-orange-500"
                          }
                        `}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type Filters */}
                {availableTypes.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2">ประเภทอุปกรณ์:</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => { setSelectedType("ทั้งหมด"); setSelectedSubType("ทั้งหมด") }}
                        className={`
                          px-3 py-1.5 rounded-full text-xs font-medium transition
                          ${
                            selectedType === "ทั้งหมด"
                              ? "bg-blue-500 text-white"
                              : "border border-gray-300 text-gray-700 hover:border-blue-500"
                          }
                        `}
                      >
                        ทั้งหมด
                      </button>
                      {availableTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => { setSelectedType(type); setSelectedSubType("ทั้งหมด") }}
                          className={`
                            px-3 py-1.5 rounded-full text-xs font-medium transition
                            ${
                              selectedType === type
                                ? "bg-blue-500 text-white"
                                : "border border-gray-300 text-gray-700 hover:border-blue-500"
                            }
                          `}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* SubType Filters */}
                {selectedType !== "ทั้งหมด" && availableSubTypes.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2">ประเภทย่อย:</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setSelectedSubType("ทั้งหมด")}
                        className={`
                          px-3 py-1.5 rounded-full text-xs font-medium transition
                          ${
                            selectedSubType === "ทั้งหมด"
                              ? "bg-blue-500 text-white"
                              : "border border-gray-300 text-gray-700 hover:border-blue-500"
                          }
                        `}
                      >
                        ทั้งหมด
                      </button>
                      {availableSubTypes.map((subType) => (
                        <button
                          key={subType}
                          onClick={() => setSelectedSubType(subType)}
                          className={`
                            px-3 py-1.5 rounded-full text-xs font-medium transition
                            ${
                              selectedSubType === subType
                                ? "bg-blue-500 text-white"
                                : "border border-gray-300 text-gray-700 hover:border-blue-500"
                            }
                          `}
                        >
                          {subType}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                  <div className="pt-3 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setSelectedCategory("all")
                        setSelectedType("ทั้งหมด")
                        setSelectedSubType("ทั้งหมด")
                      }}
                      className="text-sm text-gray-500 hover:text-red-500 transition flex items-center gap-1"
                    >
                      ✕ ล้างตัวกรองทั้งหมด
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Equipment Grid */}
          <div className="w-full flex flex-col gap-2 mb-2">
            {loading && (
              <div className="w-full text-center py-6 text-gray-400 text-sm">กำลังโหลด...</div>
            )}
            {!loading && loadingAssets && (
              <div className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600">
                <span className="animate-spin">⏳</span>
                <span>กำลังโหลดครุภัณฑ์...</span>
              </div>
            )}
            {!loading && loadingAssetsError && (
              <div className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                <span>⚠️ โหลดครุภัณฑ์ไม่สำเร็จ — แสดงเฉพาะวัสดุสิ้นเปลือง</span>
                <button
                  onClick={retryLoadingAssets}
                  disabled={loadingAssets}
                  className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:bg-gray-400 transition"
                >
                  {loadingAssets ? "กำลังลอง..." : "ลองใหม่"}
                </button>
              </div>
            )}
          </div>
          <div className="w-full grid grid-cols-2 gap-4 mb-6">
            {!loading && displayedEquipment.length > 0 ? (
              <>
                {displayedEquipment.map((item) => (
                <div
                  key={item.id}
                  className={`
                    rounded-lg
                    p-4
                    flex flex-col
                    text-center
                    transition
                    ${
                      item.inStock
                        ? "bg-gray-100 hover:bg-gray-150"
                        : "bg-red-50 opacity-75"
                    }
                  `}
                >
                  {/* Equipment Image */}
                  <div className="h-20 mb-3 flex justify-center items-center">
                    {item.picture ? (
                      <img
                        src={item.picture}
                        alt={item.name}
                        className="max-h-full max-w-full object-contain rounded"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-4xl">📦</div>
                    )}
                  </div>

                  {/* Equipment Name */}
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 line-clamp-2">
                    {item.name}
                  </h3>

                  {/* Type */}
                  <div className="text-xs text-gray-500 mb-2">
                    {item.equipmentTypes?.length ? (
                      <>
                        {item.equipmentTypes.join(", ")}
                        {(item.equipmentSubTypes?.length ?? 0) > 0 && ` (${item.equipmentSubTypes!.join(", ")})`}
                      </>
                    ) : (
                      "ไม่ระบุประเภท"
                    )}
                  </div>

                  {/* Stock Status */}
                  <div
                    className={`
                      text-xs font-semibold mb-2
                      ${
                        item.inStock
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    `}
                  >
                    {item.inStock ? "สต็อคพร้อมใช้งาน" : "สต็อคหมดแล้ว"}
                  </div>

                  {/* Available Quantity */}
                  <div className="text-xs text-gray-500 mb-4">
                    {item.available > 0 ? (
                      <>จำนวนคงเหลือ {item.available} {item.unit}</>
                    ) : (
                      <>หมดสต็อค</>
                    )}
                  </div>

                  {/* Button or Out of Stock */}
                  {item.inStock ? (
                    selectedItems.has(item.id) ? (
                      <div className="w-full flex items-center justify-center gap-3">
                        <button
                          onClick={() => handleRemoveQuantity(item.id)}
                          className="
                            w-8 h-8
                            rounded-full
                            border border-gray-400
                            text-gray-600
                            hover:bg-gray-200
                            transition
                          "
                        >
                          −
                        </button>
                        <span className="text-sm font-medium">{selectedItems.get(item.id)}</span>
                        <button
                          onClick={() => handleAddQuantity(item.id)}
                          className="
                            w-8 h-8
                            rounded-full
                            border border-gray-400
                            text-gray-600
                            hover:bg-gray-200
                            transition
                          "
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddQuantity(item.id)}
                        className="
                          w-full
                          py-2
                          rounded-full
                          bg-orange-500
                          text-white
                          text-xs font-medium
                          hover:bg-orange-600
                          transition
                        "
                      >
                        ยืมอุปกรณ์
                      </button>
                    )
                  ) : (
                    <button
                      disabled
                      className="
                        w-full
                        py-2
                        rounded-full
                        bg-gray-300
                        text-gray-500
                        text-xs font-medium
                        cursor-not-allowed
                      "
                    >
                      สต็อคหมด
                    </button>
                  )}
                </div>
              ))}
                
                {/* Loading More Batches Indicator */}
                {loadingMoreBatches && (
                  <div className="col-span-2 flex justify-center py-6">
                    <div className="flex items-center gap-2">
                      <span className="animate-spin text-lg">⏳</span>
                      <span className="text-sm text-gray-500">กำลังโหลดเพิ่มเติม...</span>
                    </div>
                  </div>
                )}
              </>
            ) : !loading && !loadingAssets ? (
              <div className="col-span-2 text-center text-gray-600 py-8">
                ไม่พบอุปกรณ์ที่ค้นหา
              </div>
            ) : null}
          </div>

          {/* Page Info */}
          {filteredEquipment.length > 0 && (
            <div className="w-full text-center text-xs text-gray-500 mb-4">
              แสดง 1-{displayedEquipment.length} จาก {filteredEquipment.length} รายการ
            </div>
          )}

          {/* Cart Button */}
          <button
            onClick={handleCheckout}
            disabled={totalItems === 0}
            className={`
              w-full
              py-3
              rounded-full
              text-sm font-semibold
              transition
              mb-4
              flex items-center justify-center gap-2
              ${totalItems === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-orange-500 text-white hover:bg-orange-600"
              }
            `}
          >
            <img src={shoppingCartIcon} alt="" className="w-5 h-5" />
            <span>ตะกร้าอุปกรณ์ ({totalItems} ชิ้น)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
