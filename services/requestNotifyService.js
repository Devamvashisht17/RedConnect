const {
  findCompatibleDonors,
  createDonorNotifications,
  getAppBaseUrl
} = require('./requestMatchingService');
const { sendRequestSubmittedMail, sendDoctorScreeningInviteMail } = require('./emailService');
const { refId } = require('../utils/refId');
const DoctorScreening = require('../models/DoctorScreening');

function requiredBloodGroup(request) {
  return request.bloodGroupRequired || request.bloodGroup;
}

/**
 * Find all compatible non-cooldown donors, add them to matchedDonors as 'pending',
 * and email each one a simple notification to open their dashboard and respond.
 * No confirm/decline link — donor must respond from the dashboard.
 */
async function syncDonorsAndNotify(request, socketEmitters) {
  const wasPending = request.status === 'pending';
  const compatible = await findCompatibleDonors({
    bloodGroupRequired: requiredBloodGroup(request),
    city: request.city
  });

  if (!request.matchedDonors) request.matchedDonors = [];

  const existingIds = new Set(
    request.matchedDonors.map(m => refId(m.donor)).filter(Boolean)
  );

  const newlyNotified = [];
  const toEmail = [];

  for (const { donor, user, cityMatch, eligible, cooldownUntil } of compatible) {
    const donorId = donor._id.toString();
    if (existingIds.has(donorId)) continue;

    // Add to matched list with healthStatus 'pending' — stays pending until donor responds from dashboard
    request.matchedDonors.push({
      donor: donor._id,
      user: user?._id,
      cityMatch,
      healthStatus: eligible ? 'pending' : 'cooldown',
      responseStatus: 'pending',
      note: eligible
        ? ''
        : `On 90-day cooldown${cooldownUntil ? ` until ${cooldownUntil.toLocaleDateString('en-IN')}` : ''}`
    });
    existingIds.add(donorId);

    if (eligible) toEmail.push({ donor, donorId });
  }

  request.compatibleDonorCount = request.matchedDonors.length;
  if (request.matchedDonors.length > 0 && request.status === 'pending') {
    request.status = 'matched';
  }

  // Email every eligible donor and create a DoctorScreening record for each
  const base = getAppBaseUrl();
  const dashboardUrl = `${base}/donor/dashboard`;
  for (const { donor } of toEmail) {
    try {
      // Create screening record (upsert to prevent duplicates)
      await DoctorScreening.findOneAndUpdate(
        { donor: donor._id, request: request._id },
        {
          $setOnInsert: {
            donor: donor._id,
            request: request._id,
            donorName: donor.name,
            donorEmail: donor.email,
            donorPhone: donor.phone || '',
            bloodGroup: donor.bloodGroup,
            hospitalName: request.hospitalName,
            requesterName: request.contactName || request.patientName || '',
            requesterEmail: request.requesterEmail || '',
            screeningStatus: 'Pending',
            donationStatus: 'Waiting for Screening'
          }
        },
        { upsert: true, new: true }
      );
      // Send screening invitation email
      await sendDoctorScreeningInviteMail(donor, request);
      newlyNotified.push(donor);
    } catch (mailErr) {
      console.error(`Screening invite failed for ${donor.email}:`, mailErr.message);
    }
  }

  await request.save();

  // Do NOT email requester here — requester is notified only when a donor actually responds

  // Push in-app + socket notifications to donors
  if (newlyNotified.length > 0) {
    const freshCompatible = compatible.filter(
      c => c.eligible && newlyNotified.some(d => d._id.toString() === c.donor._id.toString())
    );
    try {
      await createDonorNotifications({ request, donors: freshCompatible, socketEmitters });
    } catch (notifErr) {
      console.error('Donor notification error:', notifErr.message);
    }
  }

  const cooldownCount = request.matchedDonors.filter(m => m.healthStatus === 'cooldown').length;

  return {
    request,
    newlyNotified,
    totalMatched: request.matchedDonors.length,
    eligibleCount: newlyNotified.length,
    cooldownCount
  };
}

async function emailRequesterSubmitted(request) {
  if (!request.requesterEmail) return;
  const matchesUrl = `${getAppBaseUrl()}/request/${request._id}/matches`;
  await sendRequestSubmittedMail(request, matchesUrl);
}

module.exports = { syncDonorsAndNotify, emailRequesterSubmitted };
