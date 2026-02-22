const nodemailer = require('nodemailer');
const Busboy = require('busboy');

// 邮箱配置：从环境变量读取，绝不硬编码在代码中
const PRIMARY_EMAIL = {
  user: process.env.QQ_MAIL_USER,
  pass: process.env.QQ_MAIL_PASS
};
const BACKUP_EMAIL = {
  // 修正环境变量名，与 Vercel 中设置的保持一致
  user: process.env.MAIL_163_USER,
  pass: process.env.MAIL_163_PASS
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
  res.setHeader('Access-Control-Allow-Origin', 'https://qiyouziz163.github.io/my-trademark-system');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 发送邮件并设置超时（10 秒）
function sendWithTimeout(transporter, mailOptions, timeout = 10000) {
  return Promise.race([
    transporter.sendMail(mailOptions),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('邮件发送超时')), timeout)
    )
  ]);
}

module.exports = async (req, res) => {
  console.log(`[${new Date().toISOString()}] 收到请求，方法：${req.method}`);
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    console.log('处理 OPTIONS 预检请求');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('方法不允许：', req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 解析 multipart/form-data
  const busboy = Busboy({ headers: req.headers });
  const fields = {};
  const files = {};

  console.log('开始解析 multipart 数据...');
  await new Promise((resolve, reject) => {
    busboy.on('field', (fieldname, val) => {
      console.log(`解析字段：${fieldname} = ${val.substring(0, 50)}${val.length > 50 ? '...' : ''}`);
      fields[fieldname] = val;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      console.log(`接收文件：${fieldname} -> ${filename} (${mimeType})`);
      const chunks = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        files[fieldname] = {
          filename,
          mimeType,
          buffer: Buffer.concat(chunks)
        };
        console.log(`文件接收完成：${filename}，大小：${files[fieldname].buffer.length} 字节`);
      });
    });

    busboy.on('finish', () => {
      console.log('multipart 数据解析完成');
      resolve();
    });
    busboy.on('error', (err) => {
      console.error('multipart 解析错误：', err);
      reject(err);
    });

    req.pipe(busboy);
  });

  const { type, applicant, tmName, phone, contact, scheme, schemeName, finalTotal, withInvoice } = fields;
  console.log('字段提取：', { type, applicant, tmName, phone, contact, scheme, schemeName, finalTotal, withInvoice });

  try {
    // 准备附件
    const attachments = [];

    if (files.pdf) {
      attachments.push({
        filename: files.pdf.filename,
        content: files.pdf.buffer,
        contentType: files.pdf.mimeType
      });
      console.log('添加 PDF 附件：', files.pdf.filename);
    }

    if (files.image) {
      attachments.push({
        filename: files.image.filename,
        content: files.image.buffer,
        contentType: files.image.mimeType
      });
      console.log('添加图片附件：', files.image.filename);
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

    console.log('开始尝试发送邮件（主邮箱）...');
    let transporter;
    try {
      transporter = createTransporter(true);
      await sendWithTimeout(transporter, mailOptions);
      console.log('主邮箱发送成功');
    } catch (primaryErr) {
      console.warn('主邮箱发送失败或超时：', primaryErr.message);
      console.log('尝试使用备用邮箱...');
      transporter = createTransporter(false);
      mailOptions.from = `"企优咨系统" <${BACKUP_EMAIL.user}>`;
      await sendWithTimeout(transporter, mailOptions);
      console.log('备用邮箱发送成功');
    }

    console.log('邮件发送流程完成，返回成功响应');
    res.status(200).json({ success: true, message: '邮件已发送' });
  } catch (error) {
    console.error('发送邮件最终失败：', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
};

// 禁用 Vercel 默认的 bodyParser
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
