/**
 * Donor Rescheduling Service
 * Handles when donors can't make it at their scheduled screening time
 */

const Donor = require('../models/Donor');
const Request = require('../models/Request');
const Notification = require('../models/Notification');
const { 
  getSuggestedVisitTime, 
  findCompatibleDonors,
  createRequesterNotification 
} = require('./requestMatchingService');
const { 
  sendDonorScreeningVisitMail,
  sendRequestMatchedMail 
} = require('./emailService');

/**
 * When a donor declines/is unavailable at the scheduled time:
 * 1. Mark current donor as unavailable for this time
 * 2. Try to find next eligible donor from matchedDonors
 * 3. If found, notify them with new time or old time
 * 4. If not found, contact requester about rescheduling or additional donors
 */
async function handleDonorUnavailable(requestId, declinedDonorId, reason = '', suggestedTime = null) {
  try {
    const request = await Request.findById(requestId);
    if (!request) throw new Error('Request not found');

    const declinedDonor = await Donor.findById(declinedDonorId);
    if (!declinedDonor) throw new Error('Donor not found');

    // Update declined donor's status
    const matchedDonors = request.matchedDonors || [];
    const declinedIndex = matchedDonors.findIndex(m => m.donor.toString() === declinedDonorId.toString());
    
    if (declinedIndex > -1) {
      matchedDonors[declinedIndex].responseStatus = 'declined';
      matchedDonors[declinedIndex].healthStatus = 'unavailable';
      matchedDonors[declinedIndex].respondedAt = new Date();
      matchedDonors[declinedIndex].note = reason || 'Not available at scheduled time';
    }

    // Reset request if this was the accepted donor
    if (request.acceptedDonor?.toString() === declinedDonorId.toString()) {
      request.acceptedDonor = undefined;
      request.awaitingAdminVerification = false;
      request.status = 'matched';
    }

    // Find next eligible donor from matchedDonors
    let nextDonor = null;
    let nextDonorIndex = -1;

    for (let i = 0; i < matchedDonors.length; i++) {
      const match = matchedDonors[i];
      // Look for pending, healthy donors that haven't responded yet
      if (
        match.responseStatus === 'pending' && 
        (match.healthStatus === 'pending' || match.healthStatus === 'healthy')
      ) {
        const donor = await Donor.findById(match.donor);
        if (donor && donor.isActive !== false) {
          nextDonor = donor;
          nextDonorIndex = i;
          break;
        }
      }
    }

    if (nextDonor) {
      // Auto-promote next donor
      const newVisitTime = getSuggestedVisitTime(request.emergencyLevel);
      
      matchedDonors[nextDonorIndex].healthStatus = 'scheduled';
      matchedDonors[nextDonorIndex].scheduledVisitAt = newVisitTime;
      matchedDonors[nextDonorIndex].notifiedAt = new Date();

      request.acceptedDonor = nextDonor._id;
      request.scheduledVisitAt = newVisitTime;
      request.awaitingAdminVerification = true;
      request.status = 'accepted';

      request.matchedDonors = matchedDonors;
      request.markModified('matchedDonors');
      await request.save();

      // Send screening email to next donor
      try {
        await sendDonorScreeningVisitMail(nextDonor, request, newVisitTime);
      } catch (mailErr) {
        console.error('Screening visit email error:', mailErr.message);
      }

      // Notify requester
      try {
        await createRequesterNotification({
          request,
          title: 'New donor scheduled',
          message: `${nextDonor.name} is now scheduled for screening at ${formatWhen(newVisitTime)}. Previous donor was unavailable.`,
          type: 'request-donor-changed'
        });
      } catch (notifErr) {
        console.error('Notification error:', notifErr.message);
      }

      return {
        success: true,
        action: 'donor_promoted',
        message: `${nextDonor.name} has been scheduled for ${formatWhen(newVisitTime)}`,
        newDonorId: nextDonor._id,
        newVisitTime
      };
    } else {
      // No more donors in matchedDonors, need to find new donors or contact requester
      request.matchedDonors = matchedDonors;
      request.markModified('matchedDonors');
      request.status = 'matched'; // Back to matched to trigger new donor search
      request.acceptedDonor = undefined;
      request.awaitingAdminVerification = false;
      request.scheduledVisitAt = undefined;
      await request.save();

      // Try to find more compatible donors
      const newDonors = await findCompatibleDonors({
        bloodGroupRequired: request.bloodGroupRequired,
        city: request.city
      });

      // Filter out already matched donors
      const matchedDonorIds = new Set(matchedDonors.map(m => m.donor.toString()));
      const additionalDonors = newDonors.filter(d => !matchedDonorIds.has(d._id.toString()));

      if (additionalDonors.length > 0) {
        // Notify requester about new donor search
        try {
          await createRequesterNotification({
            request,
            title: 'Searching for new donors',
            message: `${declinedDonor.name} was unavailable. We are now contacting ${additionalDonors.length} more compatible donor(s).`,
            type: 'request-searching-donors'
          });
        } catch (notifErr) {
          console.error('Notification error:', notifErr.message);
        }

        return {
          success: true,
          action: 'searching_new_donors',
          message: `Searching ${additionalDonors.length} additional donor(s)`,
          additionalDonorsCount: additionalDonors.length
        };
      } else {
        // No more donors available, request requester action
        try {
          await createRequesterNotification({
            request,
            title: 'No donors available',
            message: `All contacted donors are unavailable. Please contact support or update your request details (blood type, location, urgency level).`,
            type: 'request-no-donors'
          });
        } catch (notifErr) {
          console.error('Notification error:', notifErr.message);
        }

        return {
          success: true,
          action: 'no_donors_available',
          message: 'No more donors available. Requester has been notified.'
        };
      }
    }
  } catch (err) {
    console.error('handleDonorUnavailable error:', err.message);
    throw err;
  }
}

/**
 * Get alternative time suggestions for a donor
 */
function getAlternativeTimeSlots(emergencyLevel) {
  const now = new Date();
  const slots = [];

  // Get 5 alternative time slots
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    
    const times = [9, 10, 14, 16, 18]; // Business hours: 9am, 10am, 2pm, 4pm, 6pm
    
    for (const hour of times) {
      const slotTime = new Date(date);
      slotTime.setHours(hour, 0, 0, 0);
      
      // Skip past times
      if (slotTime > now) {
        slots.push({
          time: slotTime,
          label: formatWhen(slotTime),
          dayOffset,
          hour
        });
      }
      
      if (slots.length >= 5) break;
    }
    
    if (slots.length >= 5) break;
  }

  return slots.slice(0, 5);
}

/**
 * Format datetime for display
 */
function formatWhen(date) {
  if (!date) return '';
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata'
  };
  return new Date(date).toLocaleString('en-IN', options);
}

module.exports = {
  handleDonorUnavailable,
  getAlternativeTimeSlots,
  formatWhen
};
