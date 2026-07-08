// services/emailService.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Ensure scratch directory exists for local testing
const scratchDir = path.join(__dirname, '../scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

const logFilePath = path.join(scratchDir, 'sent_emails.log');

let transporter = null;
let transporterReady = false;
let transporterError = null;

function isSmtpConfigured() {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  return Boolean(user && pass);
}

async function getTransporter() {
  if (transporterReady) return transporter;
  transporterReady = true;

  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.warn(
      '\n⚠️  EMAIL: SMTP not configured — messages are ONLY saved to scratch/sent_emails.log.\n' +
      '   Add to .env (Gmail App Password): SMTP_USER=you@gmail.com  SMTP_PASS=16-char-app-password\n' +
      '   Create app password: https://myaccount.google.com/apppasswords\n'
    );
    return null;
  }

  const useGmail = process.env.SMTP_SERVICE === 'gmail' ||
    user.includes('@gmail.') ||
    (process.env.SMTP_HOST || '').includes('gmail');

  try {
    if (useGmail && !process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
      });
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_PORT === '465',
        auth: { user, pass }
      });
    }
    await transporter.verify();
    console.log(`✅ [EMAIL] SMTP ready (${user})`);
  } catch (err) {
    transporter = null;
    transporterError = err.message;
    console.error(`❌ [EMAIL] SMTP setup failed: ${err.message}`);
    console.error('   For Gmail use an App Password, not your normal login password.');
  }

  return transporter;
}

/**
 * Log email to local file for development verification
 */
function logEmailLocally(to, subject, text, html) {
  const timestamp = new Date().toISOString();
  const logContent = `
========================================
TIMESTAMP: ${timestamp}
TO: ${to}
SUBJECT: ${subject}
----------------------------------------
TEXT CONTENT:
${text}
----------------------------------------
HTML CONTENT:
${html}
========================================
\n`;
  fs.appendFileSync(logFilePath, logContent, 'utf8');
  console.log(`\n📧 [EMAIL SIMULATION] Email written to log. To: ${to} | Subject: ${subject}`);
}

