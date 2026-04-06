import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { addDoc, collection, getDocs, query, where } from "firebase/firestore"
import { db } from "../../../firebase/firebase"
import { useAuth } from "../../../hooks/useAuth"
import Header from "../../../components/Header"
import DatePicker from "../../../components/DatePicker"
import { sendRoomBookingEmailToAdmin } from "../../../utils/emailService"
import type { BookingData } from "../../../App"

// Helper function to normalize dates to YYYY-MM-DD format
const formatDateString = (date: string | Date): string => {
  if (typeof date === "string") return date
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

interface Member {
  id: string
  name: string
  studentId: string
}

interface RoomBookingFormProps {
  bookingData: BookingData | null
  onConfirmBooking: (bookingData: {
    room: string
    date: string
    time: string
    people: number
    members: Member[]
    objective: string
  }) => void
}

export default function RoomBookingForm({
  bookingData,
  onConfirmBooking
}: RoomBookingFormProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [date, setDate] = useState(bookingData?.selectedDate || "")
  const [startTime, setStartTime] = useState(bookingData?.time?.split(" - ")[0] || "")
  const [endTime, setEndTime] = useState(bookingData?.time?.split(" - ")[1] || "")
  const [members, setMembers] = useState<Member[]>([
    { id: "1", name: "", studentId: "" }
  ])
  const [objective, setObjective] = useState("")
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bookedTimes, setBookedTimes] = useState<string[]>([])
  const [bookedPeriods, setBookedPeriods] = useState<Array<{ start: string; end: string }>>([])
  const [bookedDates, setBookedDates] = useState<string[]>([])
  const [hasTimeConflict, setHasTimeConflict] = useState(false)

  // Fetch all booked dates for the room (for DatePicker indicator)
  useEffect(() => {
    const fetchBookedDates = async () => {
      if (!bookingData?.room) {
        setBookedDates([])
        return
      }

      try {
        const q = query(
          collection(db, "roomBookings"),
          where("roomCode", "==", bookingData.room)
        )
        const snapshot = await getDocs(q)
        
        const allDates: string[] = []
        snapshot.forEach(doc => {
          const data = doc.data()
          // Skip cancelled bookings
          if (data.status === "cancelled") return
          // Normalize date format to ensure consistency
          const normalizedDate = formatDateString(data.date)
          allDates.push(normalizedDate)
        })
        
        const uniqueDates = [...new Set(allDates)]
        setBookedDates(uniqueDates)
      } catch (error) {
        console.error("Error fetching booked dates:", error)
        setBookedDates([])
      }
    }

    fetchBookedDates()
  }, [bookingData?.room])

  // Fetch booked times for selected date and room
  useEffect(() => {
    const fetchBookedTimes = async () => {
      if (!date || !bookingData?.room) {
        setBookedTimes([])
        return
      }

      try {
        const q = query(
          collection(db, "roomBookings"),
          where("roomCode", "==", bookingData.room),
          where("date", "==", date)
        )
        const snapshot = await getDocs(q)
        
        const booked: string[] = []
        const periods: Array<{ start: string; end: string }> = []
        snapshot.forEach(doc => {
          const data = doc.data()
          // Skip cancelled bookings
          if (data.status === "cancelled") return
          
          // Store the period (for end time filtering)
          periods.push({ start: data.startTime, end: data.endTime })
          
          const startHour = parseInt(data.startTime.split(':')[0])
          const endHour = parseInt(data.endTime.split(':')[0])
          
          // Mark all hours in the booked time range as unavailable FOR STARTING
          for (let hour = startHour; hour < endHour; hour++) {
            const timeStr = formatTime(hour)
            if (!booked.includes(timeStr)) {
              booked.push(timeStr)
            }
          }
        })
        
        setBookedTimes(booked)
        
        // Sort periods by start time
        const sortedPeriods = periods.sort((a, b) => a.start.localeCompare(b.start))
        setBookedPeriods(sortedPeriods)
        
        // Check if current start time conflicts
        if (startTime && booked.includes(startTime)) {
          setHasTimeConflict(true)
        } else {
          setHasTimeConflict(false)
        }
      } catch (error) {
        console.error("Error fetching booked times:", error)
        setBookedTimes([])
        setBookedPeriods([])
        setHasTimeConflict(false)
      }
    }

    fetchBookedTimes()
  }, [date, bookingData?.room, startTime])

  // Format time key from "HH:00" format
  const getTimeKey = (time: string) => {
    const [hours] = time.split(":")
    return parseInt(hours)
  }

  // Format time
  const formatTime = (hours: number) => {
    return `${String(hours).padStart(2, "0")}:00`
  }

  // Get day key from date for timeRanges lookup
  const getDayKey = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00")
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    return days[date.getDay()]
  }

  // Check if a date is available based on usageDays
  const isDateAvailable = (dateString: string) => {
    if (!bookingData?.usageDays) return true // If no usageDays defined, assume all days available
    const dayKey = getDayKey(dateString)
    return bookingData.usageDays[dayKey] ?? false
  }

  // Get available start times from slots or generate based on timeRanges (excluding booked times)
  const availableStartTimes = (() => {
    let times: string[] = []
    
    if (bookingData?.availableSlots && bookingData.availableSlots.length > 0) {
      times = bookingData.availableSlots.filter(slot => slot.available).map(slot => slot.time)
    } else {
      // Check if the selected date is available
      if (!date || !isDateAvailable(date)) {
        return [] // No times available for unavailable days
      }
      
      if (bookingData?.timeRanges) {
        const dayKey = getDayKey(date)
        const timeRange = bookingData.timeRanges[dayKey]
        if (timeRange) {
          const startHour = parseInt(timeRange.start.split(':')[0])
          const endHour = parseInt(timeRange.end.split(':')[0])
          times = generateTimeOptions(startHour, endHour)
        }
      } else {
        times = generateTimeOptions(9, 17) // Default: 09:00 to 17:00
      }
    }
    
    // Filter out booked times
    return times.filter(time => !bookedTimes.includes(time))
  })()

  // Generate time options within a range
  function generateTimeOptions(startHour: number, endHour: number): string[] {
    const times: string[] = []
    for (let hour = startHour; hour < endHour; hour++) {
      times.push(formatTime(hour))
    }
    return times
  }

  // Get available end times (within 4 hours of start time, respecting timeRanges)
  const getAvailableEndTimes = () => {
    if (!startTime || !date) return []
    
    // Check if date is available
    if (!isDateAvailable(date)) {
      return []
    }
    
    const startHour = getTimeKey(startTime)
    let maxHour = Math.min(startHour + 4, 23)
    
    // Respect room's timeRanges if available
    if (bookingData?.timeRanges) {
      const dayKey = getDayKey(date)
      const timeRange = bookingData.timeRanges[dayKey]
      if (timeRange) {
        const rangeEndHour = parseInt(timeRange.end.split(':')[0])
        maxHour = Math.min(maxHour, rangeEndHour)
      }
    }
    
    const endTimes: string[] = []
    for (let hour = startHour + 1; hour <= maxHour; hour++) {
      endTimes.push(formatTime(hour))
    }
    
    // Filter: end time must not overlap with booked periods
    return endTimes.filter(time => {
      const timeHour = getTimeKey(time)
      for (const period of bookedPeriods) {
        const bookedStart = getTimeKey(period.start)
        if (timeHour > bookedStart) {
          return false
        }
      }
      return true
    })
  }

  // Helper to get available end times for a specific start time
  const getAvailableEndTimesForStartTime = (selectedStartTime: string): string[] => {
    if (!selectedStartTime || !date) return []
    
    if (!isDateAvailable(date)) {
      return []
    }
    
    const startHour = getTimeKey(selectedStartTime)
    let maxHour = Math.min(startHour + 4, 23)
    
    if (bookingData?.timeRanges) {
      const dayKey = getDayKey(date)
      const timeRange = bookingData.timeRanges[dayKey]
      if (timeRange) {
        const rangeEndHour = parseInt(timeRange.end.split(':')[0])
        maxHour = Math.min(maxHour, rangeEndHour)
      }
    }
    
    const endTimes: string[] = []
    for (let hour = startHour + 1; hour <= maxHour; hour++) {
      endTimes.push(formatTime(hour))
    }
    
    // NEW LOGIC: Only filter out times that conflict with booked periods
    return endTimes.filter(time => {
      const timeHour = getTimeKey(time)
      // Check if this end time overlaps with any booked period
      // Your booking would be [startHour, timeHour)
      // It's OK to end at the time a booking starts (e.g., end at 10:00 if booking starts at 10:00)
      for (const period of bookedPeriods) {
        const bookedStart = getTimeKey(period.start)
        // If your end time is AFTER the booking starts, there's a conflict
        if (timeHour > bookedStart) {
          return false // Block this end time
        }
      }
      return true // Allow this end time
    })
  }

  const handleAddMember = () => {
    const newMemberId = (Math.max(...members.map(m => parseInt(m.id)), 0) + 1).toString()
    setMembers([...members, { id: newMemberId, name: "", studentId: "" }])
  }

  const handleRemoveMember = (id: string) => {
    if (members.length > 1) {
      setMembers(members.filter(m => m.id !== id))
    }
  }

  const handleMemberChange = (id: string, field: 'name' | 'studentId', value: string) => {
    setMembers(members.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ))
  }

  const handleBooking = async () => {
    if (!date || !startTime || !endTime) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน")
      return
    }

    // Validate all members have names and student IDs
    const invalidMembers = members.some(m => !m.name.trim() || !m.studentId.trim())
    if (invalidMembers) {
      alert("กรุณากรอกชื่อและเลขประจำตัวของสมาชิกทั้งหมด")
      return
    }

    setIsSubmitting(true)
    try {
      // Save to Firebase
      await addDoc(collection(db, "roomBookings"), {
        roomCode: bookingData?.room || "",
        roomType: "",
        userName: user?.displayName || user?.email || "ผู้ใช้",
        userId: user?.uid || "",
        userEmail: user?.email || "",
        date: date,
        startTime: startTime,
        endTime: endTime,
        purpose: objective || "",
        people: members.length,
        members: members,
        status: "pending",
        bookedAt: new Date().toISOString()
      })

      // Send notification to admin
      const emailData = {
        adminEmail: import.meta.env.VITE_ADMIN_EMAIL || 'admin@example.com',
        userEmail: user?.email || '',
        userName: user?.displayName || user?.email || 'ผู้ใช้',
        roomName: bookingData?.room || '',
        date: date,
        startTime: startTime,
        endTime: endTime,
        people: members.length,
        members: members,
        objective: objective || '-',
        userId: user?.uid || ''
      }

      if (user?.email) {
        await sendRoomBookingEmailToAdmin(emailData)
      }

      onConfirmBooking({
        room: bookingData?.room || "",
        date,
        time: `${startTime} - ${endTime}`,
        people: members.length,
        members: members,
        objective
      })
      setShowApprovalModal(true)
    } catch (error) {
      console.error("Error saving booking:", error)
      alert("เกิดข้อผิดพลาดในการจองห้อง")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApprovalModalClose = () => {
    setShowApprovalModal(false)
    navigate('/home')
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
      <Header title="กรอกข้อมูลการจอง" />

      {/* ===== CONTENT ===== */}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-[360px] px-4 flex flex-col items-center">
          {/* Title */}
          <div className="w-full mb-4">
            <p className="text-sm font-medium mb-1" style={{ color: "#595959" }}>
              รายละเอียดการจอง
            </p>
            <p className="text-xs" style={{ color: "#595959" }}>
              กรุณากรอกข้อมูลเพื่อจองห้อง
            </p>
          </div>

          {/* Room Info Card */}
          <div className="w-full p-4 mb-6 flex gap-4">
            {/* Room Image */}
            <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
              {bookingData?.roomImage && bookingData.roomImage.startsWith('data:image') ? (
                <img src={bookingData.roomImage} alt="Room" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">{bookingData?.roomImage || '🏢'}</span>
              )}
            </div>

            {/* Room Details */}
            <div className="flex-1 flex flex-col justify-between">
              {/* Room Name */}
              <div>
                <input
                  type="text"
                  value={bookingData?.room || ""}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
                  style={{ color: "#595959" }}
                />
              </div>

              {/* Date Picker Component */}
              <DatePicker
                value={date}
                onChange={setDate}
                usageDays={bookingData?.usageDays}
                bookedDates={bookedDates}
              />
            </div>
          </div>

          {/* Time Dropdown */}
          {date && !isDateAvailable(date) ? (
            <div className="w-full mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">ห้องนี้ปิดในวันนี้ กรุณาเลือกวันอื่น</p>
            </div>
          ) : date && availableStartTimes.length === 0 ? (
            <div className="w-full mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">ไม่มีเวลาว่างในวันนี้ กรุณาเลือกวันอื่น</p>
            </div>
          ) : hasTimeConflict ? (
            <div className="w-full mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">⚠️ เวลาที่คุณเลือกขัดแย้งกับการจองอื่นแล้ว</p>
              <p className="text-xs text-yellow-700 mt-1">กรุณาเลือกเวลาอื่น</p>
            </div>
          ) : (
            <>
              <div className="w-full mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: "#595959" }}>
                  เวลาเริ่มต้น
                </label>
                <select
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value)
                    // Auto-set end time to first available time after start
                    if (e.target.value) {
                      const availableEnds = getAvailableEndTimesForStartTime(e.target.value)
                      if (availableEnds.length > 0) {
                        setEndTime(availableEnds[0])
                      }
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none appearance-none bg-white"
                  style={{ color: "#595959" }}
                >
                  {!startTime && <option value="" disabled>เลือกเวลาเริ่มต้น</option>}
                  {availableStartTimes.length === 0 ? (
                    <option disabled>ไม่มีเวลาว่างในวันนี้</option>
                  ) : (
                    availableStartTimes.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* End Time Dropdown */}
              <div className="w-full mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: "#595959" }}>
                  เวลาสิ้นสุด (สูงสุด 4 ชั่วโมง)
                </label>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!startTime}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none appearance-none bg-white disabled:opacity-50"
                  style={{ color: "#595959" }}
                >
                  {!endTime && startTime && <option value="" disabled>เลือกเวลาสิ้นสุด</option>}
                  {getAvailableEndTimes().map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Members List */}
          <div className="w-full mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium" style={{ color: "#595959" }}>
                สมาชิก
              </label>
              <button
                onClick={handleAddMember}
                className="text-sm px-3 py-1 rounded text-white font-medium hover:opacity-90 transition"
                style={{ backgroundColor: "#FF7F50" }}
              >
                + เพิ่ม
              </button>
            </div>

            {members.map((member, index) => (
              <div key={member.id} className="mb-3 p-3 border border-gray-300 rounded-lg bg-white">
                {/* Member Number */}
                <div className="text-xs font-medium mb-2" style={{ color: "#595959" }}>
                  สมาชิก {index + 1}
                </div>

                {/* Name Input */}
                <input
                  type="text"
                  placeholder="ชื่อ-นามสกุล"
                  value={member.name}
                  onChange={(e) => handleMemberChange(member.id, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none"
                  style={{ color: "#595959" }}
                />

                {/* Student ID Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="เลขประจำตัว"
                    value={member.studentId}
                    onChange={(e) => handleMemberChange(member.id, 'studentId', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
                    style={{ color: "#595959" }}
                  />
                  {members.length > 1 && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="px-3 py-2 border border-red-300 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Objective Input */}
          <div className="w-full mb-8">
            <input
              type="text"
              placeholder="ระบุจุดประสงค์"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none"
              style={{ color: "#595959" }}
            />
          </div>

          {/* Buttons */}
          <div className="w-full flex gap-3 mb-6">
            {(() => {
              const allMembersFilled = members.every(m => m.name.trim() && m.studentId.trim())
              const isFormComplete = date && startTime && endTime && isDateAvailable(date) && allMembersFilled
              return (
                <>
                  <button
                    onClick={() => {
                      if (window.history.length > 1) {
                        navigate(-1)
                      } else {
                        navigate('/room-booking')
                      }
                    }}
                    className="flex-1 py-3 rounded-full border border-gray-400 text-gray-600 text-sm font-medium hover:bg-gray-100 transition"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleBooking}
                    disabled={isSubmitting || !isFormComplete}
                    className="flex-1 py-3 rounded-full text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                    style={{ backgroundColor: "#FF7F50" }}
                  >
                    {isSubmitting ? "กำลังบันทึก..." : "จองห้อง"}
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 backdrop-blur-xs bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-full max-w-[320px] mx-4 bg-white rounded-lg p-8 flex flex-col items-center text-center">
            {/* Orange Header Bar */}
            <div className="w-[calc(100%+64px)] -mx-8 -mt-8 mb-6 py-4 rounded-t-lg" style={{ backgroundColor: "#FF7F50" }}>
              <p className="text-white font-medium">
                จองห้องเรียบร้อย
              </p>
            </div>

            {/* Message */}
            <p className="text-xl font-bold mb-6" style={{ color: "#B71C1C" }}>
              โปรดรอการอนุมัติ
              <br />
              ก่อนเข้าใช้งาน
            </p>

            {/* Button */}
            <button
              onClick={handleApprovalModalClose}
              className="w-full py-3 rounded-full text-white font-medium text-sm hover:opacity-90 transition"
              style={{ backgroundColor: "#FF7F50" }}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
