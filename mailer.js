const nodemailer = require('nodemailer');
const path = require('path'); // เพิ่ม path เพื่อใช้อ้างอิงที่อยู่ไฟล์
require('dotenv').config();

// 1. ตั้งค่าการเชื่อมต่อ Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 2. ฟังก์ชันส่งอีเมลพร้อมแนบไฟล์ PDF (2 ไฟล์)
async function sendBorrowEmail(recipientEmail, borrowerName, requestCode, pdfBuffer, uploadLink) {
    const mailOptions = {
        from: '"ชุมนุมค่ายอาสาพัฒนาชนบท มธ." <no-reply@arsatu.com>',
        to: recipientEmail,
        subject: `[${requestCode}] เอกสารคำขอยืมพัสดุอุปกรณ์ - ชุมนุมค่ายอาสาฯ มธ.`,
        html: `
            <div style="font-family: 'Kanit', sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                <h2 style="color: #4f46e5; margin-top: 0;">🏕️ ระบบยืม-คืน ทรัพย์สิน ARSATU</h2>
                <p>สวัสดีคุณ <b>${borrowerName}</b>,</p>
                <p>ระบบได้รับคำขอยืมพัสดุอุปกรณ์ของคุณเรียบร้อยแล้ว หมายเลขคำขอของคุณคือ: <b style="color: #4f46e5; font-family: monospace;">${requestCode}</b></p>
                
                <p>เราได้แนบเอกสารใบขอยืม (PDF) มาพร้อมกับอีเมลฉบับนี้ กรุณาดาวน์โหลดและลงนามให้เรียบร้อย ก่อนส่งกลับมาเพื่อยืนยันคำขอยืม</p>
                <p>ทั้งนี้เราได้แนบเอกสารเปล่าไว้ในกรณีที่ข้อมูลไม่ถูกต้องหรือต้องการแก้ไข</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${uploadLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2);">
                        📤 คลิกที่นี่เพื่ออัปโหลดเอกสารที่เซ็นแล้ว
                    </a>
                </div>
                
                <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px;">หากมีข้อสงสัยกรุณาติดต่อผู้ประสานงานของชุมนุมฯ<br>อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ</p>
            </div>
        `,
        attachments: [
            // ไฟล์ที่ 1: ไฟล์ PDF ที่กรอกข้อมูลแล้ว (จาก Buffer)
            {
                filename: `ใบขอยืมอุปกรณ์_${requestCode}.pdf`,
                content: pdfBuffer
            },
            // ไฟล์ที่ 2: ไฟล์ PDF ฟอร์มเปล่าต้นฉบับ (อ่านไฟล์ตรงๆ จากเซิร์ฟเวอร์)
            {
                filename: 'แบบฟอร์มเปล่า_arsaTU.pdf',
                // *หมายเหตุ: หาก template.pdf ของคุณไม่ได้อยู่ในโฟลเดอร์ user ให้เปลี่ยนชื่อโฟลเดอร์ตรงคำว่า 'user' ด้านล่างนี้ครับ
                path: path.join(__dirname, 'user', 'template.pdf') 
            }
        ]
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return { success: true };
    } catch (error) {
        console.error('Error sending email: ', error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendBorrowEmail };