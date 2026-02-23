// 文件路径：/api/send-mail.js
const nodemailer = require('nodemailer');
const Busboy = require('busboy');

module.exports = async (req, res) => {
  // 设置 CORS 头（允许所有来源，生产环境建议替换为具体域名）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 仅允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 使用 busboy 解析 multipart/form-data
  const busboy = Busboy({ headers: req.headers });
  const fields = {};          // 存储普通字段
  const files = [];           // 存储所有上传的文件 { filename, buffer, mimetype, fieldname }

  busboy.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    const chunks = [];
    file.on('data', (data) => chunks.push(data));
    file.on('end', () => {
      files.push({
        fieldname,
        filename,
        mimetype,
        buffer: Buffer.concat(chunks),
      });
    });
  });

  busboy.on('finish', async () => {
    try {
      // 提取必要字段
      const { applicant, tmName, phone, contact, scheme, schemeName, finalTotal, withInvoice, type } = fields;

      // 简单校验：必须包含 PDF 文件（至少一个文件）
      if (!applicant || !tmName || files.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or PDF file' });
      }

      // 配置邮件 transporter（使用环境变量）
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // 构建邮件主题和正文
      const subject = type === 'order' ? '商标申请订单' : '商标代理服务合同';
      const text = `
        申请人：${applicant}
        商标名称：${tmName}
        联系电话：${phone || '未填写'}
        联系人：${contact || '未填写'}
        服务方案：${scheme}方案 · ${schemeName}
        应付总额：¥${finalTotal}
        发票类型：${withInvoice === 'true' ? '增值税专用发票' : '增值税普通发票'}
        附件为 ${type === 'order' ? '订单' : '合同'} PDF 及商标图样（如有），请查收。
      `;

      const html = `
        <h3>${subject}</h3>
        <p><strong>申请人：</strong>${applicant}</p>
        <p><strong>商标名称：</strong>${tmName}</p>
        <p><strong>联系电话：</strong>${phone || '未填写'}</p>
        <p><strong>联系人：</strong>${contact || '未填写'}</p>
        <p><strong>服务方案：</strong>${scheme}方案 · ${schemeName}</p>
        <p><strong>应付总额：</strong>¥${finalTotal}</p>
        <p><strong>发票类型：</strong>${withInvoice === 'true' ? '增值税专用发票' : '增值税普通发票'}</p>
        <p>附件为 ${type === 'order' ? '订单' : '合同'} PDF 及商标图样（如有），请查收。</p>
      `;

      // 构建附件列表
      const attachments = files.map(file => ({
        filename: file.filename,
        content: file.buffer,
        contentType: file.mimetype,
      }));

      // 邮件选项
      const mailOptions = {
        from: `"企优咨下单系统" <${process.env.SMTP_USER}>`,
        to: process.env.RECIPIENT_EMAIL,
        subject: `${subject} - ${applicant} - ${tmName}`,
        text,
        html,
        attachments,
      };

      // 发送邮件
      const info = await transporter.sendMail(mailOptions);
      console.log('邮件发送成功：', info.messageId);
      return res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
      console.error('邮件发送失败：', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
  });

  // 将请求流传递给 busboy
  req.pipe(busboy);
};
