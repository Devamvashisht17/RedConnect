const {
  findCompatibleDonors,
  createDonorNotifications,
  getAppBaseUrl,
  getSuggestedVisitTime
} = require('./requestMatchingService');
const { sendDonorScreeningVisitMail, sendRequestSubmittedMail } = require('./emailService');
const { refId } = require('../utils/refId');

function requiredBloodGroup(request) {
  return request.bloodGroupRequired || request.bloodGroup;
}

/**
 * Merge compatible donors onto request, email eligible donors to come for screening,
 * and queue first donor for admin verification after screening.
 */
async function syncDonorsAndNotify(request, socketEmitters) {
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
  const visitTime = getSuggestedVisitTime(request.emergencyLevel);

  for (const { donor, user, cityMatch, eligible, cooldownUntil } of compatible) {
    const donorId = donor._id.toString();
    if (existingIds.has(donorId)) continue;

    request.matchedDonors.push({
      donor: donor._id,
      user: user?._id,
      cityMatch,
      healthStatus: eligible ? 'scheduled' : 'cooldown',
      responseStatus: eligible ? 'accepted' : 'pending',
      scheduledVisitAt: eligible ? visitTime : undefined,
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

  for (const { donor, donorId } of toEmail) {
    try {
      await sendDonorScreeningVisitMail(donor, request, visitTime);

      if (!request.acceptedDonor) {
        request.acceptedDonor = donor._id;
        request.scheduledVisitAt = visitTime;
        request.awaitingAdminVerification = true;
        request.status = 'accepted';
      }

      newlyNotified.push(donor);
    } catch (mailErr) {
      console.error(`Screening email failed for ${donor.email}:`, mailErr.message);
    }
  }

  await request.save();

  if (newlyNotified.length > 0) {
    const freshCompatible = compatible.filter(
      c => c.eligible && newlyNotified.some(d => d._id.toString() === c.donor._id.toString())
    );
    try {
      await createDonorNotifications({
        request,
        donors: freshCompatible,
        socketEmitters
      });
    } catch (notifErr) {
      console.error('Donor notification error:', notifErr.message);
    }
  }

  const screeningCount = request.matchedDonors.filter(m => m.healthStatus === 'scheduled').length;
  const cooldownCount = request.matchedDonors.filter(m => m.healthStatus === 'cooldown').length;

  return {
    request,
    newlyNotified,
    totalMatched: request.matchedDonors.length,
    eligibleCount: screeningCount,
    cooldownCount
  };
}

async function emailRequesterSubmitted(request) {
  if (!request.requesterEmail) return;
  const matchesUrl = `${getAppBaseUrl()}/request/${request._id}/matches`;
  await sendRequestSubmittedMail(request, matchesUrl);
}

module.exports = { syncDonorsAndNotify, emailRequesterSubmitted };
