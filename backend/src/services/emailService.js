const nodemailer = require('nodemailer');

let cachedTransporter = null;

const isEmailEnabled = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  if (!isEmailEnabled()) {
    throw new Error('SMTP no configurado');
  }

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
};

const sendDonationAcceptedEmail = async ({ to, donationId, itemName, quantity, centerName, mintedTxId }) => {
  if (!to || !isEmailEnabled()) return;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Tu donación fue aceptada</h2>
      <p>Registramos y aceptamos parte de tu donación en Acción del Sur.</p>
      <ul>
        <li><strong>Donación #:</strong> ${donationId}</li>
        <li><strong>Ítem:</strong> ${itemName}</li>
        <li><strong>Cantidad aceptada:</strong> ${quantity}</li>
        <li><strong>Centro:</strong> ${centerName || 'N/A'}</li>
        <li><strong>TX blockchain:</strong> ${mintedTxId || 'Pendiente'}</li>
      </ul>
      <p>Podés seguir el estado desde tu QR de recepción.</p>
      <p style="font-size: 12px; color: #64748b;">Plataforma: ${frontendUrl}</p>
    </div>
  `;

  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to,
    subject: `Donación #${donationId} aceptada y registrada`,
    html,
  });
};

module.exports = {
  sendDonationAcceptedEmail,
};
