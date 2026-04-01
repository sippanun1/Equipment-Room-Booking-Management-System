import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "../../../firebase/firebase"
import { useAuth } from "../../../hooks/useAuth"
import Header from "../../../components/Header"
import type { BookingData } from "../../../App"

interface TimeSlot {
  time: string
  available: boolean
  status: 'available' | 'booked' | 'closed' | 'userBooked'
  label?: string
  bookerName?: string
  isUserBooked?: boolean
}

interface Room {
  id: string
  code: string
  type: string
  status: string
  usageDays?: Record<string, boolean>
  timeRanges?: Record<string, { start: string; end: string }>
}

interface RoomSchedule {
  id: string
  name: string
  code: string
  image: string
  badge: string
  badgeColor: string
  timeSlots: TimeSlot[]
  usageDays?: Record<string, boolean>
  timeRanges?: Record<string, { start: string; end: string }>
}

interface RoomBooking {
  id: string
  roomId?: string
  roomCode?: string
  date: string
  startTime: string
  endTime: string
  status: string
  userName?: string
  userId?: string
}

interface RoomAvailabilityProps {
  setBookingData: (data: BookingData) => void
}

const getDayKey = (date: Date) => {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  return days[date.getDay()]
}

const formatTime = (hours: number) => {
  return `${String(hours).padStart(2, "0")}:00`
}

const getTimeKey = (time: string) => {
  const [hours] = time.split(":")
  return parseInt(hours)
}

