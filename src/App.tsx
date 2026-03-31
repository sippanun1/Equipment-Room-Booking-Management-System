import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase/firebase'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'

// Public pages
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

// User pages
const Home = lazy(() => import('./pages/Home'))
const BorrowEquipment = lazy(() => import('./pages/User/BorrowEquipment/BorrowEquipment'))
const BorrowDuringClass = lazy(() => import('./pages/User/BorrowEquipment/BorrowDuringClass'))
const BorrowForTeaching = lazy(() => import('./pages/User/BorrowEquipment/BorrowForTeaching'))
const BorrowOutsideClass = lazy(() => import('./pages/User/BorrowEquipment/BorrowOutsideClass'))
const EquipmentSelection = lazy(() => import('./pages/User/BorrowEquipment/EquipmentSelection'))
const CartSummary = lazy(() => import('./pages/User/BorrowEquipment/CartSummary'))
const ConfirmSummary = lazy(() => import('./pages/User/BorrowEquipment/ConfirmSummary'))
const CompletionPage = lazy(() => import('./pages/User/BorrowEquipment/CompletionPage'))
const ReturnEquipment = lazy(() => import('./pages/User/ReturnEquipment/ReturnEquipment'))
const ReturnSummary = lazy(() => import('./pages/User/ReturnEquipment/ReturnSummary'))
const RoomBooking = lazy(() => import('./pages/User/RoomBooking/RoomBooking'))
const RoomAvailability = lazy(() => import('./pages/User/RoomBooking/RoomAvailability'))
const RoomBookingForm = lazy(() => import('./pages/User/RoomBooking/RoomBookingForm'))
const MyRoomBookings = lazy(() => import('./pages/User/RoomBooking/MyRoomBookings'))
const ReturnRoomForm = lazy(() => import('./pages/User/RoomBooking/ReturnRoomForm'))
const UserBorrowReturnHistory = lazy(() => import('./pages/User/BorrowReturnHistory'))

// Admin pages — only loaded when role is admin
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'))
const EquipmentConditionReport = lazy(() => import('./pages/Admin/EquipmentConditionReport'))
const AdminManageRooms = lazy(() => import('./pages/Admin/AdminManageRooms'))
const AdminManageEquipment = lazy(() => import('./pages/Admin/AdminManageEquipment'))
const RoomSchedule = lazy(() => import('./pages/Admin/RoomSchedule'))
const RoomBookingHistory = lazy(() => import('./pages/Admin/RoomBookingHistory'))
const BorrowReturnHistory = lazy(() => import('./pages/Admin/BorrowReturnHistory'))
const AdminManagement = lazy(() => import('./pages/Admin/AdminManagement'))
const AdminManageUsers = lazy(() => import('./pages/Admin/AdminManageUsers'))
const AdminHistory = lazy(() => import('./pages/Admin/AdminHistory'))

export interface Equipment {
  id: string
  name: string
  category: "consumable" | "asset" | "main"
  quantity: number
  unit: string
  picture?: string
  inStock: boolean
  available: number
  code?: string
  serialCode?: string
  equipmentTypes?: string[]
  equipmentSubTypes?: string[]
}

export interface SelectedEquipment extends Equipment {
  selectedQuantity: number
}

export interface ReturnEquipmentItem {
  borrowId: string
  id: string
  equipmentId?: string
  name: string
  code: string
  checked: boolean
  quantity: number
  quantityBorrowed: number
  status: string
  notes?: string
  borrowDate: string
  borrowTime: string
  borrowType: string
  userName: string
  expectedReturnDate: string
  expectedReturnTime?: string
  equipmentCategory?: string
  consumptionStatus?: string
  // Asset return breakdown
  returnGoodQty?: number
  returnDamagedQty?: number
  returnLostQty?: number
  // Asset codes with conditions
  assetCodes?: string[]
  assetCodeConditions?: { code: string; condition: "ปกติ" | "ชำรุด" | "สูญหาย"; notes?: string }[]
}

export interface BookingData {
  room: string
  roomImage: string
  time: string
  selectedDate?: string
  availableSlots?: Array<{ time: string; available: boolean }>
  usageDays?: Record<string, boolean>
  timeRanges?: Record<string, { start: string; end: string }>
}

export interface ReturnBookingData {
  id: string
  room: string
  time: string
  name: string
  bookingCode: string
  image: string
  status: "pending" | "approved" | "inuse"
}

function App() {
  const { role } = useAuth()
  const [cartItems, setCartItems] = useState<SelectedEquipment[]>([])
  const [returnEquipment, setReturnEquipment] = useState<ReturnEquipmentItem[]>([])
  const [bookingData, setBookingData] = useState<BookingData | null>(null)
  const [returnBookingData, setReturnBookingData] = useState<ReturnBookingData | null>(null)

  const handleConfirmReturn = async (returnData: {
    bookingId: string
    roomCondition: string
    equipmentCondition: string
    furniture: string[]
    notes: string
    pictures: string[]
  }) => {
    try {
      // Update the booking status to "returned" and save return details
      const bookingRef = doc(db, "roomBookings", returnData.bookingId)
      await updateDoc(bookingRef, {
        status: "returned",
        roomCondition: returnData.roomCondition,
        equipmentCondition: returnData.equipmentCondition,
        returnNotes: returnData.notes,
        returnedAt: new Date().toISOString(),
        pictures: returnData.pictures
      })
      console.log("Room return confirmed:", returnData)
    } catch (error) {
      console.error("Error confirming return:", error)
      alert("เกิดข้อผิดพลาดในการคืนห้อง")
    }
  }

  return (
    <Router>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">Loading...</div></div>}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* User routes — only registered when user role is 'user' */}
        {role === 'user' && (
          <>
            <Route path="/home" element={<ProtectedRoute element={<Home />} />} />
            <Route path="/borrow" element={<ProtectedRoute element={<BorrowEquipment />} />} />
            <Route path="/borrow/during-class" element={<ProtectedRoute element={<BorrowDuringClass />} />} />
            <Route path="/borrow/teaching" element={<ProtectedRoute element={<BorrowForTeaching />} />} />
            <Route path="/borrow/outside" element={<ProtectedRoute element={<BorrowOutsideClass />} />} />
            <Route path="/borrow/equipment" element={<ProtectedRoute element={<EquipmentSelection cartItems={cartItems} setCartItems={setCartItems} />} />} />
            <Route path="/borrow/cart" element={<ProtectedRoute element={<CartSummary cartItems={cartItems} setCartItems={setCartItems} />} />} />
            <Route path="/borrow/confirm" element={<ProtectedRoute element={<ConfirmSummary cartItems={cartItems} setCartItems={setCartItems} />} />} />
            <Route path="/borrow/completion" element={<ProtectedRoute element={<CompletionPage cartItems={cartItems} setCartItems={setCartItems} />} />} />
            <Route path="/return" element={<ProtectedRoute element={<ReturnEquipment returnEquipment={returnEquipment} setReturnEquipment={setReturnEquipment} />} />} />
            <Route path="/return/summary" element={<ProtectedRoute element={<ReturnSummary returnEquipment={returnEquipment} setReturnEquipment={setReturnEquipment} />} />} />
            <Route path="/borrow-return-history" element={<ProtectedRoute element={<UserBorrowReturnHistory />} />} />
            <Route path="/room-booking" element={<ProtectedRoute element={<RoomBooking setBookingData={setBookingData} />} />} />
            <Route path="/room-booking/availability" element={<ProtectedRoute element={<RoomAvailability setBookingData={setBookingData} />} />} />
            <Route path="/room-booking/form" element={<ProtectedRoute element={bookingData ? <RoomBookingForm bookingData={bookingData} onConfirmBooking={(confirmData) => console.log('Booking confirmed:', confirmData)} /> : <Navigate to="/room-booking" />} />} />
            <Route path="/room-booking/my-bookings" element={<ProtectedRoute element={<MyRoomBookings setReturnBookingData={setReturnBookingData} />} />} />
            <Route path="/room-booking/return" element={<ProtectedRoute element={returnBookingData ? <ReturnRoomForm booking={returnBookingData} onConfirmReturn={handleConfirmReturn} /> : <Navigate to="/room-booking/my-bookings" />} />} />
          </>
        )}

        {/* Admin routes — only registered when user is admin */}
        {role === 'admin' && (
          <>
            <Route path="/admin" element={<ProtectedRoute element={<AdminDashboard />} requiredRole="admin" />} />
            <Route path="/admin/dashboard" element={<ProtectedRoute element={<AdminDashboard />} requiredRole="admin" />} />
            <Route path="/admin/equipment-condition" element={<ProtectedRoute element={<EquipmentConditionReport />} requiredRole="admin" />} />
            <Route path="/admin/manage-rooms" element={<ProtectedRoute element={<AdminManageRooms />} requiredRole="admin" />} />
            <Route path="/admin/room-schedule/:roomId" element={<ProtectedRoute element={<RoomSchedule />} requiredRole="admin" />} />
            <Route path="/admin/manage-equipment" element={<ProtectedRoute element={<AdminManageEquipment />} requiredRole="admin" />} />
            <Route path="/admin/borrow-return-history" element={<ProtectedRoute element={<BorrowReturnHistory />} requiredRole="admin" />} />
            <Route path="/admin/room-booking-history" element={<ProtectedRoute element={<RoomBookingHistory />} requiredRole="admin" />} />
            <Route path="/admin/management" element={<ProtectedRoute element={<AdminManagement />} requiredRole="admin" />} />
            <Route path="/admin/manage-users" element={<ProtectedRoute element={<AdminManageUsers />} requiredRole="admin" />} />
            <Route path="/admin/history" element={<ProtectedRoute element={<AdminHistory />} requiredRole="admin" />} />
          </>
        )}

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </Router>
  )
}

export default App