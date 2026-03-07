import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { doc, getDoc, collection, getDocs, query, where, writeBatch } from "firebase/firestore"
import { db } from "../../../firebase/firebase"
import Header from "../../../components/Header"
import { useAuth } from "../../../hooks/useAuth"
import { logBorrowTransaction } from "../../../utils/borrowReturnLogger"
import { getAvailableAssetInstances, markAssetInstancesAsBorrowed, invalidateEquipmentCache } from "../../../utils/equipmentHelper"
import type { SelectedEquipment } from "../../../App"

interface ConfirmSummaryProps {
  cartItems: SelectedEquipment[]
  setCartItems?: (items: SelectedEquipment[]) => void
}

interface AssetCode {
  equipmentId: string
  code: string
  selected: boolean
}

export default function ConfirmSummary({ cartItems }: ConfirmSummaryProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [fullName, setFullName] = useState<string>("")
  const [userIdNumber, setUserIdNumber] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [assetCodesMap, setAssetCodesMap] = useState<Map<string, AssetCode[]>>(new Map())
  const totalItems = cartItems.reduce((sum, item) => sum + item.selectedQuantity, 0)

  // Get borrow info from sessionStorage
  const borrowInfo = JSON.parse(sessionStorage.getItem("borrowInfo") || "{}")
  const expectedReturnTime = borrowInfo.expectedReturnTime || ""
  const borrowType = borrowInfo.borrowType || ""

  const getBorrowTypeLabel = () => {
    switch (borrowType) {
      case "during-class":
        return "ยืมในคาบเรียน"
      case "teaching":
        return "ยืมใช้สอน"
      case "outside":
        return "ยืมนอกคาบเรียน"
      default:
        return "ยืมอุปกรณ์"
    }
  }

  // Fetch user's fullName from Firestore
  useEffect(() => {
    const fetchUserFullName = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid))
          if (userDoc.exists()) {
            setFullName(userDoc.data().fullName || "")
            setUserIdNumber(userDoc.data().idNumber || "")
          }
        } catch (error) {
          console.error("Error fetching user fullName:", error)
        }
      }
    }
    fetchUserFullName()
  }, [user])

  // Fetch available asset codes for items
  useEffect(() => {
    const fetchAssetCodes = async () => {
      try {
        const newAssetCodesMap = new Map<string, AssetCode[]>()

        for (const item of cartItems) {
          if (item.category === "asset") {
            // Use new helper to get available asset instances from assetInstances collection
            const availableInstances = await getAvailableAssetInstances(item.name)
            const codes: AssetCode[] = availableInstances.map((inst) => ({
              equipmentId: inst.id,  // Now using instance ID from assetInstances collection
              code: inst.serialCode,
              selected: false
            }))
            
            // Auto-select the first N codes based on selected quantity
            const selectedCodes = codes.slice(0, item.selectedQuantity).map(c => ({ ...c, selected: true }))
            newAssetCodesMap.set(item.id, selectedCodes.concat(codes.slice(item.selectedQuantity)))
          }
        }

        setAssetCodesMap(newAssetCodesMap)
      } catch (error) {
        console.error("Error fetching asset codes:", error)
      }
    }

    if (cartItems.length > 0) {
      fetchAssetCodes()
    }
  }, [cartItems])

  // Get current date and return date (same day)
  const today = new Date()
  const borrowDate = today.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit"
  })
  const borrowTime = today.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit"
  })
  const returnDate = today.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit"
  })

  // Handle borrow submission
  const handleConfirm = async () => {
    if (!user || isSubmitting) return

    // Validate that assets have required number of codes selected
    for (const item of cartItems) {
      if (item.category === "asset") {
        const codes = assetCodesMap.get(item.id) || []
        const selectedCount = codes.filter(c => c.selected).length
        if (selectedCount !== item.selectedQuantity) {
          alert(`กรุณาเลือกรหัสอุปกรณ์ ${item.selectedQuantity} รายการสำหรับ ${item.name}`)
          return
        }
      }
    }

    setIsSubmitting(true)
    try {
      // Prepare equipment items for logging
      const equipmentItems = cartItems.map(item => {
        const selectedCodes = assetCodesMap.get(item.id)?.filter(c => c.selected).map(c => c.code) || []
        
        return {
          equipmentId: item.id,
          equipmentName: item.name,
          equipmentCategory: item.category,
          quantityBorrowed: item.selectedQuantity,
          assetCodes: selectedCodes // Use empty array instead of undefined
        }
      })

      // Log borrow transaction to Firestore
      await logBorrowTransaction(
        user,
        borrowType as "during-class" | "teaching" | "outside",
        equipmentItems,
        borrowDate,
        borrowTime,
        returnDate,
        "ปกติ", // conditionBeforeBorrow
        "", // notes - use empty string instead of undefined
        fullName,
        userIdNumber,
        expectedReturnTime || borrowTime
      )

      // Update equipment availability in Firebase
      const batch = writeBatch(db)
      
      for (const item of cartItems) {
        if (item.category === "consumable") {
          // For consumables: decrement quantity in equipment collection
          const q = query(collection(db, "equipment"), where("name", "==", item.name))
          const snapshot = await getDocs(q)
          
          snapshot.forEach((docSnap) => {
            const currentQty = docSnap.data().quantity || 0
            const newQty = Math.max(0, currentQty - item.selectedQuantity)
            
            batch.update(doc(db, "equipment", docSnap.id), {
              quantity: newQty,
              available: newQty > 0 // Mark as unavailable if quantity reaches 0
            })
          })
        } else if (item.category === "asset") {
          // For assets: update available count in equipment/equipmentMaster collection
          const q = query(collection(db, "equipmentMaster"), where("name", "==", item.name))
          const snapshot = await getDocs(q)
          
          snapshot.forEach((docSnap) => {
            const currentAvailable = docSnap.data().available || 0
            const newAvailable = Math.max(0, currentAvailable - item.selectedQuantity)
            
            batch.update(doc(db, "equipmentMaster", docSnap.id), {
              available: newAvailable
            })
          })
        }
      }
      
      await batch.commit()

      // For assets: mark borrowed instances as unavailable using new helper
      for (const item of cartItems) {
        if (item.category === "asset") {
          const selectedCodes = assetCodesMap.get(item.id)?.filter(c => c.selected) || []
          const selectedInstanceIds = selectedCodes.map(c => c.equipmentId)
          
          await markAssetInstancesAsBorrowed(selectedInstanceIds)
        }
      }

      // Clear equipment cache so next borrow shows updated quantities
      invalidateEquipmentCache()

      // Navigate to completion page
      navigate('/borrow/completion')
    } catch (error) {
      console.error("Error saving borrow data:", error)
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง")
    } finally {
      setIsSubmitting(false)
    }
  }


  return (
    <div
      className="
        min-h-screen
        bg-white
        bg-[radial-gradient(#dbeafe_1px,transparent_1px)]
        bg-[length:18px_18px]
      "
    >
      {/* ===== HEADER ===== */}
      <Header title="ตรวจสอบรายการก่อนยืนยัน" />

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-[360px] px-4 flex flex-col items-center">
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

          {/* Summary Header */}
          <div className="w-full bg-gray-100 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">👤</span>
                <span className="text-sm text-gray-700">{fullName || user?.email || "ผู้ใช้"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>📦</span>
                <span>ประเภทการยืม: {getBorrowTypeLabel()}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span>ยืมวันที่ {borrowDate} เวลา {borrowTime} น.</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span>📋</span>
                <span className="text-blue-600 font-medium">กำหนดคืน {returnDate} เวลา {expectedReturnTime || borrowTime} น.</span>
              </div>
            </div>
          </div>

          {/* Equipment Summary List */}
          <div className="w-full mb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">รายการยืมทั้งหมด ({totalItems} รายการ)</h3>
            <div className="space-y-2">
              {cartItems.map((item) => {
                const codes = assetCodesMap.get(item.id) || []
                const selectedCount = codes.filter(c => c.selected).length
                
                return (
                  <div
                    key={item.id}
                    className="bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-sm font-medium text-gray-800">{item.name}</h4>
                        <p className="text-xs text-green-600 font-medium">
                          {item.equipmentTypes?.length ? (
                            <>
                              {item.equipmentTypes.join(", ")}
                              {item.equipmentSubTypes?.length && ` (${item.equipmentSubTypes.join(", ")})`}
                            </>
                          ) : (
                            "ไม่ระบุประเภท"
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-800">{item.selectedQuantity}</p>
                        <p className="text-xs text-gray-500">{item.unit}</p>
                      </div>
                    </div>
                    
                    {/* Asset codes selection for asset category */}
                    {item.category === "asset" && codes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700 mb-2">
                          รหัสอุปกรณ์ที่เลือก ({selectedCount}/{item.selectedQuantity})
                        </p>
                        <div className="space-y-1">
                          {codes.filter(code => code.selected).map((code, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-1 rounded bg-blue-50 border border-blue-100"
                            >
                              <span className="text-xs text-gray-700">✓ {code.code}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Total Summary */}
          <div className="w-full bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-800">รวมจำนวนอุปกรณ์ทั้งหมด</span>
              <span className="text-lg font-bold text-orange-500">{totalItems} รายการ</span>
            </div>
          </div>

          {/* Buttons */}
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`
              w-full
              px-4 py-3
              rounded-full
              text-white
              text-sm font-medium
              transition
              mb-6
              ${isSubmitting ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"}
            `}
          >
            {isSubmitting ? "กำลังบันทึก..." : "เสร็จสิ้น"}
          </button>
        </div>
      </div>
    </div>
  )
}
