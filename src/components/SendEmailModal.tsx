import { useState } from 'react'
import type { BorrowTransaction } from '../utils/borrowReturnLogger'
import { sendBorrowAcknowledgmentEmail } from '../utils/emailService'
import { getBorrowTypeText } from '../utils/borrowHelper'

interface SendEmailModalProps {
  isOpen: boolean
  borrowData: BorrowTransaction | null
  onClose: () => void
}

export default function SendEmailModal({ isOpen, borrowData, onClose }: SendEmailModalProps) {
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState<'preview' | 'sending' | 'success' | 'error'>('preview')
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen || !borrowData) {
    return null
  }

  const handleSendEmail = async () => {
    setIsSending(true)
    setStatus('sending')
    
    try {
      const equipmentNames = borrowData.equipmentItems.map(item => `${item.equipmentName} (${item.quantityBorrowed} ชิ้น)`)
      
      // Build equipment with codes for assets
      const equipmentWithCodes = borrowData.equipmentItems.map(item => ({
        name: item.equipmentName,
        codes: item.assetCodes && item.assetCodes.length > 0 ? item.assetCodes : undefined,
        quantity: item.quantityBorrowed
      }))
      
      const result = await sendBorrowAcknowledgmentEmail({
        userEmail: borrowData.userEmail,
        userName: borrowData.userName,
        equipmentNames,
        borrowDate: borrowData.borrowDate,
        borrowTime: borrowData.borrowTime,
        expectedReturnDate: borrowData.expectedReturnDate,
        expectedReturnTime: borrowData.expectedReturnTime || '',
        borrowType: getBorrowTypeText(borrowData.borrowType),
        equipmentWithCodes
      })

      if (result.success) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMessage(result.message)
      }
    } catch (error) {
      setStatus('error')
      setErrorMessage('ขออภัย เกิดข้อผิดพลาดในการส่งอีเมล')
      console.error(error)
    } finally {
      setIsSending(false)
    }
  }

  const handleClose = () => {
    setStatus('preview')
    setErrorMessage('')
    onClose()
  }

  return (
    <div className="fixed inset-0 backdrop-blur-xs bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        {status === 'preview' && (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-4">📧 ส่งอีเมลยืนยันการรับของ</h3>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-600">ผู้ยืม</p>
                <p className="text-sm font-medium text-gray-900">{borrowData.userName}</p>
                <p className="text-xs text-gray-500">{borrowData.userEmail}</p>
              </div>
              
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">อุปกรณ์</p>
                <div className="space-y-1">
                  {borrowData.equipmentItems.map((item, idx) => (
                    <div key={idx} className="text-sm text-gray-700">
                      • {item.equipmentName} <span className="text-gray-500">({item.quantityBorrowed} ชิ้น)</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-gray-600">วันยืม</p>
                    <p className="text-gray-900 font-medium">{borrowData.borrowDate}</p>
                    <p className="text-gray-500">{borrowData.borrowTime}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-600">กำหนดคืน</p>
                    <p className="text-gray-900 font-medium">{borrowData.expectedReturnDate}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-600 mb-1">ประเภท</p>
                <p className="text-sm text-gray-900">{getBorrowTypeText(borrowData.borrowType)}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-4">
              อีเมลยืนยันจะถูกส่งไปยัง <span className="font-semibold">{borrowData.userEmail}</span> เพื่อแจ้งให้ผู้ยืมทราบว่าคณะได้รับเรื่องการยืมของพวกเขาแล้ว
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSendEmail}
                disabled={isSending}
                className="flex-1 px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition disabled:bg-gray-300"
              >
                {isSending ? 'กำลังส่ง...' : '✓ ส่งอีเมล'}
              </button>
            </div>
          </>
        )}

        {status === 'sending' && (
          <div className="text-center py-6">
            <div className="inline-block">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-3"></div>
            </div>
            <p className="text-gray-700 font-medium">กำลังส่งอีเมล...</p>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✓</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ส่งอีเมลสำเร็จ</h3>
              <p className="text-sm text-gray-600">
                อีเมลยืนยันการรับการยืมของอุปกรณ์ได้ถูกส่งไปยัง {borrowData.userName} แล้ว
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition"
            >
              ปิด
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✕</div>
              <h3 className="text-lg font-bold text-red-600 mb-2">เกิดข้อผิดพลาด</h3>
              <p className="text-sm text-gray-600 mb-3">
                {errorMessage || 'ขออภัย ไม่สามารถส่งอีเมลได้ในขณะนี้'}
              </p>
              <p className="text-xs text-gray-500">
                โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองอีกครั้ง
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStatus('preview')
                  setErrorMessage('')
                }}
                className="flex-1 px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition"
              >
                ลองอีกครั้ง
              </button>
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                ปิด
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
