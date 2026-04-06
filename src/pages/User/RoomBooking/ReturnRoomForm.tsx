import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Header from "../../../components/Header"
import type { ReturnBookingData } from "../../../App"

interface ReturnRoomFormProps {
  booking: ReturnBookingData
  onConfirmReturn: (returnData: {
    bookingId: string
    roomCondition: string
    equipmentCondition: string
    furniture: string[]
    notes: string
    pictures: string[]
  }) => void
}

export default function ReturnRoomForm({ booking, onConfirmReturn }: ReturnRoomFormProps) {
  const navigate = useNavigate()
  const [roomCondition, setRoomCondition] = useState("")
  const [equipmentCondition, setEquipmentCondition] = useState("")
  const [pictures, setPictures] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [showApprovalModal, setShowApprovalModal] = useState(false)

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = (event) => {
          if (event.target?.result) {
            setPictures([...pictures, event.target.result as string])
          }
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const removePicture = (index: number) => {
    setPictures(pictures.filter((_, i) => i !== index))
  }

  const handleConfirmReturn = () => {
    if (!roomCondition) {
      alert("กรุณาเลือกสภาพห้อง")
      return
    }
    if (!equipmentCondition) {
      alert("กรุณาเลือกสภาพอุปกรณ์")
      return
    }
    onConfirmReturn({
      bookingId: booking.id,
      roomCondition,
      equipmentCondition,
      furniture: [],
      notes,
      pictures
    })
    setShowApprovalModal(true)
  }

  const handleApprovalModalClose = () => {
    setShowApprovalModal(false)
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/home')
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
      <Header title="ทำการคืนห้อง" />

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-[360px] px-4 flex flex-col items-center">
          {/* Return Info Card */}
          <div className="w-full border-2 rounded-lg p-4 mb-6" style={{ borderColor: "#FF7F50" }}>
            {/* Section Title */}
            <p className="font-semibold text-sm mb-3" style={{ color: "#595959" }}>
              คืนห้อง
            </p>

            {/* Booking Information */}
            <div className="mb-4">
              <p className="text-xs font-medium mb-2" style={{ color: "#595959" }}>
                ข้อมูลห้อง
              </p>
              <div className="flex gap-3 mb-3">
                <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-gray-200 flex items-center justify-center text-2xl overflow-hidden">
                  {booking.image ? (
                    <img src={booking.image} alt="room" className="w-full h-full object-cover" />
                  ) : (
                    "📸"
                  )}
                </div>
                <div className="flex-1 text-xs" style={{ color: "#595959" }}>
                  <p className="font-medium">{booking.room}</p>
                  <p className="mt-1">{booking.time}</p>
                  <p className="mt-1">ผู้จอง: {booking.name}</p>
                  <p className="mt-1">{booking.bookingCode}</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mb-4">
              {/* Room Condition Section */}
              <p className="text-xs font-medium mb-3" style={{ color: "#595959" }}>
                ข้อมูลคืนห้อง
              </p>

              {/* Room Condition */}
              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: "#595959" }}>
                  สภาพห้อง
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="roomCondition"
                      value="normal"
                      checked={roomCondition === "normal"}
                      onChange={(e) => setRoomCondition(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="text-xs" style={{ color: "#595959" }}>
                      ปกติ
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="roomCondition"
                      value="needCleaning"
                      checked={roomCondition === "needCleaning"}
                      onChange={(e) => setRoomCondition(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="text-xs" style={{ color: "#595959" }}>
                      ต้องทำความสะอาด
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="roomCondition"
                      value="damaged"
                      checked={roomCondition === "damaged"}
                      onChange={(e) => setRoomCondition(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="text-xs" style={{ color: "#595959" }}>
                      มีของชำรุด
                    </span>
                  </label>
                </div>
              </div>

              {/* Equipment Condition */}
              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: "#595959" }}>
                  สภาพอุปกรณ์
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="equipmentCondition"
                      value="working"
                      checked={equipmentCondition === "working"}
                      onChange={(e) => setEquipmentCondition(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="text-xs" style={{ color: "#595959" }}>
                      ใช้งานได้
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="equipmentCondition"
                      value="problem"
                      checked={equipmentCondition === "problem"}
                      onChange={(e) => setEquipmentCondition(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="text-xs" style={{ color: "#595959" }}>
                      มีปัญหา
                    </span>
                  </label>
                </div>
              </div>

              {/* Picture Upload */}
              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: "#595959" }}>
                  อัปโหลดรูปภาพ
                </p>
                <div className="mb-3">
                  <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 transition"
                    style={{ borderColor: "#FF7F50" }}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePictureUpload}
                      className="hidden"
                    />
                    <span className="text-xs" style={{ color: "#595959" }}>
                      คลิกเพื่ออัปโหลดรูปภาพ
                    </span>
                  </label>
                </div>

                {/* Picture Preview */}
                {pictures.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pictures.map((pic, index) => (
                      <div key={index} className="relative w-16 h-16">
                        <img src={pic} alt={`pic-${index}`} className="w-full h-full object-cover rounded-lg" />
                        <button
                          onClick={() => removePicture(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: "#595959" }}>
                  เอกสารหรือจดหมายเหตุ
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none"
                  style={{ color: "#595959" }}
                  rows={3}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (window.history.length > 1) {
                    navigate(-1)
                  } else {
                    navigate('/home')
                  }
                }}
                className="flex-1 py-3 rounded-full border border-gray-400 text-gray-600 text-sm font-medium hover:bg-gray-100 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmReturn}
                className="flex-1 py-3 rounded-full text-white text-sm font-medium hover:opacity-90 transition"
                style={{ backgroundColor: "#FF7F50" }}
              >
                ยืนยันการคืนห้อง
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 backdrop-blur-xs bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-full max-w-[320px] mx-4 bg-white rounded-lg overflow-hidden flex flex-col items-center">
            {/* Orange Header Bar */}
            <div className="w-full py-4" style={{ backgroundColor: "#FF7F50" }}>
              <p className="text-white font-semibold text-center">
                คืนห้องเรียบร้อย
              </p>
            </div>

            {/* Success Content */}
            <div className="flex-1 flex flex-col items-center justify-center py-5 px-8">
              {/* Checkmark Circle */}
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-12 h-12 text-white"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
            </div>

            {/* Button */}
            <button
              onClick={handleApprovalModalClose}
              className="w-3/4 py-3 text-white text-base font-semibold hover:opacity-90 transition mb-5 rounded-2xl"
              style={{ backgroundColor: "#FF7F50" }}
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
