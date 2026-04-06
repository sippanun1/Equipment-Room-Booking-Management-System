import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// Initialize Firebase Admin
initializeApp();
const db = getFirestore();
// Helper function to send email via mail collection
async function sendBorrowReturnReminderEmail(userEmail, userName, equipmentNames, expectedReturnTime) {
    try {
        await db.collection('mail').add({
            to: userEmail,
            message: {
                subject: `🔔 เตือนการคืนอุปกรณ์ - วันนี้เวลา ${expectedReturnTime} น.`,
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <p>${userName}</p>
            
            <p>ขอแจ้งเตือนว่า อุปกรณ์ที่ยืมจะครบกำหนดส่งคืนในเวลา <strong>${expectedReturnTime}</strong>น. วันนี้</p>
            
            <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
              <p><strong>อุปกรณ์ที่ยืม:</strong></p>
              <ul>
                ${equipmentNames.map(name => `<li>${name}</li>`).join('')}
              </ul>
            </div>
            
            <p>กรุณาดำเนินการส่งคืนตามเวลาที่กำหนด เพื่อให้ผู้อื่นสามารถใช้งานต่อได้อย่างสะดวก กรุณาวางเก็บเข้าที่เดิม</p>
            
            <p>หากคุณได้ดำเนินการคืนเรียบร้อยแล้ว สามารถละเว้นข้อความนี้ได้</p>
            
            <p>ขอบคุณครับ/ค่ะ</p>
          </div>
        `
            }
        });
        return true;
    }
    catch (error) {
        console.error('Error sending reminder email:', error);
        return false;
    }
}
// Scheduled function to send reminder emails 30 minutes before return time
export const sendBorrowReturnReminders = onSchedule('every 5 minutes', async (context) => {
    try {
        const now = new Date();
        const thirtyMinutesLater = new Date(now.getTime() + 30 * 60 * 1000);
        // Format times for comparison (HH:mm format)
        const currentHour = String(now.getHours()).padStart(2, '0');
        const currentMinute = String(now.getMinutes()).padStart(2, '0');
        const currentTimeString = `${currentHour}:${currentMinute}`;
        const targetHour = String(thirtyMinutesLater.getHours()).padStart(2, '0');
        const targetMinute = String(thirtyMinutesLater.getMinutes()).padStart(2, '0');
        const targetTimeString = `${targetHour}:${targetMinute}`;
        // Get today's date in YYYY-MM-DD format
        const todayDate = now.toISOString().split('T')[0];
        // Query for active borrows where:
        // 1. expectedReturnDate is today
        // 2. expectedReturnTime is 30 minutes from now
        // 3. Reminder has not been sent yet (reminderSent field is false or absent)
        const borrowsSnapshot = await db
            .collection('borrowHistory')
            .where('status', '==', 'borrowed')
            .where('expectedReturnDate', '==', todayDate)
            .where('expectedReturnTime', '==', targetTimeString)
            .where('reminderSent', '==', false)
            .get();
        console.log(`Found ${borrowsSnapshot.docs.length} borrows needing reminders`);
        const results = [];
        for (const doc of borrowsSnapshot.docs) {
            const borrowData = doc.data();
            // Extract equipment names
            const equipmentNames = borrowData.equipmentItems
                ? borrowData.equipmentItems.map((item) => `${item.equipmentName} (${item.quantityBorrowed} ชิ้น)`)
                : [];
            // Send email
            const emailSent = await sendBorrowReturnReminderEmail(borrowData.userEmail, borrowData.userName, equipmentNames, borrowData.expectedReturnTime);
            if (emailSent) {
                // Mark reminder as sent
                await db.collection('borrowHistory').doc(doc.id).update({
                    reminderSent: true,
                    reminderSentAt: FieldValue.serverTimestamp()
                });
                results.push({
                    borrowId: doc.id,
                    status: 'success',
                    userEmail: borrowData.userEmail,
                    userName: borrowData.userName
                });
                console.log(`✅ Reminder sent for borrow ${doc.id}`);
            }
            else {
                results.push({
                    borrowId: doc.id,
                    status: 'failed',
                    userEmail: borrowData.userEmail
                });
                console.error(`❌ Failed to send reminder for borrow ${doc.id}`);
            }
        }
        console.log('Reminder email task completed', { results });
    }
    catch (error) {
        console.error('Error in sendBorrowReturnReminders:', error);
    }
});
