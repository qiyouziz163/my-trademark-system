const nodemailer = require('nodemailer');
const multiparty = require('multiparty');

module.exports = async (req, res) => {
    // 只允许 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 解析 multipart/form-data（包含文件）
        const form = new multiparty.Form();
        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        // 提取表单字段
        const type = fields.type?.[0];
        const applicant = fields.applicant?.[0];
        const tmName = fields.tmName?.[0];
        const phone = fields.phone?.[0] || '';
        const contact = fields.contact?.[0] || '';
        const scheme = fields.scheme?.[0];
        const schemeName = fields.schemeName?.[0];
        const finalTotal = fields.finalTotal?.[0];
        const withInvoice = fields.withInvoice?.[0] === 'true';

        // 提取 PDF 文件
        const pdfFile = files.pdf?.[0];
        if (!pdfFile) {
            return res.status(400).json({ error: 'PDF 文件缺失' });
        }

        // 提取图片文件（可选）
        const imageFile = files.image?.[0];

        // 创建邮件 transporter（使用 QQ 邮箱 SMTP）
        const transporter = nodemailer.createTransport({
            host: 'smtp.qq.com',
            port: 465,
            secure: true, // 使用 SSL
            auth: {
                user: process.env.MAIL_USER,      // 你的发件人邮箱（如你的QQ邮箱）
                pass: process.env.MAIL_PASS       // 你的邮箱授权码（不是登录密码）
            }
        });

        // 构建邮件内容
        const mailSubject = type === 'order' ? '商标申请订单' : '商标代理服务合同';
        const mailText = `
            申请人：${applicant}
            商标名称：${tmName}
            联系电话：${phone}
            联系人：${contact}
            服务方案：${scheme} - ${schemeName}
            总金额：${finalTotal} 元
            发票类型：${withInvoice ? '增值税专用发票' : '增值税普通发票'}
        `;

        // 附件列表
        const attachments = [
            {
                filename: pdfFile.originalFilename,
                content: pdfFile
            }
        ];
        if (imageFile) {
            attachments.push({
                filename: imageFile.originalFilename,
                content: imageFile
            });
        }

        // 发送邮件
        await transporter.sendMail({
            from: `"企优咨系统" <${process.env.MAIL_USER}>`,
            to: '1816218417@qq.com',  // 接收邮件的固定邮箱
            subject: mailSubject,
            text: mailText,
            attachments: attachments
        });

        res.status(200).json({ success: true, message: '邮件发送成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};