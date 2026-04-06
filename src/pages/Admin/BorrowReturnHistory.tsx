import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Header from "../../components/Header"
import SendEmailModal from "../../components/SendEmailModal"
import { collection, getDocs, query, orderBy, deleteDoc, doc } from "firebase/firestore"
import { db } from "../../firebase/firebase"
import { useAuth } from "../../hooks/useAuth"
import { logAdminAction } from "../../utils/adminLogger"
import type { BorrowTransaction } from "../../utils/borrowReturnLogger"
import { approveReturnTransaction, rejectReturnTransaction, acknowledgeAdminReceivedBorrow } from "../../utils/borrowReturnLogger"
import { sendBorrowAcknowledgmentEmail } from "../../utils/emailService"

export default function BorrowReturnHistory() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<BorrowTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "borrowed" | "pending_return" | "returned" | "awaiting_acknowledgment">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [borrowTypeFilter, setBorrowTypeFilter] = useState<"all" | "during-class" | "teaching" | "outside">("all")
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all")
  const [customStartDate, setCustomStartDate] = useState("")
  const [customEndDate, setCustomEndDate] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [detailsModal, setDetailsModal] = useState<BorrowTransaction | null>(null)
  const [selectedBorrowId, setSelectedBorrowId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailBorrowData, setEmailBorrowData] = useState<BorrowTransaction | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true)
        const borrowHistoryQuery = query(
          collection(db, "borrowHistory"),
          orderBy("timestamp", "desc")
        )
        const snapshot = await getDocs(borrowHistoryQuery)
        const txns = snapshot.docs.map((doc) => doc.data() as BorrowTransaction)
        setTransactions(txns)
      } catch (error) {
        console.error("Error fetching borrow history:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [])

  // Fetch equipment availability when details modal is opened for pending returns
  useEffect(() => {
    const fetchEquipmentAvailability = async () => {
      if (!detailsModal || detailsModal.status !== "pending_return") {
        return
      }

      try {
        // Equipment availability data could be used here in the future if needed
        // Currently not displayed in the UI
      } catch (error) {
        console.error("Error fetching equipment availability:", error)
      }
    }

    fetchEquipmentAvailability()
  }, [detailsModal])

  // Date filter logic
  const isWithinDateRange = (borrowDate: string) => {
    if (dateFilter === 'all') return true
    
    // Parse borrowDate (format: DD/MM/YYYY or YYYY-MM-DD)
    let txnDate: Date
    if (borrowDate.includes('/')) {
      const [day, month, year] = borrowDate.split('/')
      txnDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    } else {
      txnDate = new Date(borrowDate)
    }
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    switch (dateFilter) {
      case 'today': {
        const todayEnd = new Date(today)
        todayEnd.setHours(23, 59, 59, 999)
        return txnDate >= today && txnDate <= todayEnd
      }
      case 'week': {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return txnDate >= weekAgo
      }
      case 'month': {
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        return txnDate >= monthAgo
      }
      case 'custom': {
        if (!customStartDate && !customEndDate) return true
        const start = customStartDate ? new Date(customStartDate) : new Date('1970-01-01')
        const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date()
        return txnDate >= start && txnDate <= end
      }
      default:
        return true
    }
  }

  // Check if any filter is active
  const hasActiveFilters = filter !== 'all' || borrowTypeFilter !== 'all' || dateFilter !== 'all' || searchTerm !== ''

  const clearFilters = () => {
    setFilter('all')
    setBorrowTypeFilter('all')
    setDateFilter('all')
    setSearchTerm('')
    setCustomStartDate('')
    setCustomEndDate('')
  }

  const filteredTransactions = transactions.filter((txn) => {
    const matchesStatus = filter === "all" 
      ? true 
      : filter === "awaiting_acknowledgment" 
        ? txn.status === "borrowed" && !txn.acknowledgedAt
        : txn.status === filter
    const matchesBorrowType = borrowTypeFilter === "all" || txn.borrowType === borrowTypeFilter
    const matchesSearch =
      txn.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.equipmentItems.some((item) =>
        item.equipmentName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    const matchesDate = isWithinDateRange(txn.borrowDate)
    return matchesStatus && matchesBorrowType && matchesSearch && matchesDate
  })

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

  // Delete functions
  const toggleSelectId = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTransactions.map(t => t.borrowId)))
    }
  }

  const handleBulkDelete = async () => {
    try {
      let successCount = 0
      const deletedItems: BorrowTransaction[] = []
      
      for (const id of selectedIds) {
        try {
          // Find the transaction to log details
          const txn = transactions.find(t => t.borrowId === id)
          
          await deleteDoc(doc(db, "borrowHistory", id))
          successCount++
          
          if (txn) {
            deletedItems.push(txn)
          }
        } catch (error) {
          console.error(`Error deleting transaction ${id}:`, error)
        }
      }
      
      // Log admin action for each deleted transaction
      if (user && deletedItems.length > 0) {
        for (const txn of deletedItems) {
          const equipmentNames = txn.equipmentItems.map(item => `${item.equipmentName} (${item.quantityBorrowed})`).join(", ")
          
          await logAdminAction({
            user,
            action: 'delete',
            type: 'equipment',
            itemName: `${txn.userName} - ${equipmentNames}`,
            details: `ลบประวัติการยืมอุปกรณ์: ${equipmentNames} | ผู้ยืม: ${txn.userName} | สถานะ: ${txn.status}`
          })
        }
      }
      
      // Update state
      setTransactions(prev => prev.filter(t => !selectedIds.has(t.borrowId)))
      setSelectedIds(new Set())
      setShowBulkDeleteConfirm(false)
      
      setDeleteMessage({
        type: 'success',
        text: `ลบประวัติ ${successCount} รายการสำเร็จ`
      })
      
      setTimeout(() => setDeleteMessage(null), 3000)
    } catch (error) {
      console.error("Error deleting transactions:", error)
      setDeleteMessage({
        type: 'error',
        text: 'เกิดข้อผิดพลาดในการลบข้อมูล'
      })
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
      <Header title="ประวัติการยืมและคืน" />

      {/* Success/Error Message */}
      {deleteMessage && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg text-white font-medium shadow-lg ${
          deleteMessage.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {deleteMessage.text}
        </div>
      )}

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-[360px] px-4 flex flex-col items-center pb-6">
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

          {/* Collapsible Filter Section */}
          <div className="w-full bg-gray-50 border border-gray-200 rounded-lg mb-6 overflow-hidden">
            {/* Filter Header - Always Visible */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">🔧 ตัวกรอง</span>
                {hasActiveFilters && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                    กำลังใช้งาน
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  พบ <span className="font-semibold text-blue-600">{filteredTransactions.length}</span> รายการ
                </span>
                <span className={`text-gray-400 transition-transform ${showFilters ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </button>
            
            {/* Collapsible Filter Content */}
            {showFilters && (
              <div className="px-4 pb-4 border-t border-gray-200">
                {/* Status Filter */}
                <div className="mt-4 mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">สถานะ:</p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: 'all', label: 'ทั้งหมด', color: 'gray' },
                      { key: 'awaiting_acknowledgment', label: 'รอการรับทราบ', color: 'blue' },
                      { key: 'borrowed', label: 'ยังไม่ได้คืน', color: 'yellow' },
                      { key: 'pending_return', label: 'รอการอนุมัติคืน', color: 'purple' },
                      { key: 'returned', label: 'คืนแล้ว', color: 'green' }
                    ].map((status) => (
                      <button
                        key={status.key}
                        onClick={() => setFilter(status.key as typeof filter)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                          filter === status.key
                            ? status.color === 'gray' ? "bg-gray-700 text-white"
                            : status.color === 'blue' ? "bg-blue-500 text-white"
                            : status.color === 'yellow' ? "bg-yellow-500 text-white"
                            : status.color === 'purple' ? "bg-purple-500 text-white"
                            : status.color === 'green' ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                            : "border border-gray-300 text-gray-700 hover:border-gray-500"
                        }`}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Borrow Type Filter */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">ประเภทการยืม:</p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: 'all', label: 'ทั้งหมด' },
                      { key: 'during-class', label: 'ยืมในคาบเรียน' },
                      { key: 'teaching', label: 'ยืมใช้สอน' },
                      { key: 'outside', label: 'ยืมนอกคาบเรียน' }
                    ].map((type) => (
                      <button
                        key={type.key}
                        onClick={() => setBorrowTypeFilter(type.key as typeof borrowTypeFilter)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                          borrowTypeFilter === type.key
                            ? "bg-orange-500 text-white"
                            : "border border-gray-300 text-gray-700 hover:border-orange-500"
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Filter */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">ช่วงเวลา:</p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: 'all', label: 'ทั้งหมด' },
                      { key: 'today', label: 'วันนี้' },
                      { key: 'week', label: '7 วันที่ผ่านมา' },
                      { key: 'month', label: '30 วันที่ผ่านมา' },
                      { key: 'custom', label: 'กำหนดเอง' }
                    ].map((date) => (
                      <button
                        key={date.key}
                        onClick={() => setDateFilter(date.key as typeof dateFilter)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                          dateFilter === date.key
                            ? "bg-purple-500 text-white"
                            : "border border-gray-300 text-gray-700 hover:border-purple-500"
                        }`}
                      >
                        {date.label}
                      </button>
                    ))}
                  </div>
                  
                  {/* Custom Date Range */}
                  {dateFilter === 'custom' && (
                    <div className="mt-3 flex gap-3 items-center flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">จาก:</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:border-purple-500 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">ถึง:</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:border-purple-500 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Clear Filters Button */}
                <div className="pt-3 border-t border-gray-200">
                  <button
                    onClick={clearFilters}
                    className="text-xs text-gray-500 hover:text-red-500 transition flex items-center gap-1"
                  >
                    ✕ ล้างตัวกรองทั้งหมด
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transactions List */}
          {loading ? (
            <div className="w-full text-center text-gray-500 py-8">
              กำลังโหลด...
            </div>
          ) : filteredTransactions.length > 0 ? (
            <>
              <div className="w-full mb-4 flex gap-2 items-center justify-end">
                <button
                  onClick={toggleSelectAll}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0
                      ? 'bg-blue-500 text-white'
                      : 'border border-gray-300 text-gray-700 hover:border-blue-500'
                  }`}
                >
                  {selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="px-3 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition"
                  >
                    ลบ ({selectedIds.size})
                  </button>
                )}
              </div>
              
              <div className="w-full space-y-3">
                
                {filteredTransactions.map((txn) => (
                  <div
                    key={txn.borrowId}
                    className={`bg-white border rounded-lg p-4 hover:shadow-md cursor-pointer transition ${
                      selectedIds.has(txn.borrowId) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(txn.borrowId)}
                        onChange={() => toggleSelectId(txn.borrowId)}
                        className="w-4 h-4 mt-1 cursor-pointer"
                      />
                      
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailsModal(txn)}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="font-bold text-gray-900 text-base">
                            {txn.userName}
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(txn.status)}`}>
                            {getStatusText(txn.status)}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-2">
                          {txn.equipmentItems.map((item, idx) => (
                            <div key={idx}>
                              {item.equipmentName} (
                              {item.quantityReturned !== undefined && item.quantityReturned !== item.quantityBorrowed 
                                ? `ยืม ${item.quantityBorrowed} / คืน ${item.quantityReturned}` 
                                : `${item.quantityBorrowed}`
                              } ชิ้น)
                              {item.assetCodes && item.assetCodes.length > 0 && (
                                <div className="text-xs text-blue-600 mt-0.5">
                                  รหัส: {item.assetCodes.join(", ")}
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
                      
                      {/* Right side - Status badge or action indicator */}
                      <div className="text-right text-xs flex-shrink-0">
                        {txn.status === "borrowed" && !txn.acknowledgedAt && (
                          <div className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
                            รอการรับทราบ
                          </div>
                        )}
                        {txn.acknowledgedBy && (
                          <div className="text-gray-500 text-[11px] mt-1">
                            รับทราบ: {txn.acknowledgedBy}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="w-full text-center text-gray-500 py-8">
              {searchTerm || filter !== "all"
                ? "ไม่พบข้อมูลการยืมและคืน"
                : "ยังไม่มีข้อมูลการยืมและคืน"}
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
                onClick={() => {
                  setDetailsModal(null)
                  setSelectedBorrowId(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Main content */}
            <div className="space-y-6">
              {/* Borrower info */}
              <div className="border-b pb-4">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">ข้อมูลผู้ยืม</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">ชื่อ:</span>
                    <p className="font-medium text-gray-900">{detailsModal.userName}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">อีเมล:</span>
                    <p className="font-medium text-gray-900">{detailsModal.userEmail}</p>
                  </div>
                  {detailsModal.userIdNumber && (
                    <div>
                      <span className="text-gray-600">รหัสประจำตัว:</span>
                      <p className="font-medium text-gray-900">{detailsModal.userIdNumber}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Equipment info */}
              <div className="border-b pb-4">
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">อุปกรณ์ที่ยืม</h3>
                <div className="space-y-2 text-sm">
                  {detailsModal.equipmentItems.map((item, idx) => {
                    return (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{item.equipmentName}</p>
                            
                            {/* Asset codes section */}
                            {item.assetCodes && item.assetCodes.length > 0 && (
                              <div className="mt-2 mb-2">
                                <p className="text-xs font-semibold text-gray-600 mb-1">รหัสอุปกรณ์:</p>
                                <div className="flex flex-wrap gap-1">
                                  {item.assetCodes.map((code, codeIdx) => (
                                    <span
                                      key={codeIdx}
                                      className="px-2 py-1 rounded bg-blue-50 border border-blue-200 text-xs text-blue-800 font-medium"
                                    >
                                      {code}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div className="flex gap-4 mt-1 flex-wrap">
                              {detailsModal.status === "borrowed" && (
                                <p className="text-xs text-gray-600">
                                  <span className="font-semibold">ยืม:</span> {item.quantityBorrowed} ชิ้น
                                </p>
                              )}
                              {(detailsModal.status === "pending_return" || detailsModal.status === "returned") && (
                                <>
                                  <p className="text-xs text-gray-600">
                                    <span className="font-semibold">ยืม:</span> {item.quantityBorrowed} ชิ้น
                                  </p>
                                  <p className="text-xs font-semibold text-blue-600">
                                    <span>คืน:</span> {item.quantityReturned || 0} ชิ้น
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      {/* Show return condition if available */}
                      {item.returnCondition && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2">สภาพเมื่อคืน:</p>
                          <div className="flex flex-col gap-2">
                            <span className={`${getStatusColor(item.returnCondition)} text-white text-sm font-semibold px-3 py-2 rounded-lg inline-block w-fit`}>
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
                      
                      {/* Asset code conditions with notes */}
                      {item.assetCodeConditions && item.assetCodeConditions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2">รหัสอุปกรณ์และสถานะ:</p>
                          <div className="space-y-1.5">
                            {item.assetCodeConditions.map((codeItem, codeIdx) => (
                              <div key={codeIdx} className="bg-gray-50 border border-gray-200 rounded p-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-800">{codeItem.code}</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                    codeItem.condition === "ปกติ" ? "bg-green-100 text-green-800" :
                                    codeItem.condition === "ชำรุด" ? "bg-orange-100 text-orange-800" :
                                    "bg-red-100 text-red-800"
                                  }`}>
                                    {codeItem.condition}
                                  </span>
                                </div>
                                {codeItem.notes && (
                                  <div className="text-xs text-gray-700 mt-1">
                                    <span className="font-semibold">หมายเหตุ:</span> {codeItem.notes}
                                  </div>
                                )}
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
                    <p className={`font-medium text-base ${getStatusColor(detailsModal.status).split(' ').join(' ')}`}>
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
                      <span className="text-gray-600 text-red-600">ความเสียหายและปัญหา:</span>
                      <p className="font-medium text-red-600">{detailsModal.damagesAndIssues}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Admin actions for borrowed items waiting acknowledgment */}
              {detailsModal.status === "borrowed" && !detailsModal.acknowledgedAt && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3 text-lg">ดำเนินการ</h3>
                  <div className="space-y-2">
                    <button
                      onClick={async () => {
                        if (!user || processingId) return
                        setProcessingId(detailsModal.borrowId)
                        try {
                          await acknowledgeAdminReceivedBorrow(detailsModal.borrowId, user, user.displayName || "Admin")
                          
                          // Send email to borrower
                          const equipmentNames = detailsModal.equipmentItems.map(item => `${item.equipmentName} (${item.quantityBorrowed})`).join(", ")
                          try {
                            const equipmentWithCodes = detailsModal.equipmentItems.map(item => ({
                              name: item.equipmentName,
                              codes: item.assetCodes && item.assetCodes.length > 0 ? item.assetCodes : undefined,
                              quantity: item.quantityBorrowed
                            }))
                            
                            await sendBorrowAcknowledgmentEmail({
                              userEmail: detailsModal.userEmail,
                              userName: detailsModal.userName,
                              equipmentNames: detailsModal.equipmentItems.map(item => `${item.equipmentName} (${item.quantityBorrowed} ชิ้น)`),
                              borrowDate: detailsModal.borrowDate,
                              borrowTime: detailsModal.borrowTime,
                              expectedReturnDate: detailsModal.expectedReturnDate,
                              expectedReturnTime: detailsModal.expectedReturnTime || '',
                              borrowType: getBorrowTypeText(detailsModal.borrowType),
                              equipmentWithCodes
                            })
                          } catch (emailError) {
                            console.error("Error sending email:", emailError)
                            // Continue with acknowledgment even if email fails
                          }

                          await logAdminAction({
                            user,
                            action: 'acknowledge',
                            type: 'equipment',
                            itemName: `การยืมของ ${detailsModal.userName}`,
                            details: `รับทราบการยืม: ${equipmentNames}`
                          })
                          setTransactions(prev => prev.map(t => 
                            t.borrowId === detailsModal.borrowId 
                              ? { ...t, acknowledgedBy: user.displayName || "Admin", acknowledgedAt: Date.now() }
                              : t
                          ))
                          setDetailsModal(null)
                        } catch (error) {
                          console.error("Error acknowledging:", error)
                          alert("เกิดข้อผิดพลาด")
                        } finally {
                          setProcessingId(null)
                        }
                      }}
                      disabled={processingId === detailsModal.borrowId}
                      className="w-full px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition disabled:bg-gray-300"
                    >
                      {processingId === detailsModal.borrowId ? "ดำเนินการ..." : "✓ รับทราบ"}
                    </button>
                  </div>
                </div>
              )}

              {/* Admin actions for pending returns */}
              {detailsModal.status === "pending_return" && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3 text-lg">การอนุมัติการคืน</h3>
                  {!showRejectModal ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={async () => {
                          if (!user || processingId) return
                          setProcessingId(detailsModal.borrowId)
                          try {
                            await approveReturnTransaction(detailsModal.borrowId, user, user.displayName || "Admin")
                            const equipmentNames = detailsModal.equipmentItems.map(item => `${item.equipmentName} (${item.quantityBorrowed})`).join(", ")
                            await logAdminAction({
                              user,
                              action: 'confirm',
                              type: 'equipment',
                              itemName: `การคืนของ ${detailsModal.userName}`,
                              details: `อนุมัติการคืนอุปกรณ์: ${equipmentNames}`
                            })
                            setTransactions(prev => prev.map(t => 
                              t.borrowId === detailsModal.borrowId 
                                ? { 
                                    ...t, 
                                    status: "returned" as const,
                                    approvedBy: user.displayName || "Admin",
                                    approvedByEmail: user.email || "",
                                    approvedAt: Date.now()
                                  }
                                : t
                            ))
                            setDetailsModal(null)
                          } catch (error) {
                            console.error("Error approving return:", error)
                            alert("เกิดข้อผิดพลาด")
                          } finally {
                            setProcessingId(null)
                          }
                        }}
                        disabled={processingId === detailsModal.borrowId}
                        className="px-4 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition disabled:bg-gray-300"
                      >
                        {processingId === detailsModal.borrowId ? "ดำเนินการ..." : "✓ อนุมัติการคืน"}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedBorrowId(detailsModal.borrowId)
                          setRejectionReason("")
                          setShowRejectModal(true)
                        }}
                        disabled={processingId === detailsModal.borrowId}
                        className="px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition disabled:bg-gray-300"
                      >
                        ✗ ปฏิเสธการคืน
                      </button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 mb-3">กรุณาระบุเหตุผลในการปฏิเสธการคืน</p>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="ระบุเหตุผลที่นี่..."
                        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm mb-3"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowRejectModal(false)
                            setRejectionReason("")
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition"
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={async () => {
                            if (!rejectionReason.trim()) {
                              alert("ต้องระบุเหตุผลในการปฏิเสธ!")
                              return
                            }
                            
                            if (!user || !selectedBorrowId) return
                            setProcessingId(selectedBorrowId)
                            
                            try {
                              await rejectReturnTransaction(selectedBorrowId, rejectionReason)
                              const equipmentNames = detailsModal.equipmentItems.map(item => `${item.equipmentName} (${item.quantityBorrowed})`).join(", ")
                              await logAdminAction({
                                user,
                                action: 'cancel',
                                type: 'equipment',
                                itemName: `การคืนของ ${detailsModal.userName}`,
                                details: `ปฏิเสธการคืนอุปกรณ์: ${equipmentNames} | เหตุผล: ${rejectionReason}`
                              })
                              setTransactions(prev => prev.map(t => 
                                t.borrowId === selectedBorrowId 
                                  ? { ...t, status: "borrowed" as const }
                                  : t
                              ))
                              setShowRejectModal(false)
                              setRejectionReason("")
                              setSelectedBorrowId(null)
                              setDetailsModal(null)
                            } catch (error) {
                              console.error("Error rejecting return:", error)
                              alert("เกิดข้อผิดพลาด")
                            } finally {
                              setProcessingId(null)
                            }
                          }}
                          disabled={processingId === selectedBorrowId || !rejectionReason.trim()}
                          className="flex-1 px-3 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition disabled:bg-gray-300"
                        >
                          {processingId === selectedBorrowId ? "ดำเนินการ..." : "ปฏิเสธ"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      <SendEmailModal
        isOpen={showEmailModal}
        borrowData={emailBorrowData}
        onClose={() => {
          setShowEmailModal(false)
          setEmailBorrowData(null)
        }}
      />

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 backdrop-blur-xs bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการลบ</h3>
            <p className="text-gray-700 mb-4">
              คุณแน่ใจหรือไม่ว่าต้องการลบประวัติ {selectedIds.size} รายการ?
            </p>
            <p className="text-sm text-gray-600 mb-6">
              การกระทำนี้ไม่สามารถยกเลิกได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex-1 px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition"
              >
                ลบ {selectedIds.size} รายการ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
