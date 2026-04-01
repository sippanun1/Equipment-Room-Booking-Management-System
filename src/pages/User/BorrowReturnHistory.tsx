import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Header from "../../components/Header"
import { collection, getDocs, query, orderBy, where, limit, startAfter, QueryDocumentSnapshot, DocumentData } from "firebase/firestore"
import { db } from "../../firebase/firebase"
import { useAuth } from "../../hooks/useAuth"
import type { BorrowTransaction } from "../../utils/borrowReturnLogger"

const ITEMS_PER_PAGE = 20  // Load 20 items at a time instead of all

export default function BorrowReturnHistory() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<BorrowTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "scheduled" | "borrowed" | "pending_return" | "returned" | "cancelled">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [detailsModal, setDetailsModal] = useState<BorrowTransaction | null>(null)
  const [showNotifications, setShowNotifications] = useState(true)
  const [pageIndex, setPageIndex] = useState(0)
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    // Prevent scrolling when modal is open
    if (detailsModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [detailsModal])

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        // Build query with pagination: load one extra to know if there are more pages
        let queryConstraints: any[] = [
          where("userId", "==", user.uid),
          orderBy("timestamp", "desc"),
          limit(ITEMS_PER_PAGE + 1)  // Load one extra to detect if more exist
        ]
        
        // For subsequent pages, start after the last visible document
        if (pageIndex > 0 && lastVisible) {
          queryConstraints.push(startAfter(lastVisible))
        }
        
        const borrowHistoryQuery = query(collection(db, "borrowHistory"), ...queryConstraints)
        const snapshot = await getDocs(borrowHistoryQuery)
        const docs = snapshot.docs
        
        // Check if there are more pages
        if (docs.length > ITEMS_PER_PAGE) {
          setHasMore(true)
          docs.pop()  // Remove the extra document
        } else {
          setHasMore(false)
        }
        
        // Save the last visible document for next pagination
        if (docs.length > 0) {
          setLastVisible(docs[docs.length - 1])
        }
        
        const txns = docs.map((doc) => doc.data() as BorrowTransaction)
        setTransactions(txns)
      } catch (error) {
        console.error("Error fetching borrow history:", error)
        // Fallback: filter client-side if index not ready (but with pagination)
        try {
          const fallbackQuery = query(
            collection(db, "borrowHistory"),
            orderBy("timestamp", "desc"),
            limit(ITEMS_PER_PAGE + 1)
          )
          const snapshot = await getDocs(fallbackQuery)
          const allDocs = snapshot.docs
          
          if (allDocs.length > ITEMS_PER_PAGE) {
            setHasMore(true)
            allDocs.pop()
          } else {
            setHasMore(false)
          }
          
          const allTxns = allDocs.map((doc) => doc.data() as BorrowTransaction)
          // Filter by userId or userEmail
          const userTxns = allTxns.filter(
            (txn) => txn.userId === user.uid || txn.userEmail === user.email
          )
          setTransactions(userTxns)
        } catch (fallbackError) {
          console.error("Fallback query also failed:", fallbackError)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [user, pageIndex, lastVisible])

  const filteredTransactions = transactions.filter((txn) => {
    const matchesStatus = filter === "all" || txn.status === filter
    const matchesSearch =
      txn.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.equipmentItems.some((item) =>
        item.equipmentName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    return matchesStatus && matchesSearch
  })

  const cancelledBorrows = transactions.filter(txn => 
    ['cancelled', 'rejected', 'approved'].includes(txn.status) && txn.status !== 'returned'
  )
  
  const getDismissedCancellations = (): Set<string> => {
    const stored = localStorage.getItem('dismissedCancellations')
    return stored ? new Set(JSON.parse(stored)) : new Set()
  }

  const visibleCancellations = cancelledBorrows.filter(b => !getDismissedCancellations().has(b.borrowId))

  const dismissCancellation = (borrowId: string) => {
    const dismissed = getDismissedCancellations()
    dismissed.add(borrowId)
    localStorage.setItem('dismissedCancellations', JSON.stringify(Array.from(dismissed)))
  }

  const getBorrowTypeText = (type: string) => {
    switch (type) {
      case "during-class":
        return "ยืมในคาบเรียน"
      case "teaching":
        return "ยืมใช้สอน"
      case "outside":
        return "ยืมนอกคาบเรียน"
      default:
        return type
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-800"
      case "borrowed":
        return "bg-yellow-100 text-yellow-800"
      case "pending_return":
        return "bg-purple-100 text-purple-800"
      case "returned":
        return "bg-green-100 text-green-800"
      case "cancelled":
        return "bg-red-100 text-red-800"
      case "ปกติ":
        return "bg-green-600 text-white"
      case "ชำรุด":
        return "bg-red-600 text-white"
      case "สูญหาย":
        return "bg-orange-600 text-white"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "scheduled":
        return "รอรับอุปกรณ์"
      case "borrowed":
        return "ยังไม่ได้คืน"
      case "pending_return":
        return "รอการอนุมัติคืน"
      case "returned":
        return "คืนแล้ว"
      case "cancelled":
        return "ยกเลิก"
      default:
        return status
    }
  }

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
      <Header title="ประวัติการยืมและคืน" />

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-90 px-4 flex flex-col items-center pb-6">
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

          {/* Search Bar */}
          <div className="w-full mb-6 relative">
            <input
              type="text"
              placeholder="ค้นหาชื่อ อีเมล หรืออุปกรณ์"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="
                w-full
                h-10
                px-4
                border border-gray-300
                rounded-full
                outline-none
                text-sm
              "
            />
            <button className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600">
              🔍
            </button>
          </div>

          {/* Status Filter */}
          <div className="w-full mb-6 flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setFilter("all")}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition
                ${
                  filter === "all"
                    ? "bg-blue-500 text-white"
                    : "border border-gray-300 text-gray-700 hover:border-blue-500"
                }
              `}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setFilter("scheduled")}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition
                ${
                  filter === "scheduled"
                    ? "bg-blue-500 text-white"
                    : "border border-gray-300 text-gray-700 hover:border-blue-500"
                }
              `}
            >
              รอรับอุปกรณ์
            </button>
            <button
              onClick={() => setFilter("borrowed")}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition
                ${
                  filter === "borrowed"
                    ? "bg-yellow-500 text-white"
                    : "border border-gray-300 text-gray-700 hover:border-yellow-500"
                }
              `}
            >
              ยังไม่ได้คืน
            </button>
            <button
              onClick={() => setFilter("pending_return")}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition
                ${
                  filter === "pending_return"
                    ? "bg-purple-500 text-white"
                    : "border border-gray-300 text-gray-700 hover:border-purple-500"
                }
              `}
            >
              รอการอนุมัติคืน
            </button>
            <button
              onClick={() => setFilter("returned")}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition
                ${
                  filter === "returned"
                    ? "bg-green-500 text-white"
                    : "border border-gray-300 text-gray-700 hover:border-green-500"
                }
              `}
            >
              คืนแล้ว
            </button>
            <button
              onClick={() => setFilter("cancelled")}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition
                ${
                  filter === "cancelled"
                    ? "bg-red-500 text-white"
                    : "border border-gray-300 text-gray-700 hover:border-red-500"
                }
              `}
            >
              ยกเลิก
            </button>
          </div>
          {/* Notification History */}
          {visibleCancellations.length > 0 && (
            <div className="w-full mb-6\">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-full bg-blue-50 border border-blue-200 px-4 py-3 rounded-t-lg hover:bg-blue-100 transition flex items-center justify-between"
              >
                <span className="font-semibold text-blue-900 text-sm">
                  📋 ประวัติการดำเนินการจากแอดมิน ({visibleCancellations.length})
                </span>
                <span className="text-lg">{showNotifications ? '▼' : '▶'}</span>
              </button>
              {showNotifications && (
            <div className="bg-white border border-t-0 border-blue-200 rounded-b-lg overflow-hidden divide-y">
                {visibleCancellations.map((borrow) => {
                  const actionDate = borrow.cancelledAt 
                    ? new Date(borrow.cancelledAt).toLocaleDateString('th-TH', { year: '2-digit', month: '2-digit', day: '2-digit' })
                    : ''
                  const actionTime = borrow.cancelledAt
                    ? new Date(borrow.cancelledAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                    : ''
                  
                  const getActionBadge = (status: string) => {
                    switch(status) {
                      case 'cancelled':
                        return { icon: '🚫', text: 'ยกเลิก', color: 'bg-red-100 text-red-800' }
                      case 'rejected':
                        return { icon: '❌', text: 'ปฏิเสธ', color: 'bg-red-100 text-red-800' }
                      case 'approved':
                        return { icon: '✅', text: 'อนุมัติ', color: 'bg-green-100 text-green-800' }
                      default:
                        return { icon: '📝', text: status, color: 'bg-gray-100 text-gray-800' }
                    }
                  }
                  
                  const action = getActionBadge(borrow.status)
                  
                  return (
                    <div key={borrow.borrowId} className="px-4 py-3 hover:bg-gray-50 transition">
                      <div className="flex gap-3">
                        <div className="shrink-0 pt-1">
                          <span className="text-xl">{action.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${action.color}`}>
                              {action.text}
                            </span>
                            <span className="text-xs text-gray-500">{actionDate} {actionTime}</span>
                          </div>
                          <p className="text-xs text-gray-700 mb-1">
                            {borrow.equipmentItems.map(e => e.equipmentName).join(", ")}
                          </p>
                          {borrow.cancelledBy && (
                            <p className="text-xs text-gray-600">
                              🔹 ดำเนินการโดย: <span className="font-medium">{borrow.cancelledBy}</span>
                            </p>
                          )}
                          {borrow.cancelReason && (
                            <p className="text-xs text-gray-700 mt-1 pl-2 border-l-2 border-yellow-400">
                              💬 {borrow.cancelReason}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => dismissCancellation(borrow.borrowId)}
                          className="text-gray-400 hover:text-gray-600 shrink-0"
                          title="ปิดการแจ้งเตือน"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )}

          {/* Transactions List */}
          {loading ? (
            <div className="w-full text-center text-gray-500 py-8">
              กำลังโหลด...
            </div>
          ) : filteredTransactions.length > 0 ? (
            <div className="w-full space-y-3">
              {filteredTransactions.map((txn) => (
                <div
                  key={txn.borrowId}
                  onClick={() => setDetailsModal(txn)}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side - Basic info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="font-bold text-gray-900 text-base">
                          {txn.equipmentItems.map((item) => item.equipmentName).join(", ")}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(txn.status)}`}>
                          {getStatusText(txn.status)}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-2">
                        {txn.equipmentItems.map((item, idx) => (
                          <div key={idx} className="mb-1">
                            <div>
                              {item.equipmentName} (
                              {item.quantityReturned !== undefined && item.quantityReturned !== item.quantityBorrowed 
                                ? `ยืม ${item.quantityBorrowed} / คืน ${item.quantityReturned}` 
                                : `${item.quantityBorrowed}`
                              } ชิ้น)
                            </div>
                            {item.assetCodes && item.assetCodes.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-1">
                                {item.assetCodes.map((code, codeIdx) => (
                                  <span
                                    key={codeIdx}
                                    className="inline-block bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <div>
                          <span className="font-medium">ยืม:</span> {txn.borrowDate} {txn.borrowTime}
                        </div>
                        <div>
                          <span className="font-medium">คืน:</span> {txn.actualReturnDate || txn.expectedReturnDate}
                        </div>
                      </div>
                    </div>
                    
                    {/* Right side - Borrow type */}
                    <div className="text-right">
                      <span className="px-2 py-1 rounded bg-orange-100 text-orange-800 font-medium text-xs">
                        {getBorrowTypeText(txn.borrowType)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full text-center text-gray-500 py-8">
              {searchTerm || filter !== "all"
                ? "ไม่พบข้อมูลการยืมและคืน"
                : "ยังไม่มีข้อมูลการยืมและคืน"}
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && transactions.length > 0 && (
            <div className="w-full flex items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setPageIndex(Math.max(0, pageIndex - 1))
                  setLastVisible(null)
                }}
                disabled={pageIndex === 0}
                className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ← ก่อนหน้า
              </button>
              <span className="text-sm text-gray-600">
                หน้า {pageIndex + 1}
              </span>
              <button
                onClick={() => {
                  setPageIndex(pageIndex + 1)
                }}
                disabled={!hasMore}
                className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ถัดไป →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {detailsModal && (
        <div className="fixed inset-0 backdrop-blur-xs bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mt-10">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-gray-900">รายละเอียดการยืมอุปกรณ์</h2>
              <button
                onClick={() => setDetailsModal(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Main content */}
            <div className="space-y-6">
              {/* Equipment info */}
              <div className="border-b pb-4">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">อุปกรณ์ที่ยืม</h3>
                <div className="space-y-2 text-sm">
                  {detailsModal.equipmentItems.map((item, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.equipmentName}</p>
                          <div className="flex gap-4 mt-1 flex-wrap">
                            {!item.quantityReturned ? (
                              <p className="text-xs text-gray-600">
                                <span className="font-semibold">ยืม:</span> {item.quantityBorrowed} ชิ้น
                              </p>
                            ) : (
                              <>
                                <p className="text-xs text-gray-600">
                                  <span className="font-semibold">ยืม:</span> {item.quantityBorrowed} ชิ้น
                                </p>
                                <p className="text-xs font-semibold text-blue-600">
                                  <span>คืน:</span> {item.quantityReturned} ชิ้น
                                </p>
                              </>
                            )}
                          </div>
                          {/* Asset Codes */}
                          {item.assetCodes && item.assetCodes.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300">
                              <p className="text-xs font-semibold text-gray-700 mb-1">รหัสอุปกรณ์:</p>
                              <div className="flex flex-wrap gap-1">
                                {item.assetCodes.map((code, codeIdx) => (
                                  <span
                                    key={codeIdx}
                                    className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium"
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Show return condition if available */}
                      {item.returnCondition && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2">สภาพเมื่อคืน:</p>
                          <div className="flex flex-col gap-2">
                            <span className={`${getStatusColor(item.returnCondition)} text-sm font-semibold px-3 py-2 rounded-lg inline-block w-fit`}>
                              {item.returnCondition}
                            </span>
                            {item.returnNotes && (
                              <div className={`rounded-lg p-2 text-xs ${
                                item.returnCondition === 'สูญหาย' 
                                  ? 'bg-yellow-50 border border-yellow-200' 
                                  : 'bg-orange-50 border border-orange-200'
                              }`}>
                                <p className="text-gray-700">
                                  <span className="font-semibold">หมายเหตุ:</span> {item.returnNotes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Show consumption status for consumables */}
                      {item.consumptionStatus && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2">สถานะการใช้:</p>
                          <div className="flex flex-col gap-2">
                            <span className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-lg inline-block w-fit">
                              {item.consumptionStatus}
                            </span>
                            {item.returnNotes && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs">
                                <p className="text-gray-700">
                                  <span className="font-semibold">หมายเหตุ:</span> {item.returnNotes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dates and status */}
              <div className="border-b pb-4">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">วันที่และสถานะ</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">วันที่ยืม:</span>
                    <p className="font-medium text-gray-900">{detailsModal.borrowDate} {detailsModal.borrowTime}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">กำหนดคืน:</span>
                    <p className="font-medium text-gray-900">{detailsModal.expectedReturnDate} {detailsModal.expectedReturnTime || '-'}</p>
                  </div>
                  {detailsModal.actualReturnDate && (
                    <div>
                      <span className="text-gray-600">วันที่คืนจริง:</span>
                      <p className="font-medium text-green-600">{detailsModal.actualReturnDate} {detailsModal.returnTime || '-'}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600">สถานะ:</span>
                    <p className={`font-medium text-base ${detailsModal.status === 'returned' ? 'text-green-600' : detailsModal.status === 'cancelled' ? 'text-red-600' : detailsModal.status === 'borrowed' ? 'text-yellow-600' : detailsModal.status === 'pending_return' ? 'text-purple-600' : 'text-blue-600'}`}>
                      {getStatusText(detailsModal.status)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Borrow info */}
              <div className="border-b pb-4">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">ข้อมูลการยืม</h3>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-gray-600">ประเภทการยืม:</span>
                    <p className="font-medium text-gray-900">{getBorrowTypeText(detailsModal.borrowType)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">สภาพอุปกรณ์ก่อนยืม:</span>
                    <p className="font-medium text-gray-900">{detailsModal.conditionBeforeBorrow || '-'}</p>
                  </div>
                  {detailsModal.conditionOnReturn && (
                    <div>
                      <span className="text-gray-600">สภาพอุปกรณ์เมื่อคืน:</span>
                      <p className="font-medium text-gray-900">{detailsModal.conditionOnReturn}</p>
                    </div>
                  )}
                  {detailsModal.damagesAndIssues && (
                    <div>
                      <span className="text-red-600">ความเสียหายและปัญหา:</span>
                      <p className="font-medium text-red-600">{detailsModal.damagesAndIssues}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acknowledgement and return info */}
              {(detailsModal.acknowledgedBy || detailsModal.returnedBy) && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3 text-lg">ข้อมูลการรับทราบและการคืน</h3>
                  <div className="text-sm space-y-2">
                    {detailsModal.acknowledgedBy && (
                      <div>
                        <span className="text-gray-600">รับทราบโดย:</span>
                        <p className="font-medium text-gray-900">{detailsModal.acknowledgedBy}</p>
                      </div>
                    )}
                    {detailsModal.returnedBy && (
                      <div>
                        <span className="text-gray-600">คืนโดย:</span>
                        <p className="font-medium text-gray-900">{detailsModal.returnedBy}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Close button */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDetailsModal(null)}
                className="flex-1 px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
