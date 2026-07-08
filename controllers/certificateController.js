// controllers/certificateController.js
const puppeteer   = require('puppeteer');
const Certificate = require('../models/Certificate');
const Donor       = require('../models/Donor');

function generateCertificateId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RC-${date}-${rand}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

function buildCertificateHTML(cert) {
  const donationDate = formatDate(cert.donatedAt);
  const issuedDate   = formatDate(cert.issuedAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Blood Donation Certificate</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Lato:wght@300;400;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:297mm; height:210mm; overflow:hidden; }
    body { font-family:'Lato',sans-serif; background:#fff; display:flex; align-items:center; justify-content:center; }
    .certificate-wrapper { width:277mm; height:190mm; background:#fff; border:2px solid #c0392b; border-radius:4px; position:relative; overflow:hidden; display:flex; flex-direction:column; }
    .certificate-wrapper::before, .certificate-wrapper::after { content:''; position:absolute; width:60px; height:60px; border-color:#c0392b; border-style:solid; }
    .certificate-wrapper::before { top:10px; left:10px; border-width:3px 0 0 3px; }
    .certificate-wrapper::after  { bottom:10px; right:10px; border-width:0 3px 3px 0; }
    .inner-border { margin:8px; border:1px solid #e8c4c0; border-radius:2px; position:relative; flex:1; display:flex; flex-direction:column; }
    .inner-border::before, .inner-border::after { content:''; position:absolute; width:40px; height:40px; border-color:#e74c3c; border-style:solid; }
    .inner-border::before { top:8px; left:8px; border-width:2px 0 0 2px; }
    .inner-border::after  { bottom:8px; right:8px; border-width:0 2px 2px 0; }
    .cert-header { background:linear-gradient(135deg,#c0392b 0%,#e74c3c 50%,#c0392b 100%); padding:18px 40px 14px; text-align:center; flex-shrink:0; }
    .cert-header .org-name { font-family:'Playfair Display',serif; font-size:13px; font-weight:700; letter-spacing:6px; text-transform:uppercase; color:rgba(255,255,255,0.85); margin-bottom:6px; }
    .cert-header .cert-title { font-family:'Playfair Display',serif; font-size:36px; font-weight:900; color:#fff; letter-spacing:2px; line-height:1.1; }
    .cert-header .cert-subtitle { font-size:12px; color:rgba(255,255,255,0.75); letter-spacing:4px; text-transform:uppercase; margin-top:6px; }
    .blood-icon { font-size:28px; margin-bottom:4px; display:block; }
    .cert-body { padding:16px 60px 12px; text-align:center; position:relative; z-index:1; flex:1; }
    .cert-body .presented-to { font-size:13px; letter-spacing:3px; text-transform:uppercase; color:#999; margin-bottom:8px; }
    .cert-body .donor-name { font-family:'Playfair Display',serif; font-size:36px; font-weight:700; color:#c0392b; border-bottom:2px solid #f0d0ce; padding-bottom:8px; margin-bottom:12px; display:inline-block; min-width:400px; }
    .cert-body .recognition-text { font-size:13px; color:#555; line-height:1.6; max-width:580px; margin:0 auto 12px; }
    .cert-body .recognition-text strong { color:#c0392b; font-weight:700; }
    .cert-details { display:flex; justify-content:center; gap:0; margin:12px 0; border:1px solid #f0d0ce; border-radius:8px; overflow:hidden; }
    .cert-detail-item { flex:1; padding:16px 20px; text-align:center; border-right:1px solid #f0d0ce; }
    .cert-detail-item:last-child { border-right:none; }
    .detail-label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#aaa; margin-bottom:6px; }
    .detail-value { font-size:16px; font-weight:700; color:#333; }
    .detail-value.blood-group { font-size:22px; color:#c0392b; font-family:'Playfair Display',serif; }
    .cert-divider { display:flex; align-items:center; gap:12px; margin:10px 0; }
    .cert-divider::before, .cert-divider::after { content:''; flex:1; height:1px; background:linear-gradient(to right,transparent,#e8c4c0,transparent); }
    .cert-divider span { font-size:18px; }
    .cert-footer { display:flex; justify-content:space-between; align-items:flex-end; padding:10px 60px 16px; border-top:1px solid #f5f5f5; position:relative; z-index:1; flex-shrink:0; }
    .signature-block { text-align:center; }
    .signature-line { width:160px; border-bottom:2px solid #333; margin-bottom:6px; }
    .signature-label { font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#888; }
    .cert-id-block { text-align:center; }
    .cert-id-label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#aaa; margin-bottom:4px; }
    .cert-id-value { font-size:13px; font-weight:700; color:#c0392b; font-family:monospace; letter-spacing:1px; }
    .issued-date { font-size:12px; color:#aaa; margin-top:4px; }
    .watermark { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg); font-family:'Playfair Display',serif; font-size:90px; font-weight:900; color:rgba(192,57,43,0.04); white-space:nowrap; pointer-events:none; z-index:0; letter-spacing:8px; }
  </style>
</head>
<body>
  <div class="certificate-wrapper">
    <div class="inner-border">
      <div class="watermark">REDCONNECT</div>
      <div class="cert-header">
        <span class="blood-icon">🩸</span>
        <div class="org-name">RedConnect Blood Donation Platform</div>
        <div class="cert-title">Certificate of Appreciation</div>
        <div class="cert-subtitle">Blood Donation Recognition</div>
      </div>
      <div class="cert-body">
        <div class="presented-to">This certificate is proudly presented to</div>
        <div class="donor-name">${cert.donorName}</div>
        <p class="recognition-text">
          In sincere recognition and heartfelt appreciation for your noble act of
          <strong>donating blood</strong> and contributing to the mission of saving lives.
          Your generosity and compassion make a profound difference in our community.
        </p>
        <div class="cert-divider"><span>🩸</span></div>
        <div class="cert-details">
          <div class="cert-detail-item">
            <div class="detail-label">Blood Group</div>
            <div class="detail-value blood-group">${cert.bloodGroup}</div>
          </div>
          <div class="cert-detail-item">
            <div class="detail-label">Donation Date</div>
            <div class="detail-value">${donationDate}</div>
          </div>
          <div class="cert-detail-item">
            <div class="detail-label">Hospital</div>
            <div class="detail-value">${cert.hospital}</div>
          </div>
          <div class="cert-detail-item">
            <div class="detail-label">City</div>
            <div class="detail-value">${cert.city}</div>
          </div>
        </div>
        <p class="recognition-text" style="font-size:13px;color:#888;margin-top:16px;">
          "Every drop of blood donated is a gift of life. Thank you for being a hero."
        </p>
      </div>
      <div class="cert-footer">
        <div class="signature-block">
          <div class="signature-line"></div>
          <div class="signature-label">Authorized Signatory</div>
          <div class="signature-label" style="color:#c0392b;font-weight:700;margin-top:2px;">RedConnect</div>
        </div>
        <div class="cert-id-block">
          <div class="cert-id-label">Certificate ID</div>
          <div class="cert-id-value">${cert.certificateId}</div>
          <div class="issued-date">Issued: ${issuedDate}</div>
        </div>
        <div class="signature-block">
          <div class="signature-line"></div>
          <div class="signature-label">Medical Verification</div>
          <div class="signature-label" style="color:#27ae60;font-weight:700;margin-top:2px;">Verified ✓</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Called by adminController.verifyRequestDonor after marking request completed
exports.createCertificate = async ({ donor, user, request }) => {
  const certificateId = generateCertificateId();
  console.log('[CERT] Creating certificate for donor:', donor._id, 'user:', user, 'request:', request._id);
  const cert = await Certificate.create({
    certificateId,
    donor:      donor._id,
    user:       user || undefined,
    request:    request._id,
    donorName:  donor.name,
    bloodGroup: donor.bloodGroup || request.bloodGroupRequired,
    hospital:   request.hospitalName,
    city:       request.city,
    donatedAt:  new Date()
  });
  console.log('[CERT] Saved:', cert._id, cert.certificateId);
  return cert;
};

// GET /generate-certificate/:id
exports.generateCertificate = async (req, res) => {
  let browser;
  try {
    const cert = await Certificate.findById(req.params.id).lean();
    if (!cert) return res.status(404).send('Certificate not found.');

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());
    const isAdmin = adminEmails.includes(req.user?.email);
    const isOwner = cert.user && cert.user.toString() === req.user?._id?.toString();
    if (!isAdmin && !isOwner) {
      return res.status(403).send('Access denied.');
    }

    const html = buildCertificateHTML(cert);

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      width: '297mm',
      height: '210mm',
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="RedConnect-Certificate-${cert.certificateId}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('Certificate generation error:', err.message);
    res.status(500).send('Failed to generate certificate.');
  }
};
