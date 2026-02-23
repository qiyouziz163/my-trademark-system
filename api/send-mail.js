// 文件路径：/api/send-mail.js （在 Vercel 项目中）
const nodemailer = require('nodemailer');

// 允许的域名列表（可自行修改）
const allowedOrigins = [
  'https://qiyouziz163.github.io',  // 您的 GitHub Pages 域名
  'https://qiyouziz163.github.io/my-trademark-system/',  // 您的 GitHub Pages 域名
  'http://localhost:3000',           // 本地开发调试用
  // 如有其他前端域名，继续添加
];

module.exports = async (req, res) => {
  // 获取请求来源
  const origin = req.headers.origin;

  // 设置 CORS 头
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // 如果来源不在列表中，默认允许所有（可根据需求调整）
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
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

  try {
    // 解析请求体（假设是 JSON 格式）
    const { name, email, message } = req.body;

    // 简单校验
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 配置邮件 transporter（使用环境变量）
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,       // 例如 smtp.gmail.com
      port: process.env.SMTP_PORT || 587,
      secure: false,                     // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,     // 邮箱账号
        pass: process.env.SMTP_PASS,     // 邮箱密码或应用专用密码
      },
    });

    // 邮件内容
    const mailOptions = {
      from: `"${name}" <${email}>`,      // 发件人
      to: process.env.RECIPIENT_EMAIL,   // 收件人（您的邮箱）
      subject: `新消息来自 ${name}`,
      text: message,
      html: `<p><strong>姓名：</strong> ${name}</p>
             <p><strong>邮箱：</strong> ${email}</p>
             <p><strong>消息：</strong> ${message}</p>`,
    };

    // 发送邮件
    const info = await transporter.sendMail(mailOptions);
    console.log('邮件发送成功：', info.messageId);

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('邮件发送失败：', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};
