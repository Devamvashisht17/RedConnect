const Donor         = require('../models/Donor');
const Donation      = require('../models/Donation');
const DonorStats    = require('../models/DonorStats');
const Request       = require('../models/Request');
const Notification  = require('../models/Notification');
const { bloodData } = require('./homeController');
const { syncDonorsAndNotify } = require('../services/requestNotifyService');
const { createRequesterNotification } = require('../services/requestMatchingService');

const COOLDOWN_DAYS = 90;

async function checkCooldown(userId) {
  if (!userId) return null;
  // check DonorStats cooldownUntil (set after admin verifies)
  const stats = await DonorStats.findOne({ user: userId });
  if (stats?.cooldownUntil && new Date() < stats.cooldownUntil)
    return stats.cooldownUntil;
  // also check if a pending donation exists within 90 days
  const recent = await Donation.findOne({
    donor: userId,
    donatedAt: { $gte: new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000) }
  }).sort({ donatedAt: -1 });
  if (recent) {
    const until = new Date(recent.donatedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    return until;
  }
  return null;
}

exports.getRegister = async (req, res) => {
  if (res.locals.user) {
    const cooldownUntil = await checkCooldown(res.locals.user._id);
    if (cooldownUntil) return res.render('register', { cooldownUntil });
  }
  res.render('register', { cooldownUntil: null });
};

exports.postRegister = async (req, res) => {
  try {
    // cooldown check for logged-in users
    if (res.locals.user) {
      const cooldownUntil = await checkCooldown(res.locals.user._id);
      if (cooldownUntil) return res.render('register', { cooldownUntil });
    }

    const { name, email, phone, dob, bloodGroup, city } = req.body;
    const user = res.locals.user || null;
    const existing = user
      ? await Donor.findOne({ $or: [{ user: user._id }, { email }] })
      : await Donor.findOne({ email });
    
    let isNewDonor = false;
    let bloodGroupChanged = false;
    
    if (existing) {
      if (existing.bloodGroup !== bloodGroup) {
        bloodGroupChanged = true;
      }
      existing.name = name;
      existing.email = email;
      existing.phone = phone;
      existing.dob = dob;
      existing.bloodGroup = bloodGroup;
      existing.city = city;
      if (user?._id && !existing.user) existing.user = user._id;
      await existing.save();
    } else {
      isNewDonor = true;
      await Donor.create({
        user: user?._id || undefined,
        name,
        email,
        phone,
        dob,
        bloodGroup,
        city
      });
    }

    // Check for pending blood requests that match this donor's blood group
    if (isNewDonor || bloodGroupChanged) {
      console.log('=== DONOR REGISTRATION - CHECKING PENDING REQUESTS ===');
      console.log('Blood group:', bloodGroup);
      console.log('Is new donor:', isNewDonor);
      console.log('Blood group changed:', bloodGroupChanged);
      
      try {
        const pendingRequests = await Request.find({
          bloodGroupRequired: bloodGroup,
          status: { $in: ['pending', 'matched'] }
        });

        console.log('Found pending requests:', pendingRequests.length);

        if (pendingRequests.length > 0) {
          const socketEmitters = req.app.get('socketEmitters');
          console.log('Socket emitters available:', !!socketEmitters);
          
          for (const request of pendingRequests) {
            try {
              console.log('Processing request:', request._id, 'for requester:', request.requesterEmail);
              const notifyResult = await syncDonorsAndNotify(request, socketEmitters);
              console.log('Notify result:', notifyResult);
              
              if (notifyResult.totalMatched > 0) {
                console.log('Creating notification for requester');
                await createRequesterNotification({
                  request,
                  title: `New donor available for your blood request`,
                  message: `A new donor with blood group ${bloodGroup} has registered. We have notified them about your request.`,
                  type: 'request-match'
                });
                console.log('Notification created successfully');
              }
            } catch (notifyErr) {
              console.error('Error notifying requester:', notifyErr.message);
              console.error('Full error:', notifyErr);
            }
          }
        } else {
          console.log('No pending requests found for blood group:', bloodGroup);
        }
      } catch (checkErr) {
        console.error('Error checking pending requests:', checkErr.message);
        console.error('Full error:', checkErr);
      }
      console.log('=== END PENDING REQUESTS CHECK ===');
    }

    if (res.locals.user) {
      await Donation.create({
        donor:       res.locals.user._id,
        bloodGroup,  hospital: city, city,
        isEmergency: false,
        isRareBlood: ['AB-','B-','A-','O-'].includes(bloodGroup),
        status: 'pending'
      });
      return res.redirect('/donor/dashboard');
    }

    res.redirect('/thankyou?name=' + encodeURIComponent(name));
  } catch (err) {
    console.error('Register error:', err.message);
    res.redirect('/register');
  }
};

exports.getDonorsByGroup = async (req, res) => {
  const group      = decodeURIComponent(req.params.group);
  const groupDonors = await Donor.find({ bloodGroup: group });
  res.render('donors-group', { group, groupDonors, compat: bloodData[group] || null });
};
