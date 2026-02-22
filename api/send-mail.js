const nodemailer = require('nodemailer');
const Busboy = require('busboy');

// 邮箱配置：从环境变量读取，绝不硬编码在代码中
const PRIMARY_EMAIL = {
  user: process.env.QQ_MAIL_USER,
  pass: process.env.QQ_MAIL_PASS
};
const BACKUP_EMAIL = {
  user: process.env['163_MAIL_USER'],
  pass: process.env['163_MAIL_PASS']
};

// 创建邮件传输器
function createTransporter(primary = true) {
  const config = primary ? PRIMARY_EMAIL : BACKUP_EMAIL;
  if (!config.user || !config.pass) {
    throw new Error(`邮箱配置缺失：${primary ? '主' : '备用'}邮箱`);
  }
  const options = {
    host: primary ? 'smtp.qq.com' : 'smtp.163.com',
    port: primary ? 587 : 465,
    secure: !primary, // 163 使用 SSL
    auth: { user: config.user, pass: config.pass }
  };
  return nodemailer.createTransport(options);
}

// 设置 CORS 头（允许 GitHub Pages 访问）
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://qiyouziz163.github.io'); // 替换为您的 GitHub Pages 域名
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 解析 multipart/form-data
  const busboy = Busboy({ headers: req.headers });
  const fields = {};
  const files = {};

  await new Promise((resolve, reject) => {
    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        files[fieldname] = {
          filename,
          mimeType,
          buffer: Buffer.concat(chunks)
        };
      });
    });

    busboy.on('finish', resolve);
    busboy.on('error', reject);

    req.pipe(busboy);
  });

  const { type, applicant, tmName, phone, contact, scheme, schemeName, finalTotal, withInvoice } = fields;

  try {
    // 准备附件
    const attachments = [];

    if (files.pdf) {
      attachments.push({
        filename: files.pdf.filename,
        content: files.pdf.buffer,
        contentType: files.pdf.mimeType
      });
    }

    if (files.image) {
      attachments.push({
        filename: files.image.filename,
        content: files.image.buffer,
        contentType: files.image.mimeType
      });
    }

    // 邮件正文（简要信息）
    const mailBody = `
      <h2>商标申请${type === 'order' ? '订单' : '合同'}</h2>
      <p><strong>申请人全称：</strong>${applicant}</p>
      <p><strong>商标名称：</strong>${tmName}</p>
      <p><strong>联系人：</strong>${contact || '未填写'}</p>
      <p><strong>联系电话：</strong>${phone || '未填写'}</p>
      <p><strong>服务方案：</strong>${scheme}方案 · ${schemeName}</p>
      <p><strong>费用总额：</strong>¥${parseFloat(finalTotal).toFixed(2)}</p>
      <p><strong>发票类型：</strong>${withInvoice === 'true' ? '专票' : '普票'}</p>
      <hr>
      <p>本邮件由系统自动发送，请查收附件。</p>
    `;

    const mailOptions = {
      from: `"企优咨系统" <${PRIMARY_EMAIL.user}>`,
      to: PRIMARY_EMAIL.user, // 发送给自己
      subject: `商标申请${type === 'order' ? '订单' : '合同'} - ${applicant} - ${tmName}`,
      html: mailBody,
      attachments
    };

    // 尝试主邮箱，失败则用备用
    let transporter;
    try {
      transporter = createTransporter(true);
      await transporter.sendMail(mailOptions);
    } catch (primaryErr) {
      console.warn('主邮箱发送失败，尝试备用', primaryErr);
      transporter = createTransporter(false);
      mailOptions.from = `"企优咨系统" <${BACKUP_EMAIL.user}>`;
      await transporter.sendMail(mailOptions);
    }

    res.status(200).json({ success: true, message: '邮件已发送' });
  } catch (error) {
    console.error('发送邮件失败:', error);
    res.status(500).json({ error: error.message });
  }
};

// 禁用 Vercel 默认的 bodyParser
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