function isValidEmailAddress(value) {
  const email = (value || '').toString().trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Core send helper
 */
async function sendMail({ to, subject, text, html }) {
  const recipient = (to || '').toString().trim();

  if (!recipient) {
    console.warn('⚠️  [EMAIL] Skipped — no recipient address');
    return null;
  }

  if (!isValidEmailAddress(recipient)) {
    console.warn(`⚠️  [EMAIL] Skipped — invalid recipient address: ${recipient}`);
    return null;
  }

  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const from = process.env.SMTP_FROM || (user ? `RedConnect <${user}>` : 'RedConnect <no-reply@redconnect.org>');

  logEmailLocally(recipient, subject, text, html);

  const transport = await getTransporter();
  if (!transport) {
    console.warn(`⚠️  [EMAIL] Not delivered to ${recipient} — configure SMTP in .env (see scratch/sent_emails.log)`);
    return { loggedOnly: true, to: recipient };
  }

  try {
    const info = await transport.sendMail({ from, to: recipient, subject, text, html });
    console.log(`✅ [EMAIL] Sent to ${recipient} | Subject: ${subject}`);
    return info;
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send to ${recipient}:`, error.message);
    throw error;
  }
}

/**
 * Confirmation to requester after submitting a blood request
 */
async function sendRequestSubmittedMail(request, matchesUrl) {
  const to = request.requesterEmail;
  const subject = `🩸 Blood request received for ${request.patientName}`;

  const text = `Dear ${request.contactName || 'Requester'},

Your blood request has been submitted successfully.

Patient: ${request.patientName}
Blood group needed: ${request.bloodGroupRequired}
Hospital: ${request.hospitalName}, ${request.city}
Urgency: ${request.emergencyLevel}

Track matched donors here:
${matchesUrl}

We will email you again when a donor confirms they are healthy and ready to donate.

RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#c0392b;">Blood request received</h2>
      <p>Dear <strong>${request.contactName || 'Requester'}</strong>,</p>
      <p>Your request for <strong>${request.patientName}</strong> (${request.bloodGroupRequired}) at <strong>${request.hospitalName}</strong> is active.</p>
      <p><a href="${matchesUrl}" style="background:#e74c3c;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;">View matched donors</a></p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

/**
 * Notifies requester when a compatible donor has been found.
 */
async function sendRequestMatchedMail(request, visitTime, donorCount) {
  const to = request.requesterEmail;
  if (!to) return null;

  const when = visitTime ? formatWhen(visitTime) : null;
  const donorLabel = donorCount === 1 ? '1 compatible donor' : `${donorCount} compatible donors`;
  const subject = `🤝 ${donorLabel} found for ${request.patientName}`;

  const text = `Dear ${request.contactName || 'Requester'},

Good news! We found ${donorLabel} for ${request.patientName}.

${when ? `Screening visit time: ${when}
` : ''}Hospital: ${request.hospitalName}, ${request.city}
Blood group needed: ${request.bloodGroupRequired}

We have emailed the donor(s) to come for screening. You can track the request from your requester dashboard.

RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#2980b9,#1a5276);color:white;padding:18px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="margin:0;">Compatible donor found</h2>
      </div>
      <div style="padding:22px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;line-height:1.6;color:#333;">
        <p>Dear <strong>${request.contactName || 'Requester'}</strong>,</p>
        <p>We found <strong>${donorLabel}</strong> for <strong>${request.patientName}</strong>.</p>
        <p style="background:#f0f8ff;padding:14px;border-radius:8px;">
          <strong>Hospital:</strong> ${request.hospitalName}, ${request.city}<br>
          <strong>Blood group:</strong> ${request.bloodGroupRequired}${when ? `<br><strong>Screening time:</strong> ${when}` : ''}
        </p>
        <p>We have emailed the donor(s) to come for screening. Please watch your requester dashboard for updates.</p>
      </div>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

/**
 * Send screening instructions to assigned donor
 */
async function sendScreeningMail(donor, request) {
  const to = donor.email;
  const subject = `🚨 Action Required: Blood Donation Screening for ${request.patientName}`;
  
  const text = `Dear ${donor.name},

You have been assigned as a donor for an emergency blood request.

Details:
- Patient Name: ${request.patientName}
- Blood Group Required: ${request.bloodGroupRequired}
- Hospital: ${request.hospitalName}
- Location: ${request.city}
- Urgency: ${request.emergencyLevel}

Please visit the hospital as soon as possible for the screening process. You will need to mention that you are donating for patient "${request.patientName}".

Thank you for your valuable support. Your contribution saves lives!

Best regards,
RedConnect Emergency Response Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">🩸 RedConnect Blood Donation</h2>
      </div>
      <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>You have been assigned as a donor for an emergency blood request. Please review the details below:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr style="background-color: #f9f9f9;">
            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Patient Name:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${request.patientName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Blood Group:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="background-color: #ffebee; color: #c0392b; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${request.bloodGroupRequired}</span></td>
          </tr>
          <tr style="background-color: #f9f9f9;">
            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Hospital:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${request.hospitalName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Location:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${request.city}</td>
          </tr>
          <tr style="background-color: #f9f9f9;">
            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Urgency:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">${request.emergencyLevel}</td>
          </tr>
        </table>
        
        <p style="background-color: #fff9e6; border-left: 4px solid #f39c12; padding: 12px; border-radius: 4px; font-weight: 500;">
          ⏳ <strong>Action Required:</strong> Please visit the hospital as soon as possible for the <strong>screening process</strong>. Please refer to patient <strong>"${request.patientName}"</strong> upon arrival.
        </p>
        
        <p>Thank you for your life-saving contribution!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">RedConnect &copy; 2026. This is an automated notification.</p>
      </div>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

/**
 * Send healthy & success verification email to donor and requester
 */
async function sendHealthyMail(donor, requesterEmail, request) {
  // 1. Email to Donor
  const donorSubject = `🎉 Thank you! Your donation has been verified!`;
  const donorText = `Dear ${donor.name},

We are happy to inform you that your blood donation for patient "${request.patientName}" has been verified! 

Our medical screening results confirm you are in good health. Your donation status has been updated to verified, and gamification points have been added to your donor dashboard.

You have made a huge impact today. Thank you for saving a life!

Best regards,
RedConnect Team`;

  const donorHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #2ecc71, #27ae60); color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">🎉 Donation Verified & Healthy!</h2>
      </div>
      <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>We are thrilled to let you know that your blood donation for <strong>${request.patientName}</strong> has been successfully verified.</p>
        
        <div style="background-color: #e8f8f5; border: 1px solid #2ecc71; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px;">🏆</span>
          <h3 style="margin: 10px 0 5px; color: #27ae60;">Declared Healthy & Fit</h3>
          <p style="margin: 0; font-size: 14px; color: #555;">Gamification points have been added to your profile.</p>
        </div>

        <p>You have made a life-saving impact. Thank you for your noble gesture!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">RedConnect &copy; 2026. This is an automated notification.</p>
      </div>
    </div>
  `;

  await sendMail({ to: donor.email, subject: donorSubject, text: donorText, html: donorHtml });

  // 2. Email to Requester
  if (requesterEmail) {
    const reqSubject = `🩸 Good News: Donor Verified for request "${request.patientName}"`;
    const reqText = `Dear Requester,

Good news! The donor (${donor.name}) assigned to your blood request for "${request.patientName}" at ${request.hospitalName} has completed the donation and has been verified as healthy/fit.

The blood request has now been successfully fulfilled and closed.

We hope the patient is recovering well. Thank you for using RedConnect.

Best regards,
RedConnect Team`;

    const reqHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">❤️ Blood Request Fulfilled!</h2>
        </div>
        <div style="padding: 20px; color: #333; line-height: 1.6;">
          <p>Dear Requester,</p>
          <p>We have wonderful news regarding your request for <strong>${request.patientName}</strong>:</p>
          
          <p style="background-color: #f0fff4; border-left: 4px solid #27ae60; padding: 12px; border-radius: 4px;">
            ✅ The matched donor, <strong>${donor.name}</strong>, has successfully donated blood and has been verified by our team.
          </p>
          
          <p>The blood request is now completed and closed. We wish the patient a speedy recovery.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">RedConnect &copy; 2026. This is an automated notification.</p>
        </div>
      </div>
    `;

    await sendMail({ to: requesterEmail, subject: reqSubject, text: reqText, html: reqHtml });
  }
}

/**
 * Direct verification email to donor when no specific request is tied
 */
async function sendHealthyMailOnlyDonor(donor, donation) {
  const subject = `🎉 Thank you! Your donation has been verified!`;
  const text = `Dear ${donor.name},

Your recent blood donation of group ${donation.bloodGroup} at ${donation.hospital} has been verified by the admin!

You have been declared healthy and fit, and gamification points have been added to your profile.

Thank you for your support!
RedConnect Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #2ecc71, #27ae60); color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">🎉 Donation Verified!</h2>
      </div>
      <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>Your blood donation of group <strong>${donation.bloodGroup}</strong> at <strong>${donation.hospital}</strong> has been verified by the administrator.</p>
        <p>You have been declared healthy/fit, and your points have been successfully awarded.</p>
        <p>Thank you for helping us save lives!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">RedConnect &copy; 2026. This is an automated notification.</p>
      </div>
    </div>
  `;

  await sendMail({ to: donor.email, subject, text, html });
}

function formatWhen(visitTime) {
  return visitTime.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Step 1 email — tells donor they are compatible and to open their dashboard to respond.
 * No confirm/decline link. Donor must log in and click Respond on the dashboard.
 */
async function sendDonorNotificationMail(donor, request, dashboardUrl) {
  const subject = `🩸 Blood needed — you are a compatible donor for ${request.patientName}`;

  const text = `Dear ${donor.name},

A patient needs blood and you are a compatible donor.

Patient: ${request.patientName}
Blood group needed: ${request.bloodGroupRequired}
Hospital: ${request.hospitalName}, ${request.city}
Urgency: ${request.emergencyLevel}

Please open your donor dashboard and click "Respond" on this request to let us know you are available.

${dashboardUrl}

If you respond, you will receive a screening appointment email with the date and time to visit the hospital.

RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:10px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:20px;text-align:center;">
        <h2 style="margin:0;">🩸 You are a compatible donor</h2>
      </div>
      <div style="padding:24px;color:#333;line-height:1.7;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>A patient needs <strong>${request.bloodGroupRequired}</strong> blood and your blood group is compatible.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff9f9;border-radius:8px;">
          <tr><td style="padding:10px;font-weight:bold;">Patient</td><td style="padding:10px;">${request.patientName}</td></tr>
          <tr style="background:#fff0f0;"><td style="padding:10px;font-weight:bold;">Blood group</td><td style="padding:10px;">${request.bloodGroupRequired}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Hospital</td><td style="padding:10px;">${request.hospitalName}, ${request.city}</td></tr>
          <tr style="background:#fff0f0;"><td style="padding:10px;font-weight:bold;">Urgency</td><td style="padding:10px;color:#e74c3c;font-weight:bold;">${request.emergencyLevel}</td></tr>
        </table>
        <p>To respond, open your donor dashboard and click <strong>"Respond"</strong> on this request.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${dashboardUrl}" style="background:#e74c3c;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Open My Dashboard</a>
        </p>
        <p style="font-size:13px;color:#888;">Once you respond, you will receive a screening appointment email with the date and time to visit the hospital for a doctor's examination.</p>
        <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026. This is an automated notification.</p>
      </div>
    </div>
  `;

  return sendMail({ to: donor.email, subject, text, html });
}

/**
 * Initial email — donor confirms they can come for doctor screening
 */
async function sendHealthCheckMail(donor, request, healthCheckUrl) {
  const to = donor.email;
  const subject = `🩸 Blood request match — please confirm your visit for ${request.patientName}`;

  const text = `Dear ${donor.name},

You are a compatible donor for an urgent blood request.

Patient: ${request.patientName}
Blood group: ${request.bloodGroupRequired}
Hospital: ${request.hospitalName}, ${request.city}

Please open the link below to confirm you can come to the hospital for a doctor's health examination (screening). After screening, our admin will verify you and send final donation instructions.

${healthCheckUrl}

RedConnect Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">Blood request — action needed</h2>
      </div>
      <div style="padding: 22px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>You matched patient <strong>${request.patientName}</strong> (${request.bloodGroupRequired}) at <strong>${request.hospitalName}</strong>.</p>
        <p>Confirm that you <strong>can visit the hospital for doctor screening</strong>. Final approval comes after the doctor examines you and admin verifies.</p>
        <p style="text-align: center; margin: 28px 0;">
          <a href="${healthCheckUrl}" style="background: #e74c3c; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Confirm hospital visit</a>
        </p>
        <p style="font-size: 13px; color: #888;">Link: ${healthCheckUrl}</p>
      </div>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

/**
 * After donor confirms visit — screening appointment only (not final clearance)
 */
async function sendDonorScreeningVisitMail(donor, request, visitTime) {
  const when = formatWhen(visitTime);
  const subject = `📅 Please come for doctor screening — ${request.hospitalName}`;

  const text = `Dear ${donor.name},

Thank you for agreeing to help.

Please come to the hospital at the time below for a doctor's health examination (screening):

When: ${when}
Hospital: ${request.hospitalName}
City: ${request.city}
Patient: ${request.patientName}
Blood group needed: ${request.bloodGroupRequired}

After the doctor examines you, our admin will verify your fitness and email you again with permission to donate blood.

Mention patient "${request.patientName}" at reception.

RedConnect Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #2980b9, #1a5276); color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">Screening appointment</h2>
      </div>
      <div style="padding: 22px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>Please visit the hospital for <strong>doctor screening</strong> at:</p>
        <p style="background:#f0f8ff;padding:14px;border-radius:8px;"><strong>${when}</strong><br>${request.hospitalName}, ${request.city}<br>Patient: ${request.patientName}</p>
        <p>After screening, admin will verify you and send a final email if you are cleared to donate.</p>
      </div>
    </div>
  `;

  return sendMail({ to: donor.email, subject, text, html });
}

/**
 * After admin verifies donor post-examination — both parties get blood donation time
 */
async function sendAdminVerifiedMails(donor, request, visitTime) {
  const when = formatWhen(visitTime);

  // ── Email to Donor: come donate blood ──
  const donorSubject = `✅ You are cleared — please donate blood for ${request.patientName}`;
  const donorText = `Dear ${donor.name},

Great news! You passed the health screening and our admin has verified you as fit to donate blood.

Please come to donate blood at:
  When:     ${when}
  Hospital: ${request.hospitalName}
  City:     ${request.city}
  Patient:  ${request.patientName}
  Blood group needed: ${request.bloodGroupRequired}
  Requester contact:  ${request.contactNumber || 'N/A'}

Please mention patient "${request.patientName}" at reception when you arrive.

Thank you for saving a life!
RedConnect Team`;

  const donorHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:10px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#27ae60,#1e8449);color:white;padding:20px;text-align:center;">
        <h2 style="margin:0;">✅ You are cleared to donate blood</h2>
      </div>
      <div style="padding:24px;color:#333;line-height:1.7;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>You passed the health screening. Please <strong>come to donate blood</strong> at the details below:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f0fff4;border-radius:8px;">
          <tr><td style="padding:10px;font-weight:bold;">📅 When</td><td style="padding:10px;"><strong>${when}</strong></td></tr>
          <tr style="background:#e8f8f0;"><td style="padding:10px;font-weight:bold;">🏥 Hospital</td><td style="padding:10px;">${request.hospitalName}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">📍 City</td><td style="padding:10px;">${request.city}</td></tr>
          <tr style="background:#e8f8f0;"><td style="padding:10px;font-weight:bold;">🧑 Patient</td><td style="padding:10px;">${request.patientName}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">🩸 Blood group</td><td style="padding:10px;"><span style="background:#ffebee;color:#c0392b;padding:3px 8px;border-radius:4px;font-weight:bold;">${request.bloodGroupRequired}</span></td></tr>
          <tr style="background:#e8f8f0;"><td style="padding:10px;font-weight:bold;">📞 Contact</td><td style="padding:10px;">${request.contactNumber || 'N/A'}</td></tr>
        </table>
        <p style="background:#fff9e6;border-left:4px solid #f39c12;padding:12px;border-radius:4px;">
          ⚠️ Please mention patient <strong>"${request.patientName}"</strong> at reception when you arrive.
        </p>
        <p>Thank you for your life-saving contribution! 🙏</p>
        <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026. This is an automated notification.</p>
      </div>
    </div>
  `;

  await sendMail({ to: donor.email, subject: donorSubject, text: donorText, html: donorHtml });

  if (!request.requesterEmail) return;

  // ── Email to Requester: donor found, come collect blood ──
  const reqSubject = `✅ Donor found — please collect blood for ${request.patientName}`;
  const reqText = `Dear ${request.contactName || 'Requester'},

Good news! Donor ${donor.name} (${donor.bloodGroup || request.bloodGroupRequired}) has passed health screening and has been verified by our admin.

The donor will come to donate blood at:
  When:     ${when}
  Hospital: ${request.hospitalName}
  City:     ${request.city}
  Patient:  ${request.patientName}
  Blood group: ${request.bloodGroupRequired}
  Donor phone: ${donor.phone || 'N/A'}

Please arrange to be at the hospital at the above time to collect the blood for ${request.patientName}.

RedConnect Team`;

  const reqHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:10px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:20px;text-align:center;">
        <h2 style="margin:0;">✅ Donor cleared — please collect blood</h2>
      </div>
      <div style="padding:24px;color:#333;line-height:1.7;">
        <p>Dear <strong>${request.contactName || 'Requester'}</strong>,</p>
        <p>Donor <strong>${donor.name}</strong> has passed health screening and is verified to donate blood for <strong>${request.patientName}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff9f9;border-radius:8px;">
          <tr><td style="padding:10px;font-weight:bold;">📅 When</td><td style="padding:10px;"><strong>${when}</strong></td></tr>
          <tr style="background:#fff0f0;"><td style="padding:10px;font-weight:bold;">🏥 Hospital</td><td style="padding:10px;">${request.hospitalName}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">📍 City</td><td style="padding:10px;">${request.city}</td></tr>
          <tr style="background:#fff0f0;"><td style="padding:10px;font-weight:bold;">🧑 Patient</td><td style="padding:10px;">${request.patientName}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">🩸 Blood group</td><td style="padding:10px;"><span style="background:#ffebee;color:#c0392b;padding:3px 8px;border-radius:4px;font-weight:bold;">${request.bloodGroupRequired}</span></td></tr>
          <tr style="background:#fff0f0;"><td style="padding:10px;font-weight:bold;">👤 Donor</td><td style="padding:10px;">${donor.name}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">📞 Donor phone</td><td style="padding:10px;">${donor.phone || 'N/A'}</td></tr>
        </table>
        <p style="background:#f0fff4;border-left:4px solid #27ae60;padding:12px;border-radius:4px;">
          ✅ Please be at <strong>${request.hospitalName}</strong> on <strong>${when}</strong> to collect blood for <strong>${request.patientName}</strong>.
        </p>
        <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026. This is an automated notification.</p>
      </div>
    </div>
  `;

  await sendMail({ to: request.requesterEmail, subject: reqSubject, text: reqText, html: reqHtml });
}

/**
 * After donor confirms healthy — notify requester and donor with visit details
 */
async function sendDonorConfirmedMails(donor, request, visitTime) {
  const when = visitTime.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const donorSubject = `✅ Confirmed — please donate at ${request.hospitalName}`;
  const donorText = `Dear ${donor.name},

Thank you for confirming you are healthy and ready to donate.

Please reach the hospital at the time below:
- When: ${when}
- Hospital: ${request.hospitalName}
- City: ${request.city}
- Patient: ${request.patientName}
- Blood group needed: ${request.bloodGroupRequired}
- Contact: ${request.contactNumber}

Mention patient "${request.patientName}" at reception. Your kindness saves lives.

RedConnect Team`;

  const donorHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #27ae60, #1e8449); color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">You're confirmed to donate</h2>
      </div>
      <div style="padding: 22px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>Please visit the hospital at:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">When</td><td style="padding: 8px;">${when}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold;">Hospital</td><td style="padding: 8px;">${request.hospitalName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">City</td><td style="padding: 8px;">${request.city}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold;">Patient</td><td style="padding: 8px;">${request.patientName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Blood group</td><td style="padding: 8px;">${request.bloodGroupRequired}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold;">Contact</td><td style="padding: 8px;">${request.contactNumber}</td></tr>
        </table>
        <p>Mention patient <strong>"${request.patientName}"</strong> when you arrive.</p>
      </div>
    </div>
  `;

  await sendMail({ to: donor.email, subject: donorSubject, text: donorText, html: donorHtml });

  const requesterEmail = request.requesterEmail;
  if (!requesterEmail) return;

  const reqSubject = `🎉 Donor found for ${request.patientName}`;
  const reqText = `Dear ${request.contactName || 'Requester'},

Good news! A compatible donor has confirmed they are healthy and will visit the hospital.

Donor: ${donor.name}
Blood group: ${donor.bloodGroup}
Phone: ${donor.phone}

Please reach / coordinate at:
- When: ${when}
- Hospital: ${request.hospitalName}, ${request.city}

Contact the donor if you need to coordinate further.

RedConnect Team`;

  const reqHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">Donor found!</h2>
      </div>
      <div style="padding: 22px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${request.contactName || 'Requester'}</strong>,</p>
        <p>A compatible donor has confirmed they are <strong>healthy</strong> and will come to donate for <strong>${request.patientName}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Donor</td><td style="padding: 8px;">${donor.name}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold;">Blood group</td><td style="padding: 8px;">${donor.bloodGroup}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;">${donor.phone}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold;">Visit by</td><td style="padding: 8px;">${when}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Hospital</td><td style="padding: 8px;">${request.hospitalName}, ${request.city}</td></tr>
        </table>
      </div>
    </div>
  `;

  await sendMail({ to: requesterEmail, subject: reqSubject, text: reqText, html: reqHtml });
}

/**
 * Step 2: Invite donor for medical screening after compatible match found
 */
async function sendDoctorScreeningInviteMail(donor, request) {
  const subject = `Invitation for Medical Screening - Blood Donation`;
  const text = `Dear ${donor.name},

We are pleased to inform you that you have been selected as a compatible blood donor for a patient in need.

You are kindly requested to visit the hospital for a medical screening at your earliest convenience.

Request Details:
  Patient Name:   ${request.patientName}
  Blood Group:    ${request.bloodGroupRequired}
  Hospital:       ${request.hospitalName}, ${request.city}
  Urgency:        ${request.emergencyLevel}

Please visit the hospital and mention patient "${request.patientName}" at reception. The doctor will conduct a brief health examination to confirm your eligibility to donate.

Thank you sincerely for your willingness to help save a life. Your generosity means the world to the patient and their family.

Warm regards,
RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:24px;text-align:center;">
        <h2 style="margin:0;font-size:22px;">🩺 Invitation for Medical Screening</h2>
        <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Blood Donation — RedConnect</p>
      </div>
      <div style="padding:28px;color:#333;line-height:1.8;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>You have been selected as a <strong>compatible blood donor</strong> for a patient in need. We kindly request you to visit the hospital for a <strong>medical screening</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;border-radius:8px;overflow:hidden;">
          <tr style="background:#fff0f0;"><td style="padding:12px;font-weight:bold;width:40%;">🧑 Patient</td><td style="padding:12px;">${request.patientName}</td></tr>
          <tr><td style="padding:12px;font-weight:bold;">🩸 Blood Group</td><td style="padding:12px;"><span style="background:#ffebee;color:#c0392b;padding:3px 10px;border-radius:20px;font-weight:bold;">${request.bloodGroupRequired}</span></td></tr>
          <tr style="background:#fff0f0;"><td style="padding:12px;font-weight:bold;">🏥 Hospital</td><td style="padding:12px;">${request.hospitalName}</td></tr>
          <tr><td style="padding:12px;font-weight:bold;">📍 City</td><td style="padding:12px;">${request.city}</td></tr>
          <tr style="background:#fff0f0;"><td style="padding:12px;font-weight:bold;">⚡ Urgency</td><td style="padding:12px;color:#e74c3c;font-weight:bold;">${request.emergencyLevel}</td></tr>
        </table>
        <div style="background:#fff9e6;border-left:4px solid #f39c12;padding:14px;border-radius:6px;margin:16px 0;">
          <strong>📋 What to do:</strong> Visit <strong>${request.hospitalName}</strong> and mention patient <strong>"${request.patientName}"</strong> at reception. The doctor will conduct a brief health check.
        </div>
        <p>Thank you sincerely for your willingness to help save a life. Your generosity means the world to the patient and their family. 🙏</p>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026 · This is an automated notification.</p>
      </div>
    </div>
  `;
  return sendMail({ to: donor.email, subject, text, html });
}

/**
 * Step 4a: Donor marked Fit — email donor they are eligible to donate
 */
async function sendDonorFitMail(donor, screening) {
  const subject = `You are Eligible to Donate Blood`;
  const text = `Dear ${donor.name},

Congratulations! You have successfully passed the medical screening conducted by Dr. ${screening.doctorName || 'our medical team'}.

You are now eligible to donate blood. Please visit the hospital to complete your donation.

Hospital: ${screening.hospitalName}
Blood Group Required: ${screening.bloodGroup}
${screening.remarks ? `Doctor Remarks: ${screening.remarks}` : ''}

Thank you for your incredible generosity. Your donation will directly save a life.

Warm regards,
RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#27ae60,#1e8449);color:white;padding:24px;text-align:center;">
        <h2 style="margin:0;font-size:22px;">✅ You are Eligible to Donate Blood</h2>
      </div>
      <div style="padding:28px;color:#333;line-height:1.8;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>🎉 Congratulations! You have successfully passed the medical screening. You are now <strong>eligible to donate blood</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;border-radius:8px;overflow:hidden;">
          <tr style="background:#f0fff4;"><td style="padding:12px;font-weight:bold;width:40%;">🏥 Hospital</td><td style="padding:12px;">${screening.hospitalName}</td></tr>
          <tr><td style="padding:12px;font-weight:bold;">🩸 Blood Group</td><td style="padding:12px;"><span style="background:#ffebee;color:#c0392b;padding:3px 10px;border-radius:20px;font-weight:bold;">${screening.bloodGroup}</span></td></tr>
          <tr style="background:#f0fff4;"><td style="padding:12px;font-weight:bold;">👨‍⚕️ Doctor</td><td style="padding:12px;">${screening.doctorName || 'Medical Team'}</td></tr>
          ${screening.remarks ? `<tr><td style="padding:12px;font-weight:bold;">📝 Remarks</td><td style="padding:12px;">${screening.remarks}</td></tr>` : ''}
        </table>
        <div style="background:#e8f8f0;border-left:4px solid #27ae60;padding:14px;border-radius:6px;margin:16px 0;">
          Please visit <strong>${screening.hospitalName}</strong> to complete your blood donation. Your contribution will directly save a life.
        </div>
        <p>Thank you for your incredible generosity. 🙏</p>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026 · This is an automated notification.</p>
      </div>
    </div>
  `;
  return sendMail({ to: donor.email, subject, text, html });
}

/**
 * Step 4b: Notify requester that a medically fit donor has been found
 */
async function sendRequesterDonorFoundMail(requesterEmail, donor, screening, request) {
  if (!requesterEmail) return null;
  const subject = `Compatible Donor Found for ${request.patientName}`;
  const text = `Dear ${request.contactName || 'Requester'},

Great news! A medically fit donor has been found for your blood request.

Donor Details:
  Name:        ${donor.name}
  Blood Group: ${screening.bloodGroup}
  Hospital:    ${screening.hospitalName}

Blood donation has been scheduled. Please visit the hospital to coordinate the blood collection for ${request.patientName}.

Thank you for using RedConnect.

Warm regards,
RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#2980b9,#1a5276);color:white;padding:24px;text-align:center;">
        <h2 style="margin:0;font-size:22px;">🎉 Compatible Donor Found</h2>
      </div>
      <div style="padding:28px;color:#333;line-height:1.8;">
        <p>Dear <strong>${request.contactName || 'Requester'}</strong>,</p>
        <p>Great news! A <strong>medically fit donor</strong> has been found for <strong>${request.patientName}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;border-radius:8px;overflow:hidden;">
          <tr style="background:#f0f8ff;"><td style="padding:12px;font-weight:bold;width:40%;">👤 Donor</td><td style="padding:12px;">${donor.name}</td></tr>
          <tr><td style="padding:12px;font-weight:bold;">🩸 Blood Group</td><td style="padding:12px;"><span style="background:#ffebee;color:#c0392b;padding:3px 10px;border-radius:20px;font-weight:bold;">${screening.bloodGroup}</span></td></tr>
          <tr style="background:#f0f8ff;"><td style="padding:12px;font-weight:bold;">🏥 Hospital</td><td style="padding:12px;">${screening.hospitalName}</td></tr>
          <tr><td style="padding:12px;font-weight:bold;">🧑 Patient</td><td style="padding:12px;">${request.patientName}</td></tr>
        </table>
        <div style="background:#e8f4fd;border-left:4px solid #2980b9;padding:14px;border-radius:6px;margin:16px 0;">
          Blood donation has been scheduled. Please visit <strong>${screening.hospitalName}</strong> to coordinate blood collection for <strong>${request.patientName}</strong>.
        </div>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026 · This is an automated notification.</p>
      </div>
    </div>
  `;
  return sendMail({ to: requesterEmail, subject, text, html });
}

/**
 * Step 5: Donor marked Unfit — email donor only (no email to requester)
 */
async function sendDonorUnfitMail(donor, screening) {
  const subject = `Medical Screening Result`;
  const text = `Dear ${donor.name},

Thank you for your willingness to donate blood and for visiting the hospital for the medical screening.

After careful examination by Dr. ${screening.doctorName || 'our medical team'}, we regret to inform you that you are currently not eligible to donate blood at this time.

${screening.remarks ? `Doctor Remarks: ${screening.remarks}` : ''}

This does not diminish the value of your generous intention. We encourage you to take care of your health and consider donating again in the future when you are eligible.

Thank you for your kindness and support.

Warm regards,
RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#7f8c8d,#636e72);color:white;padding:24px;text-align:center;">
        <h2 style="margin:0;font-size:22px;">Medical Screening Result</h2>
      </div>
      <div style="padding:28px;color:#333;line-height:1.8;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>Thank you for your willingness to donate blood and for visiting the hospital for the medical screening.</p>
        <div style="background:#fef9f0;border-left:4px solid #e67e22;padding:14px;border-radius:6px;margin:16px 0;">
          After careful examination, we regret to inform you that you are <strong>currently not eligible</strong> to donate blood at this time.
          ${screening.remarks ? `<br><br><strong>Doctor Remarks:</strong> ${screening.remarks}` : ''}
        </div>
        <p>This does not diminish the value of your generous intention. We encourage you to take care of your health and consider donating again in the future when you are eligible.</p>
        <p>Thank you for your kindness and support. 🙏</p>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026 · This is an automated notification.</p>
      </div>
    </div>
  `;
  return sendMail({ to: donor.email, subject, text, html });
}

/**
 * Admin reply to low-rating feedback
 */
async function sendFeedbackReplyMail(feedback, replyMessage) {
  const subject = `Response to your feedback — RedConnect`;
  const text = `Dear ${feedback.name},

Thank you for sharing your feedback with us. We have reviewed your message and wanted to personally respond.

Your feedback:
"${feedback.message}"

Our response:
${replyMessage}

We appreciate you taking the time to help us improve.

Warm regards,
RedConnect Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:24px;text-align:center;">
        <h2 style="margin:0;">Response to your feedback</h2>
      </div>
      <div style="padding:28px;color:#333;line-height:1.8;">
        <p>Dear <strong>${feedback.name}</strong>,</p>
        <p>Thank you for sharing your feedback. Here is our response:</p>
        <div style="background:#fff9f9;border-left:4px solid #e74c3c;padding:14px;border-radius:6px;margin:16px 0;">
          <strong>Your feedback:</strong><br><em>"${feedback.message}"</em>
        </div>
        <div style="background:#f0fff4;border-left:4px solid #27ae60;padding:14px;border-radius:6px;margin:16px 0;">
          <strong>Our response:</strong><br>${replyMessage}
        </div>
        <p>We appreciate you helping us improve RedConnect.</p>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026</p>
      </div>
    </div>
  `;
  return sendMail({ to: feedback.email, subject, text, html });
}

async function sendSubscribeConfirmMail(email) {
  return sendMail({
    to: email,
    subject: '🩸 You are subscribed to RedConnect!',
    text: `Thank you for subscribing to RedConnect!\n\nYou will now receive updates about blood donation campaigns, awareness camps, and health tips.\n\nRedConnect Team`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:24px;text-align:center;">
          <h2 style="margin:0;">🩸 Welcome to RedConnect!</h2>
        </div>
        <div style="padding:28px;color:#333;line-height:1.8;">
          <p>Thank you for subscribing! You will now receive updates about:</p>
          <ul style="padding-left:20px;">
            <li>🩸 Blood donation campaigns</li>
            <li>🏕️ Awareness camps near you</li>
            <li>💡 Health tips &amp; donor guides</li>
          </ul>
          <p>Together we save lives. ❤️</p>
          <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
          <p style="font-size:12px;color:#aaa;text-align:center;">RedConnect &copy; 2026</p>
        </div>
      </div>
    `
  });
}

module.exports = {
  sendHealthyMail,
  sendSubscribeConfirmMail,
  sendHealthyMailOnlyDonor,
  sendDonorNotificationMail,
  sendHealthCheckMail,
  sendDonorScreeningVisitMail,
  sendDonorConfirmedMails,
  sendAdminVerifiedMails,
  sendRequestSubmittedMail,
  sendRequestMatchedMail,
  sendDoctorScreeningInviteMail,
  sendDonorFitMail,
  sendRequesterDonorFoundMail,
  sendDonorUnfitMail,
  sendFeedbackReplyMail,
  getTransporter,
  isSmtpConfigured
};
