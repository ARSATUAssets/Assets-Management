const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { sendBorrowEmail } = require('./mailer');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // รองรับไฟล์ PDF ขนาดใหญ่

// API Endpoint สำหรับรับคำขอส่งอีเมล
app.post('/api/send-email', async (req, res) => {
    try {
        const { email, name, requestCode, pdfBase64, uploadLink } = req.body;
        
        // แปลง Base64 กลับเป็น Buffer ของไฟล์ PDF
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');

        // สั่งส่งอีเมล
        const result = await sendBorrowEmail(email, name, requestCode, pdfBuffer, uploadLink);
        
        if (result.success) {
            res.json({ success: true, message: 'ส่งอีเมลสำเร็จ' });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// นำเข้า nodemailer (ถ้ามีอยู่แล้วไม่ต้องนำเข้าซ้ำ)
// ... โค้ดเดิม ...

app.post('/api/send-approved-email', async (req, res) => {
    try {
        const { email, name, requestCode, coordName, coordPhone, coordLine } = req.body;
        
        const transporter = require('nodemailer').createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        const mailOptions = {
            from: '"ชุมนุมค่ายอาสาพัฒนาชนบท มธ." <no-reply@arsatu.com>',
            to: email,
            subject: `[${requestCode}] 🎉 คำขอยืมพัสดุอุปกรณ์ได้รับการอนุมัติแล้ว`,
            html: `
                <div style="font-family: 'Kanit', sans-serif; color: #333; max-width: 600px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <h2 style="color: #16a34a; margin-top: 0;">✅ คำขอของคุณผ่านการอนุมัติแล้ว</h2>
                    <p>สวัสดีคุณ <b>${name}</b>,</p>
                    <p>รหัสคำขอ: <b>${requestCode}</b> ได้รับการอนุมัติจากหัวหน้าฝ่ายเรียบร้อยแล้ว</p>
                    <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0;"><b>กรุณาติดต่อผู้ประสานงานตามช่องทางด้านล่าง เพื่อนัดหมายรับ-คืนของ:</b></p>
                        <p style="margin: 0; color: #15803d;">👤 ชื่อ: ${coordName}</p>
                        <p style="margin: 0; color: #15803d;">📞 โทร: ${coordPhone}</p>
                        <p style="margin: 0; color: #15803d;">💬 Line ID: ${coordLine}</p>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'ส่งอีเมลแจ้งผลสำเร็จ' });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});