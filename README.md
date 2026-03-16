# ระบบจัดการอุปกรณ์และการจองห้อง
# Equipment & Room Booking Management System

A comprehensive web application for managing equipment borrowing, returns, and room bookings with admin and user interfaces.

## 📋 Features

### Admin Features
- **Equipment Management**
  - Add, edit, and delete equipment (consumables and assets)
  - Track equipment availability and stock levels
  - Manage serial codes for assets
  - Upload equipment images
  - Equipment condition reporting and damage tracking

- **Room Management**
  - Create and manage classroom/meeting rooms
  - Set room hours and availability by day
  - Upload and display room images
  - View room booking schedules
  - Cancel bookings and manage usage

- **Borrow/Return Management**
  - Approve/reject equipment requests
  - Track equipment returns and conditions
  - Log equipment damage/loss with status tracking
  - Send confirmation emails with serial codes
  - View complete borrow/return history

- **User Management**
  - View and manage system users
  - Delete user accounts and associated data

- **Reporting**
  - Admin action logs
  - Equipment condition reports
  - Borrow/return history

### User Features
- **Equipment Borrowing**
  - Browse available equipment
  - Submit borrow requests
  - View borrow history with serial codes
  - Return equipment and report conditions

- **Room Booking**
  - View room availability by date and time
  - Book available rooms with images
  - Manage personal bookings
  - Cancel bookings

## 🛠️ Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **Email**: Firebase Cloud Functions (Nodemailer)

## 📦 Project Structure

```
src/
├── components/         # Reusable React components
│   ├── Header.tsx
│   ├── BookRoomButton.tsx
│   ├── ListPopularRoom.tsx
│   └── ...
├── pages/             # Page components
│   ├── Admin/         # Admin dashboard pages
│   │   ├── AdminManageEquipment.tsx
│   │   ├── AdminManageRooms.tsx
│   │   ├── AdminManageUsers.tsx
│   │   └── ...
│   ├── User/          # User pages
│   │   ├── BorrowEquipment/
│   │   ├── ReturnEquipment/
│   │   ├── RoomBooking/
│   │   └── ...
│   ├── Login.tsx
│   ├── Register.tsx
│   └── Home.tsx
├── hooks/             # Custom React hooks
│   └── useAuth.ts
├── utils/             # Utility functions
│   ├── equipmentHelper.ts
│   ├── borrowReturnLogger.ts
│   ├── emailService.ts
│   └── adminLogger.ts
├── types/             # TypeScript type definitions
│   └── auth.ts
├── firebase/          # Firebase configuration
│   └── firebase.ts
├── data/              # Static data
│   └── equipment.ts
└── App.tsx            # Main app component
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Firebase project

### Installation

```bash
# Clone repository
git clone <repository-url>
cd forpte

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🔄 Equipment Condition Lifecycle

- **ปกติ** (Normal): Equipment in good condition
- **ชำรุด** (Damaged): Equipment needs repair
- **สูญหาย** (Lost): Equipment lost

**Condition Issue Status**:
- **pending**: Awaiting admin review
- **acknowledged**: Admin confirmed
- **fixed**: Equipment repaired

## 📧 Email Notifications

Automatic emails for:
- Equipment borrow confirmations
- Room booking confirmations
- Return notifications
- Condition reports

## 🔐 Security

- Protected admin routes
- User authentication required
- Firestore security rules
- Email verification

## 📄 License

Internal Use Only - All Rights Reserved

## 📞 Support

For issues contact the development team.
