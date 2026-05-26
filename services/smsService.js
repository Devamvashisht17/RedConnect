// services/smsService.js
const fs = require('fs');
const path = require('path');

// Ensure scratch directory exists for local testing
const scratchDir = path.join(__dirname, '../scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

const logFilePath = path.join(scratchDir, 'sent_sms.log');

// Setup Twilio if credentials exist
let twilioClient = null;
const isTwilioConfigured = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER;

if (isTwilioConfigured) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.error('⚠️ [SMS] Twilio module not installed. Run "npm install twilio" if you wish to use it.');
  }
}

/**
 * Log SMS details locally
 */
function logSmsLocally(to, body) {
  const timestamp = new Date().toISOString();
  const logContent = `
========================================
TIMESTAMP: ${timestamp}
TO: ${to}
MESSAGE:
${body}
========================================
\n`;
  fs.appendFileSync(logFilePath, logContent, 'utf8');
  console.log(`💬 [SMS SIMULATION] SMS written to log. To: ${to} | Message: ${body.substring(0, 60)}...`);
}

/**
 * Core send SMS helper
 */
async function sendSMS({ to, body }) {
  // Log locally always for verification
  logSmsLocally(to, body);

  if (twilioClient && isTwilioConfigured) {
    try {
      const message = await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });
      console.log(`✅ [Twilio] SMS sent successfully. SID: ${message.sid}`);
      return message;
    } catch (error) {
      console.error(`❌ [Twilio Error] Failed to send SMS to ${to}:`, error.message);
      return null;
    }
  }
  return null;
}

/**
 * Send screening instructions to assigned donor
 */
async function sendScreeningSMS(donor, request) {
  const to = donor.phone;
  const body = `RedConnect alert: You have been assigned as donor for patient "${request.patientName}" (${request.bloodGroupRequired}). Please visit "${request.hospitalName}" in ${request.city} for screening immediately. Thank you!`;
  
  return sendSMS({ to, body });
}

module.exports = {
  sendScreeningSMS
};
