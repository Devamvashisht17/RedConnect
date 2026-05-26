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

  const donorSubject = `✅ Please donate blood — ${request.patientName}`;
  const donorText = `Dear ${donor.name},

You passed doctor screening and our admin team has verified you as healthy and fit to give blood.

Please donate blood at:
When: ${when}
Hospital: ${request.hospitalName}
City: ${request.city}
Patient: ${request.patientName}
Blood group needed: ${request.bloodGroupRequired}
Requester contact: ${request.contactNumber}

Mention patient "${request.patientName}" at reception. Thank you for saving a life!

RedConnect Team`;

  const donorHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #27ae60, #1e8449); color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">You are cleared to give blood</h2>
      </div>
      <div style="padding: 22px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${donor.name}</strong>,</p>
        <p>After screening, admin confirmed you are <strong>healthy</strong>. Please <strong>donate blood</strong> at:</p>
        <p style="background:#e8f8f5;padding:14px;border-radius:8px;"><strong>${when}</strong><br>${request.hospitalName}, ${request.city}<br>Patient: ${request.patientName}</p>
      </div>
    </div>
  `;

  await sendMail({ to: donor.email, subject: donorSubject, text: donorText, html: donorHtml });

  if (!request.requesterEmail) return;

  const reqSubject = `✅ Donor ready — please receive blood for ${request.patientName}`;
  const reqText = `Dear ${request.contactName || 'Requester'},

Good news! Donor ${donor.name} (${donor.bloodGroup}) passed screening and was verified healthy by our admin.

Please arrange to receive blood for ${request.patientName} at:
When: ${when}
Hospital: ${request.hospitalName}, ${request.city}
Donor phone: ${donor.phone}

Blood group needed: ${request.bloodGroupRequired}
Your contact: ${request.contactNumber}

RedConnect Team`;

  const reqHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">Donor cleared — receive blood</h2>
      </div>
      <div style="padding: 22px; color: #333; line-height: 1.6;">
        <p>Dear <strong>${request.contactName || 'Requester'}</strong>,</p>
        <p>Donor <strong>${donor.name}</strong> is verified healthy. Please <strong>receive blood</strong> for <strong>${request.patientName}</strong> at:</p>
        <p style="background:#f0fff4;padding:14px;border-radius:8px;">
          <strong>When:</strong> ${when}<br>
          <strong>Hospital:</strong> ${request.hospitalName}, ${request.city}<br>
          <strong>Donor:</strong> ${donor.name} · ${donor.phone}
        </p>
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

module.exports = {
  sendScreeningMail,
  sendHealthyMail,
  sendHealthyMailOnlyDonor,
  sendHealthCheckMail,
  sendDonorScreeningVisitMail,
  sendDonorConfirmedMails,
  sendAdminVerifiedMails,
  sendRequestSubmittedMail,
  getTransporter,
  isSmtpConfigured
};
