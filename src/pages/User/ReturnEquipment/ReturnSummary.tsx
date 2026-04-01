import Header from "../../../components/Header"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../../hooks/useAuth"
import { logReturnTransaction } from "../../../utils/borrowReturnLogger"
import { syncMasterAvailableCountBatch } from "../../../utils/equipmentHelper"
import type { ReturnEquipmentItem } from "../../../App"

interface ReturnSummaryProps {
  returnEquipment: ReturnEquipmentItem[]
  setReturnEquipment: (equipment: ReturnEquipmentItem[]) => void
}



export default function ReturnSummary({ returnEquipment, setReturnEquipment }: ReturnSummaryProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const checkedItems = returnEquipment.filter(item => item.checked)
  const totalItems = checkedItems.length
  const totalQuantity = checkedItems.reduce((sum, item) => {
    if (item.equipmentCategory === "consumable") {
      return sum + (item.quantity || 0)
    } else {
      // For assets, sum the breakdown
      return sum + ((item.returnGoodQty || 0) + (item.returnDamagedQty || 0) + (item.returnLostQty || 0))
    }
  }, 0)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Get expected return date and time from first checked item
  const expectedReturnDate = checkedItems[0]?.expectedReturnDate || ''
  const expectedReturnTime = checkedItems[0]?.expectedReturnTime || ''
  const userName = user?.displayName || user?.email || 'User'

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
      <Header title="สรุปรายการคืนอุปกรณ์" />

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

          {/* Summary Header */}
          <div className="w-full bg-gray-100 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">👤</span>
                <span className="text-sm text-gray-700">{userName}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span>วันที่ยืม: {checkedItems[0]?.borrowDate || '-'} {checkedItems[0]?.borrowTime || '-'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-blue-600 font-medium">
              <div className="flex items-center gap-2">
                <span>📋</span>
                <span>กำหนดคืน: {expectedReturnDate} {expectedReturnTime || '-'}</span>
              </div>
            </div>
          </div>

          {/* Equipment Summary Items */}
          <div className="w-full mb-6 space-y-3">
            {checkedItems.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">{item.name}</h4>
                    <p className="text-xs text-blue-500 font-medium">{item.code}</p>
                  </div>
                  <div className="text-right">
                    {item.equipmentCategory === "consumable" ? (
                      <div>
                        <p className="text-xs text-gray-600">ยืม / คืน</p>
                        <p className="text-sm font-semibold text-gray-800">{item.quantityBorrowed} / {item.quantity} ชิ้น</p>
                      </div>
                    ) : (
                      // For assets, calculate from breakdown
                      (() => {
                        const returnedQty = item.assetCodeConditions && item.assetCodeConditions.length > 0
                          ? item.assetCodeConditions.length
                          : ((item.returnGoodQty || 0) + (item.returnDamagedQty || 0) + (item.returnLostQty || 0))
                        return (
                          <div>
                            <p className="text-xs text-gray-600">ยืม / คืน</p>
                            <p className="text-sm font-semibold text-gray-800">{item.quantityBorrowed} / {returnedQty} ชิ้น</p>
                          </div>
                        )
                      })()
                    )}
                  </div>
                </div>

                {/* Status/Breakdown Details */}
                {item.equipmentCategory === "consumable" ? (
                  // CONSUMABLE: Show quantity returned + consumption status
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="text-center">
                        <p className="text-xs text-gray-600 font-semibold mb-1">ยืมไป</p>
                        <p className="text-sm font-bold text-gray-800">{item.quantityBorrowed} ชิ้น</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-600 font-semibold mb-1">คืนมา</p>
                        <p className="text-sm font-bold text-blue-700">{item.quantity} ชิ้น</p>
                      </div>
                    </div>
                    <div className="border-t border-blue-200 pt-2">
                      <p className="text-xs text-gray-600 font-semibold mb-2">สถานะการใช้:</p>
                      <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full inline-block">
                        {item.consumptionStatus || "ไม่ได้ระบุ"}
                      </span>
                    </div>
                  </div>
                ) : (
                  // ASSET: Show breakdown details
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
                    <p className="text-xs text-gray-600 font-semibold mb-2">รายละเอียดการคืน:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 bg-green-50 border border-green-200 rounded">
                        <p className="text-xs text-gray-600 font-semibold">ปกติ</p>
                        <p className="text-sm font-bold text-green-700">
                          {item.assetCodeConditions && item.assetCodeConditions.length > 0
                            ? item.assetCodeConditions.filter(c => c.condition === "ปกติ").length
                            : item.returnGoodQty || 0}
                        </p>
                      </div>
                      <div className="text-center p-2 bg-orange-50 border border-orange-200 rounded">
                        <p className="text-xs text-gray-600 font-semibold">ชำรุด</p>
                        <p className="text-sm font-bold text-orange-700">
                          {item.assetCodeConditions && item.assetCodeConditions.length > 0
                            ? item.assetCodeConditions.filter(c => c.condition === "ชำรุด").length
                            : item.returnDamagedQty || 0}
                        </p>
                      </div>
                      <div className="text-center p-2 bg-red-50 border border-red-200 rounded">
                        <p className="text-xs text-gray-600 font-semibold">สูญหาย</p>
                        <p className="text-sm font-bold text-red-700">
                          {item.assetCodeConditions && item.assetCodeConditions.length > 0
                            ? item.assetCodeConditions.filter(c => c.condition === "สูญหาย").length
                            : item.returnLostQty || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Asset code conditions - if available */}
                {item.equipmentCategory === "asset" && item.assetCodeConditions && item.assetCodeConditions.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3">
                    <p className="text-xs text-gray-600 font-semibold mb-2">รหัสอุปกรณ์และสถานะ:</p>
                    <div className="space-y-2">
                      {item.assetCodeConditions.map((codeItem, idx) => (
                        <div key={idx} className="border border-gray-200 rounded p-2 bg-white">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-800 text-xs">{codeItem.code}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              codeItem.condition === "ปกติ" ? "bg-green-100 text-green-800" :
                              codeItem.condition === "ชำรุด" ? "bg-orange-100 text-orange-800" :
                              "bg-red-100 text-red-800"
                            }`}>
                              {codeItem.condition}
                            </span>
                          </div>
                          {codeItem.notes && (
                            <div className="text-xs text-gray-600 mt-1 p-1 rounded bg-gray-50">
                              <span className="font-semibold">หมายเหตุ:</span> {codeItem.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes for items (consumables or assets with damage/loss) */}
                {item.notes && (
                  <div className={`rounded p-2 mt-2 text-xs ${
                    item.equipmentCategory === "consumable"
                      ? "bg-blue-50 border border-blue-200"
                      : (item.returnLostQty || 0) > 0
                        ? "bg-red-50 border border-red-200"
                        : "bg-orange-50 border border-orange-200"
                  }`}>
                    <p className="text-gray-700">
                      <span className="font-semibold">หมายเหตุ:</span> {item.notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary Stats */}
          <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 font-medium">รวมรายการคืนทั้งหมด:</span>
              <span className="text-gray-800 font-semibold">{totalItems} รายการ</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 font-medium">รวมจำนวนทั้งหมด:</span>
              <span className="text-gray-800 font-semibold">{totalQuantity} ชิ้น</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="w-full mb-6">
            <button
              onClick={() => setShowConfirmModal(true)}
              className="
                w-full
                px-4 py-2
                rounded-full
                bg-orange-500
                text-white
                text-sm font-medium
                hover:bg-orange-600
                transition
              "
            >
              ยืนยืน
            </button>
          </div>
        </div>
      </div>

      {/* ===== CONFIRM MODAL ===== */}
      {showConfirmModal && (
        <div className="fixed inset-0 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-[320px] mx-4 flex flex-col items-center overflow-hidden">
            {/* Modal Header - Orange */}
            <Header title="" />

            {/* Modal Content */}
            <div className="pt-5 w-full px-6 text-center">
              <div className="text-4xl mb-2">🔔</div>
              <p className="text-sm font-semibold">โปรดตรวจสอบข้อมูลให้ถูกต้อง<br />เมื่อกดยืนยันแล้ว จะไม่สามารถแก้ไขได้</p>
              </div>
            {/* Modal Buttons */}
            <div className="w-full px-6 py-6 flex gap-3">
              <button
                onClick={async () => {
                  if (isProcessing || !user) return
                  setIsProcessing(true)
                  
                  try {
                    // Group items by borrowId
                    const borrowsById: { [key: string]: ReturnEquipmentItem[] } = {}
                    checkedItems.forEach(item => {
                      if (item.borrowId) {
                        if (!borrowsById[item.borrowId]) {
                          borrowsById[item.borrowId] = []
                        }
                        borrowsById[item.borrowId].push(item)
                      }
                    })

                    // Log return for each borrow request
                    const today = new Date().toISOString().split('T')[0]
                    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                    
                    for (const [borrowId, items] of Object.entries(borrowsById)) {
                      // Convert to BorrowItem format with return conditions
                      const returnedItems = items.map(item => {
                        const isConsumable = item.equipmentCategory === "consumable"
                        
                        if (isConsumable) {
                          return {
                            equipmentId: item.equipmentId || item.id,
                            equipmentName: item.name,
                            equipmentCategory: item.equipmentCategory || "asset",
                            quantityBorrowed: item.quantityBorrowed,
                            quantityReturned: item.quantity,
                            consumptionStatus: item.consumptionStatus,
                            returnNotes: item.notes
                          }
                        } else {
                          // For assets: use assetCodeConditions if available
                          let goodQty = 0
                          let damagedQty = 0
                          let lostQty = 0
                          let totalReturned = 0
                          
                          if (item.assetCodeConditions && item.assetCodeConditions.length > 0) {
                            // Calculate from assetCodeConditions
                            goodQty = item.assetCodeConditions.filter(c => c.condition === "ปกติ").length
                            damagedQty = item.assetCodeConditions.filter(c => c.condition === "ชำรุด").length
                            lostQty = item.assetCodeConditions.filter(c => c.condition === "สูญหาย").length
                            totalReturned = item.assetCodeConditions.length
                          } else {
                            // Fallback to old fields if no asset code conditions
                            goodQty = item.returnGoodQty || 0
                            damagedQty = item.returnDamagedQty || 0
                            lostQty = item.returnLostQty || 0
                            totalReturned = goodQty + damagedQty + lostQty
                          }
                          
                          // Determine the primary return condition
                          let returnCondition = "ปกติ"
                          if (lostQty > 0) {
                            returnCondition = "สูญหาย"
                          } else if (damagedQty > 0) {
                            returnCondition = "ชำรุด"
                          }
                          
                          return {
                            equipmentId: item.equipmentId || item.id,
                            equipmentName: item.name,
                            equipmentCategory: item.equipmentCategory || "asset",
                            quantityBorrowed: item.quantityBorrowed,
                            quantityReturned: totalReturned,
                            returnCondition,
                            returnGoodQty: goodQty,
                            returnDamagedQty: damagedQty,
                            returnLostQty: lostQty,
                            returnNotes: item.notes || "",
                            assetCodeConditions: item.assetCodeConditions || []
                          }
                        }
                      })

                      await logReturnTransaction(
                        borrowId,
                        today,
                        time,
                        "completed", // Overall condition
                        "", // No general damages for individual items
                        user,
                        user.displayName || "User",
                        "", // No general notes
                        returnedItems
                      )

                      // Sync master available counts for returned assets (batch in parallel for speed)
                      const assetItems = returnedItems.filter(item => item.equipmentCategory === "asset")
                      const assetMasterIds = assetItems.map(item => item.equipmentId)
                      if (assetMasterIds.length > 0) {
                        await syncMasterAvailableCountBatch(assetMasterIds)
                      }
                    }

                    setShowConfirmModal(false)
                    setReturnEquipment([])
                    navigate('/home')
                  } catch (error) {
                    console.error("Error saving return:", error)
                    alert("เกิดข้อผิดพลาดในการบันทึกการคืนอุปกรณ์")
                    setIsProcessing(false)
                  }
                }}
                disabled={isProcessing}
                className="
                  flex-1
                  py-2
                  rounded-full
                  bg-orange-500
                  text-white
                  text-sm font-medium
                  hover:bg-orange-600
                  transition
                  disabled:bg-gray-400
                  disabled:cursor-not-allowed
                "
              >
                {isProcessing ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isProcessing}
                className="
                  flex-1
                  py-2
                  rounded-full
                  border border-gray-400
                  text-sm text-gray-600
                  font-medium
                  hover:bg-gray-100
                  transition
                  disabled:opacity-50
                "
              >
                ย้อนกลับ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
