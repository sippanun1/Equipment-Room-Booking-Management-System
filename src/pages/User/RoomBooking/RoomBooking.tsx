import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { collection, getDocs } from "firebase/firestore"
import { db } from "../../../firebase/firebase"
import Header from "../../../components/Header"
import BookRoomButton from "../../../components/BookRoomButton"
import ListPopularRoom from "../../../components/ListPopularRoom"
import type { BookingData } from "../../../App"

interface Room {
  id: string
  code: string
  type: string
  status: string
  usageDays?: Record<string, boolean>
  timeRanges?: Record<string, { start: string; end: string }>
}

interface RoomWithMeta extends Room {
  name: string
  image: string
  badge: string
  badgeColor: string
  availability: string
  availabilityColor: string
  capacity: string
  status: string
  bookingCount: number
}

interface RoomBookingProps {
  setBookingData: (data: BookingData) => void
}

export default function RoomBooking({ setBookingData }: RoomBookingProps) {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadPopularRooms = async () => {
      try {
        // Get all rooms
        const roomsSnapshot = await getDocs(collection(db, "rooms"))
        const roomsList: Room[] = []
        const roomIdMap: { [key: string]: string } = {}

        roomsSnapshot.forEach((doc) => {
          const data = doc.data() as Room
          roomsList.push({ ...data, id: doc.id })
          roomIdMap[doc.id] = doc.id
        })

        // Get all bookings to count per room
        const bookingsSnapshot = await getDocs(collection(db, "roomBookings"))
        const bookingCounts: { [key: string]: number } = {}

        bookingsSnapshot.forEach((doc) => {
          const data = doc.data()
          const roomId = data.roomId
          bookingCounts[roomId] = (bookingCounts[roomId] || 0) + 1
        })

        // Map rooms with booking count and metadata
        const roomsWithMeta = roomsList.map((room: any) => ({
          ...room,
          name: room.code,
          image: (room as any).image || "🏢",
          badge: bookingCounts[room.id] > 10 ? "HOT" : "AVAILABLE",
          badgeColor: bookingCounts[room.id] > 10 ? "bg-orange-500" : "bg-green-500",
          availability: "Available",
          availabilityColor: "bg-green-500",
          capacity: room.type,
          bookingCount: bookingCounts[room.id] || 0
        }))

        // Sort by booking count (popular first) and get top 8
        const topRooms = roomsWithMeta
          .sort((a, b) => b.bookingCount - a.bookingCount)
          .slice(0, 8)

        setRooms(topRooms)
      } catch (error) {
        console.error("Error loading popular rooms:", error)
      } finally {
        setLoading(false)
      }
    }

    loadPopularRooms()
  }, [])
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
      <Header title="ระบบการจองห้อง" />

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

          {/* Navigation Buttons */}
          <div className="w-full flex gap-4 mb-8 bg-[#FFDAB9]">
            <BookRoomButton
              emoji="📅"
              label="Room Availability"
              onClick={() => navigate('/room-booking/availability')}
            />
            <BookRoomButton
              emoji="📋"
              label="My Bookings"
              onClick={() => navigate('/room-booking/my-bookings')}
            />
          </div>
          {/* Popular Rooms List */}
          {loading ? (
            <div className="w-full text-center py-8">
              <p className="text-gray-600">กำลังโหลดข้อมูลห้อง...</p>
            </div>
          ) : rooms.length > 0 ? (
            <ListPopularRoom 
              rooms={rooms}
              onBookNow={(room) => { 
                setBookingData({ 
                  room: room.name, 
                  roomImage: room.image, 
                  time: '',
                  usageDays: room.usageDays,
                  timeRanges: room.timeRanges
                })
                navigate('/room-booking/form') 
              }}
            />
          ) : (
            <div className="w-full text-center py-8">
              <p className="text-gray-600">ไม่มีห้องให้บริการ</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