export default function RoomAvailability({ setBookingData }: RoomAvailabilityProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showQuickPopup, setShowQuickPopup] = useState(false)
  const [quickPopupData, setQuickPopupData] = useState<{ room: string; roomId: string; time: string; endTime: string; available: boolean; bookerName?: string; usageDays?: Record<string, boolean>; timeRanges?: Record<string, { start: string; end: string }> } | null>(null)
  const [roomsSchedule, setRoomsSchedule] = useState<RoomSchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get all rooms
        const roomsSnapshot = await getDocs(collection(db, "rooms"))
        const roomsList: Room[] = []
        const roomMap: { [key: string]: Room } = {}

        roomsSnapshot.forEach((doc) => {
          const data = doc.data() as Room
          const room = { ...data, id: doc.id }
          roomsList.push(room)
          roomMap[doc.id] = room
        })

        // Get bookings for selected date (optimized with WHERE clause)
        const selectedDateStr = selectedDate.toISOString().split("T")[0]
        const bookingsQuery = query(
          collection(db, "roomBookings"),
          where("date", "==", selectedDateStr)
        )
        const bookingsSnapshot = await getDocs(bookingsQuery)
        const bookingsByRoomDate: { [key: string]: RoomBooking[] } = {}

        bookingsSnapshot.forEach((doc) => {
          const data = doc.data() as RoomBooking
          // Skip cancelled bookings
          if (data.status === "cancelled") return
          
          // Match by roomCode since that's what's stored in bookings
          const key = data.roomCode || ""
          if (key && !bookingsByRoomDate[key]) {
            bookingsByRoomDate[key] = []
          }
          if (key) {
            bookingsByRoomDate[key].push(data)
          }
        })

        // Get bookings made by current user for this date
        const userBookingsByRoom: { [roomCode: string]: RoomBooking[] } = {}
        bookingsSnapshot.docs
          .map(doc => doc.data() as RoomBooking)
          .filter(booking => 
            booking.userId === user?.uid && 
            booking.date === selectedDateStr && 
            (booking.status === "pending" || booking.status === "approved")
          )
          .forEach(booking => {
            const roomCode = booking.roomCode || ""
            if (roomCode) {
              if (!userBookingsByRoom[roomCode]) {
                userBookingsByRoom[roomCode] = []
              }
              userBookingsByRoom[roomCode].push(booking)
            }
          })

        // Generate schedules with available slots
        const dayKey = getDayKey(selectedDate)
        const schedules = roomsList.map((room) => {
          const isOpen = room.usageDays?.[dayKey] ?? true
          const timeRange = room.timeRanges?.[dayKey] || { start: "09:00", end: "17:00" }
          
          const timeSlots: TimeSlot[] = []
          const roomBookings = bookingsByRoomDate[room.code] || []
          const userBookings = userBookingsByRoom[room.code] || []
          
          // Generate all possible hours from 08:00 to 19:00
          for (let hour = 8; hour < 19; hour++) {
            const timeStr = formatTime(hour)
            
            // Check if this hour is within operating hours
            const isOperatingHour = isOpen && hour >= getTimeKey(timeRange.start) && hour < getTimeKey(timeRange.end)
            
            // Check if this hour is booked by another user
            const otherUserBooking = roomBookings.find((b) => {
              const bookStartHour = getTimeKey(b.startTime)
              const bookEndHour = getTimeKey(b.endTime)
              return hour >= bookStartHour && hour < bookEndHour
            })
            
            // Check if this hour is booked by current user
            const isUserBookedThisTime = userBookings.some((b) => {
              const bookStartHour = getTimeKey(b.startTime)
              const bookEndHour = getTimeKey(b.endTime)
              return hour >= bookStartHour && hour < bookEndHour
            })
            
            let status: 'available' | 'booked' | 'closed' | 'userBooked'
            let label = ""
            let bookerName: string | undefined
            
            if (isUserBookedThisTime) {
              // Booked by current user
              status = 'userBooked'
              label = `ยืมแล้ว ${timeStr} - ${formatTime(hour + 1)}`
            } else if (!isOperatingHour) {
              // Outside operating hours - admin closed this time
              status = 'closed'
              label = `ปิด ${timeStr}`
            } else if (otherUserBooking) {
              // Booked by another user
              status = 'booked'
              bookerName = otherUserBooking.userName
              label = `ไม่ว่าง ${timeStr}`
            } else {
              // Available
              status = 'available'
              label = `ว่าง ${timeStr} - ${formatTime(hour + 1)}`
            }
            
            timeSlots.push({
              time: timeStr,
              available: status === 'available',
              status,
              label,
              bookerName,
              isUserBooked: isUserBookedThisTime
            })
          }

          return {
            id: room.id,
            name: room.code,
            code: room.code,
            image: (room as any).image || "🏢",
            badge: room.type.substring(0, 4),
            badgeColor: isOpen ? "bg-green-500" : "bg-red-500",
            timeSlots,
            usageDays: room.usageDays,
            timeRanges: room.timeRanges
          } as RoomSchedule
        })

        setRoomsSchedule(schedules)
      } catch (error) {
        console.error("Error loading room availability:", error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [selectedDate, user?.uid])

  const handleTimeSlotClick = (roomId: string, room: string, timeSlot: TimeSlot) => {
    const endTime = formatTime(getTimeKey(timeSlot.time) + 1)
    
    // Find the full room object to get usageDays and timeRanges
    const roomObj = roomsSchedule.find(r => r.id === roomId)

    setQuickPopupData({
      room,
      roomId,
      time: timeSlot.time,
      endTime,
      available: timeSlot.available,
      bookerName: timeSlot.bookerName,
      usageDays: roomObj?.usageDays,
      timeRanges: roomObj?.timeRanges
    })
    setShowQuickPopup(true)
  }

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    
    // Prevent going to past dates
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(newDate)
    checkDate.setHours(0, 0, 0, 0)
    
    if (checkDate.getTime() >= today.getTime()) {
      setSelectedDate(newDate)
    }
  }

  const formatDateDisplay = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const compareDate = new Date(selectedDate)
    compareDate.setHours(0, 0, 0, 0)

    if (compareDate.getTime() === today.getTime()) {
      return "วันนี้"
    } else {
      return selectedDate.toLocaleDateString("th-TH", {
        month: "short",
        day: "numeric"
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
      <Header title="สถานะห้องว่าง" />

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-[360px] px-4 flex flex-col items-center">
          {/* Back Button */}
          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1)
              } else {
                navigate('/room-booking')
              }
            }}
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

          {/* Date Navigation */}
          <div className="w-full flex gap-2 mb-6 items-center justify-between">
            <button
              onClick={() => handleDateChange(-1)}
              disabled={(() => {
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const checkDate = new Date(selectedDate)
                checkDate.setHours(0, 0, 0, 0)
                return checkDate.getTime() <= today.getTime()
              })()}
              className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← ก่อนหน้า
            </button>
            <div className="text-center">
              <p className="font-semibold text-gray-700">{formatDateDisplay()}</p>
              <p className="text-xs text-gray-500">{selectedDate.toLocaleDateString("th-TH")}</p>
            </div>
            <button
              onClick={() => handleDateChange(1)}
              className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
            >
              ถัดไป →
            </button>
          </div>

          {/* Time Header & Room Schedule - Horizontal Scrollable */}
          {loading ? (
            <div className="w-full text-center py-8">
              <p className="text-gray-600">กำลังโหลดข้อมูลห้อง...</p>
            </div>
          ) : roomsSchedule.length > 0 ? (
            <div className="w-full overflow-x-auto mb-6">
              <div className="min-w-max">
                {/* Time Header */}
                <div className="flex gap-2 mb-4 pb-2">
                  <div className="w-24 flex-shrink-0"></div>
                  {roomsSchedule[0]?.timeSlots.map((slot) => (
                    <div
                      key={slot.time}
                      className="flex-shrink-0 w-16 text-center text-xs font-medium"
                      style={{ color: "#595959" }}
                    >
                      {slot.time}
                    </div>
                  ))}
                </div>

                {/* Room Schedule List */}
                <div className="space-y-4">
                  {roomsSchedule.map((room) => (
                    <div 
                      key={room.id} 
                      className="flex gap-2 relative"
                    >

                      {/* Room Image & Name - Fixed */}
                      <div className="w-24 flex-shrink-0">
                        <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center mb-2">
                          {room.image && room.image.startsWith('data:image') ? (
                            <img src={room.image} alt={room.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-2xl">{room.image || '🏢'}</span>
                          )}
                          <div
                            className={`absolute top-1 left-1 ${room.badgeColor} text-white text-xs font-bold px-1 py-0.5 rounded`}
                          >
                            {room.badge}
                          </div>
                        </div>
                        <h3 className="font-semibold text-xs" style={{ color: "#595959" }}>
                          {room.name}
                        </h3>
                      </div>

                      {/* Time Slots - Scrollable */}
                      <div className="flex gap-2">
                        {room.timeSlots.map((slot, idx) => (
                          <button
                            key={idx}
                            onClick={() => slot.status === 'available' && handleTimeSlotClick(room.id, room.name, slot)}
                            disabled={slot.status !== 'available'}
                            className={`
                              flex-shrink-0 w-16 py-2 rounded text-xs font-medium
                              transition
                              ${
                                slot.status === 'available'
                                  ? "text-white cursor-pointer hover:opacity-90"
                                  : "text-white cursor-not-allowed opacity-75"
                              }
                            `}
                            style={{
                              backgroundColor: slot.status === 'available' 
                                ? "#228B22" 
                                : slot.status === 'booked' 
                                ? "#FF4444" 
                                : slot.status === 'userBooked'
                                ? "#FF7F50"
                                : "#999999",
                              pointerEvents: slot.status !== 'available' ? 'none' : 'auto',
                              opacity: slot.status !== 'available' ? 0.6 : 1
                            }}
                            title={
                              slot.status === 'userBooked'
                                ? 'คุณได้ยืมห้องนี้แล้ว' 
                                : slot.status === 'closed' 
                                ? 'ปิดตามเวลาของผู้บริหาร' 
                                : slot.status === 'booked' 
                                ? `ไม่ว่าง (${slot.bookerName})` 
                                : 'ว่าง'
                            }
                          >
                            {slot.status === 'available' ? "ว่าง" : slot.status === 'userBooked' ? "ยืมแล้ว" : "ไม่ว่าง"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full text-center py-8">
              <p className="text-gray-600">ไม่มีข้อมูลห้องว่าง</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Popup - Simple Time Slot Info */}
      {showQuickPopup && quickPopupData && (
        <div 
          className="fixed inset-0 z-50 backdrop-blur-xs bg-opacity-50 flex items-center justify-center p-4"
          onClick={() => setShowQuickPopup(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4" style={{ color: "#595959" }}>
              จองห้อง {quickPopupData.room}
            </h2>

            {/* Time Range Display */}
            <div 
              className={`text-center py-6 rounded-lg mb-6 text-white font-bold`}
              style={{ 
                backgroundColor: quickPopupData.available ? "#228B22" : quickPopupData.bookerName ? "#FF4444" : "#999999"
              }}
            >
              <p className="text-2xl">{quickPopupData.time} - {quickPopupData.endTime}</p>
              <p className="text-sm mt-2">
                {quickPopupData.available 
                  ? "ว่าง" 
                  : quickPopupData.bookerName 
                  ? `ไม่ว่าง (จอง: ${quickPopupData.bookerName})`
                  : "ปิด (ตามเวลาทำการ)"}
              </p>
            </div>

            {/* Buttons */}
            {quickPopupData.available ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowQuickPopup(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    setBookingData({
                      room: quickPopupData.room,
                      roomImage: "🏢",
                      time: `${quickPopupData.time} - ${quickPopupData.endTime}`,
                      selectedDate: selectedDate.toISOString().split('T')[0],
                      availableSlots: [],
                      usageDays: quickPopupData.usageDays,
                      timeRanges: quickPopupData.timeRanges
                    })
                    navigate('/room-booking/form')
                    setShowQuickPopup(false)
                  }}
                  className="flex-1 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition"
                  style={{ backgroundColor: "#FF7F50" }}
                >
                  Book Now
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowQuickPopup(false)}
                className="w-full py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition"
              >
                ปิด
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
