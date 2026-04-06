# Borrow Return Reminder Email Setup Guide

## Overview
This system automatically sends reminder emails to users **30 minutes before** their expected equipment return time.

## How It Works

### 1. **Scheduled Cloud Function** (`functions/src/index.ts`)
- Runs **every 5 minutes** using Firebase Pub/Sub scheduler (cost-optimized)
- Queries for borrows where `expectedReturnTime` is exactly 30 minutes from now
- Sends reminder email for each matching borrow
- Marks reminder as sent to avoid duplicates

### 2. **Email Template**
Reminder emails include:
- User greeting
- Equipment list with quantities
- Expected return time and date
- Instructions to return items properly
- Note that they can ignore if already returned

### 3. **Tracking Fields** (Added to BorrowTransaction)
```typescript
reminderSent?: boolean        // Whether reminder has been sent
reminderSentAt?: number       // Timestamp of when reminder was sent
```

## Database Queries Used

The Cloud Function queries `borrowHistory` collection for:
```
- status == "borrowed" (active borrows only)
- expectedReturnDate == today
- expectedReturnTime == [30 minutes from now] (HH:mm format)
- reminderSent == false (not yet reminded)
```

## Setup Instructions

### Step 1: Install Dependencies
```bash
cd functions
npm install
```

### Step 2: Build Cloud Functions
```bash
npm run build
```

### Step 3: Deploy to Firebase
```bash
firebase deploy --only functions
```

Or from the root directory:
```bash
npm run deploy:functions
```

### Step 4: Verify Deployment
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Functions** section
4. Look for `sendBorrowReturnReminders` function
5. Check the **Logs** tab to verify it's running

## Testing Locally

### Run Emulator
```bash
npm start
```

This will start:
- Cloud Functions emulator
- Firestore emulator
- Other Firebase services

### Manually Trigger Function
Connect to the emulator and modify a test borrow document with:
- `expectedReturnDate` = today's date
- `expectedReturnTime` = current time + 30 minutes (in HH:mm format)
- `reminderSent` = false
- `status` = "borrowed"

The function should trigger on the next minute and send the reminder email.

## Important Notes

### Time Format
- Times are stored as 24-hour format: `HH:mm` (e.g., "15:30", "09:15")
- The system automatically converts this to send emails 30 minutes before

### Email Delivery
- Emails are added to Firestore `mail` collection
- Firebase Extension handles actual email delivery
- Make sure the extension is installed and configured

### Firestore Indexes
Create a composite index for optimal query performance:
- Collection: `borrowHistory`
- Fields: `status` (Ascending), `expectedReturnDate` (Ascending), `expectedReturnTime` (Ascending), `reminderSent` (Ascending)

You can create this automatically by clicking the link that appears when you first deploy the function and the query fails.

## Troubleshooting

### Function Not Running
1. Check Cloud Console → Functions → Logs
2. Verify the `sendBorrowReturnReminders` function exists
3. Check if there are any errors in the logs

### Emails Not Sending
1. Verify `mail` collection exists in Firestore
2. Check that Firebase Extensions are configured
3. Look at function logs for email sending errors

### Reminders Sending Duplicate Emails
1. Verify `reminderSent` field is being set to `true` after sending
2. Check Firestore documents to see if they have `reminderSent: false`

### Time Zone Issues
Currently uses **UTC/server time**. If you need a specific timezone:
1. Modify the Cloud Function to convert to your timezone
2. Update the time comparison logic accordingly

## Customization

### Change Frequency
Edit `functions/src/index.ts` line 53:
```typescript
.schedule('every 5 minutes')  // Change to 'every 1 minutes', 'every 10 minutes', 'every 1 hours', etc.
```

**Cost comparison:**
- Every 1 minute: 43,200 invocations/month (~$5-10/month)
- Every 5 minutes: 8,640 invocations/month (~$0.20-0.50/month) ✅ **Current setting**
- Every 10 minutes: 4,320 invocations/month (~free)

### Change Reminder Time
Edit line 58-59:
```typescript
const thirtyMinutesLater = new Date(now.getTime() + 30 * 60 * 1000)
// Change 30 * 60 * 1000 to different milliseconds (e.g., 60 * 60 * 1000 for 1 hour)
```

### Modify Email Template
Edit the `sendBorrowReturnReminderEmail()` function in `functions/src/index.ts` to customize the email appearance.

## File Structure
```
functions/
├── src/
│   └── index.ts           # Cloud Function code
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript config
```

## Related Files
- `src/utils/emailService.ts` - Email template functions
- `src/utils/borrowReturnLogger.ts` - Borrow transaction logging (includes reminder fields)
- `firebase.json` - Firebase configuration (updated with functions config)
