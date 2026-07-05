const Request = require('../models/Request');
const Donation = require('../models/Donation');
const User = require('../models/User');
const Donor = require('../models/Donor');
const Notification = require('../models/Notification');
const { isBloodGroupValid, createRequesterNotification } = require('../services/requestMatchingService');
const { syncDonorsAndNotify, emailRequesterSubmitted } = require('../services/requestNotifyService');

exports.dashboard = async (req, res) => {
  try {
    console.log('=== REQUESTER DASHBOARD DEBUG ===');
    console.log('User:', req.user);
    console.log('User ID:', req.user?._id);
    console.log('User Email:', req.user?.email);
    console.log('===============================');

    const userId = req.user._id;
    const userEmail = req.user.email;
    const userRoles = req.user.roles || ['donor'];

    console.log('Fetching requests for email:', userEmail);

    // Get all requests made by this user (by email)
    const requests = await Request.find({ requesterEmail: userEmail })
      .sort({ createdAt: -1 })
      .limit(10);

    console.log('Found requests:', requests.length);
    
    // Log request details for debugging
    requests.forEach(r => {
      console.log('Request:', r._id, 'Status:', r.status, 'Blood:', r.bloodGroupRequired, 'Matched donors:', r.matchedDonors?.length || 0);
    });

    // Calculate statistics
    const totalRequests = requests.length;
    const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'Pending').length;
    const fulfilledRequests = requests.filter(r => r.status === 'fulfilled' || r.status === 'Fulfilled').length;
    const matchedRequests = requests.filter(r => r.status === 'matched' || r.status === 'Matched').length;

    console.log('Stats:', { totalRequests, pendingRequests, fulfilledRequests, matchedRequests });

    // Always get donation history for the user
    console.log('Fetching donations for user:', userId);
    const donations = await Donation.find({ donor: userId })
      .sort({ donatedAt: -1 })
      .limit(10);
    console.log('Found donations:', donations.length);

    // Calculate donation statistics
    const totalDonations = donations.length;
    const completedDonations = donations.filter(d => d.status === 'verified').length;
    const pendingDonations = donations.filter(d => d.status === 'pending').length;

    console.log('Rendering requester dashboard');

    res.render('requester/dashboard', {
      user: req.user,
      requests,
      donations,
      stats: {
        totalRequests,
        pendingRequests,
        fulfilledRequests,
        matchedRequests,
        totalDonations,
        completedDonations,
        pendingDonations
      }
    });
  } catch (err) {
    console.error('=== REQUESTER DASHBOARD ERROR ===');
    console.error('Error message:', err.message);
    console.error('Full error:', err);
    console.error('Stack trace:', err.stack);
    console.error('==================================');
    res.status(500).send('Something went wrong: ' + err.message);
  }
};

exports.createRequest = async (req, res) => {
  try {
    console.log('=== CREATE REQUEST DEBUG ===');
    console.log('Request body:', req.body);
    console.log('User:', req.user);
    console.log('User email:', req.user.email);
    console.log('===========================');

    const {
      patientName,
      bloodGroup,
      unitsRequired,
      hospitalName,
      city,
      contactNumber,
      contactEmail,
      emergencyLevel,
      patientAge,
      additionalMessage
    } = req.body;

    console.log('Blood group from form:', bloodGroup);
    console.log('Is blood group valid:', isBloodGroupValid(bloodGroup));

    if (!isBloodGroupValid(bloodGroup)) {
      console.log('Invalid blood group:', bloodGroup);
      req.flash('error', 'Invalid blood group');
      return res.redirect('/requester/dashboard');
    }

    const request = await Request.create({
      patientName,
      bloodGroupRequired: bloodGroup,
      bloodGroup,
      unitsRequired: unitsRequired || 1,
      hospitalName,
      city,
      contactNumber,
      contactPhone: contactNumber,
      emergencyLevel: emergencyLevel || 'Normal',
      patientAge,
      additionalMessage: additionalMessage || '',
      requesterEmail: (contactEmail || req.user.email || '').trim().toLowerCase() || undefined,
      status: 'pending'
    });

    console.log('Request created:', request._id);
    console.log('Request blood group:', request.bloodGroupRequired);
    console.log('Request requester email:', request.requesterEmail);

    request.matchedDonors = [];
    await request.save();

    const socketEmitters = req.app.get('socketEmitters');

    try {
      await emailRequesterSubmitted(request);
      console.log('Requester email sent successfully');
    } catch (mailErr) {
      console.error('Requester email error:', mailErr.message);
    }

    let notifyResult = { totalMatched: 0, newlyNotified: [], eligibleCount: 0, cooldownCount: 0 };
    try {
      notifyResult = await syncDonorsAndNotify(request, socketEmitters);
      request = notifyResult.request;
      console.log('Donor notify result:', notifyResult);
    } catch (mailErr) {
      console.error('Donor notify error:', mailErr.message);
    }

    if (notifyResult.totalMatched > 0) {
      let msg = `We emailed ${notifyResult.newlyNotified.length} donor(s) to come for doctor screening at the hospital.`;
      if (notifyResult.cooldownCount > 0) {
        msg += ` ${notifyResult.cooldownCount} compatible donor(s) are on the 90-day cooldown and are shown on the matches page.`;
      }
      await createRequesterNotification({
        request,
        title: `${notifyResult.totalMatched} compatible donor(s) found`,
        message: msg,
        type: 'request-match'
      });
      console.log('Created notification for matched donors');
    } else {
      await createRequesterNotification({
        request,
        title: 'Request submitted — searching for donors',
        message: 'No compatible donors in the database yet. Register donors or revisit the matches page later.',
        type: 'admin-alert'
      });
      console.log('Created notification for no donors found');
    }

    req.flash('success', 'Blood request created successfully!');
    res.redirect('/requester/dashboard');
  } catch (err) {
    console.error('=== CREATE REQUEST ERROR ===');
    console.error('Error message:', err.message);
    console.error('Full error:', err);
    console.error('Stack trace:', err.stack);
    console.error('============================');
    req.flash('error', 'Failed to create request. Please try again.');
    res.redirect('/requester/dashboard');
  }
};

exports.toggleRole = async (req, res) => {
  try {
    const { role } = req.body;
    
    console.log('=== TOGGLE ROLE DEBUG ===');
    console.log('Request body:', req.body);
    console.log('User from req.user:', req.user);
    console.log('User ID:', req.user?._id);
    console.log('========================');

    if (!req.user || !req.user._id) {
      console.log('User not authenticated');
      req.flash('error', 'User not authenticated');
      return res.redirect('/login');
    }

    const userId = req.user._id;

    if (!['donor', 'requester'].includes(role)) {
      console.log('Invalid role:', role);
      req.flash('error', 'Invalid role');
      return res.redirect('/dashboard');
    }

    // Use $addToSet for adding role
    const update = { $addToSet: { roles: role } };

    console.log('Update operation:', update);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true, upsert: false, runValidators: false }
    );

    if (!updatedUser) {
      console.log('User not found after update');
      req.flash('error', 'User not found');
      return res.redirect('/dashboard');
    }

    console.log('Updated user roles:', updatedUser.roles);

    req.flash('success', `Requester role enabled successfully`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('=== TOGGLE ROLE ERROR ===');
    console.error('Error message:', err.message);
    console.error('Full error:', err);
    console.error('Stack trace:', err.stack);
    console.error('========================');
    req.flash('error', 'Failed to update role: ' + err.message);
    res.redirect('/dashboard');
  }
};
