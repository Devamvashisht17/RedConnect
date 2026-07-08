const DoctorScreening = require('../models/DoctorScreening');
const Donor = require('../models/Donor');
const Request = require('../models/Request');
const { createCertificate } = require('./certificateController');
const {
  sendDonorFitMail,
  sendRequesterDonorFoundMail,
  sendDonorUnfitMail
} = require('../services/emailService');

// GET /admin/screening
exports.screeningDashboard = async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    const limit = 15;
    const skip = (parseInt(page) - 1) * limit;

    const filter = {};
    if (status && ['Pending', 'Fit', 'Unfit'].includes(status)) {
      filter.screeningStatus = status;
    }
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [
        { donorName: re },
        { bloodGroup: re },
      ];
    }

    const [records, total, stats] = await Promise.all([
      DoctorScreening.find(filter)
        .populate('request', 'patientName bloodGroupRequired hospitalName city emergencyLevel requesterEmail contactName createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DoctorScreening.countDocuments(filter),
      DoctorScreening.aggregate([
        { $group: { _id: '$screeningStatus', count: { $sum: 1 } } }
      ])
    ]);

    const statMap = { Pending: 0, Fit: 0, Unfit: 0 };
    stats.forEach(s => { if (statMap[s._id] !== undefined) statMap[s._id] = s.count; });

    res.render('admin/screening', {
      user: req.user,
      records,
      stats: statMap,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      currentStatus: status || '',
      currentSearch: search || ''
    });
  } catch (err) {
    console.error('Screening dashboard error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

// POST /admin/screening/:id/fit
exports.markFit = async (req, res) => {
  try {
    const { doctorName, remarks } = req.body;
    const screening = await DoctorScreening.findById(req.params.id);
    if (!screening) return res.status(404).json({ success: false, error: 'Record not found.' });
    if (screening.screeningStatus !== 'Pending') {
      return res.status(400).json({ success: false, error: 'Already processed.' });
    }

    screening.screeningStatus = 'Fit';
    screening.donationStatus  = 'Eligible';
    screening.doctorName      = doctorName || '';
    screening.remarks         = remarks || '';
    screening.screeningDate   = new Date();
    await screening.save();

    let donor = await Donor.findById(screening.donor);
    if (!donor && screening.donorEmail) {
      donor = await Donor.findOne({ email: screening.donorEmail });
    }
    const request = await Request.findById(screening.request);

    console.log('[SCREENING] markFit - donor:', donor?._id, donor?.name, 'request:', request?._id);

    if (donor && request) {
      try {
        const cert = await createCertificate({ donor, user: donor.user || null, request });
        console.log('[SCREENING] Certificate created:', cert.certificateId);
      } catch (e) {
        console.error('[SCREENING] Certificate creation failed:', e.message);
      }
    } else {
      console.warn('[SCREENING] Skipping certificate - donor:', !!donor, 'request:', !!request);
    }

    if (donor) {
      sendDonorFitMail(donor, screening).catch(e =>
        console.error('Fit email to donor failed:', e.message)
      );
    }

    if (donor && request && screening.requesterEmail) {
      sendRequesterDonorFoundMail(screening.requesterEmail, donor, screening, request).catch(e =>
        console.error('Fit email to requester failed:', e.message)
      );
    }

    res.json({ success: true, message: 'Donor marked as Fit. Emails sent.' });
  } catch (err) {
    console.error('Mark fit error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /admin/screening/:id/unfit
exports.markUnfit = async (req, res) => {
  try {
    const { doctorName, remarks } = req.body;
    const screening = await DoctorScreening.findById(req.params.id);
    if (!screening) return res.status(404).json({ success: false, error: 'Record not found.' });
    if (screening.screeningStatus !== 'Pending') {
      return res.status(400).json({ success: false, error: 'Already processed.' });
    }

    screening.screeningStatus = 'Unfit';
    screening.donationStatus = 'Rejected';
    screening.doctorName = doctorName || '';
    screening.remarks = remarks || '';
    screening.screeningDate = new Date();
    await screening.save();

    const donor = await Donor.findById(screening.donor);

    // Email donor only — no email to requester
    if (donor) {
      sendDonorUnfitMail(donor, screening).catch(e =>
        console.error('Unfit email to donor failed:', e.message)
      );
    }

    res.json({ success: true, message: 'Donor marked as Unfit. Email sent to donor.' });
  } catch (err) {
    console.error('Mark unfit error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /admin/screening/:id — JSON details for modal
exports.getDetails = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID.' });
    }
    const record = await DoctorScreening.findById(req.params.id)
      .populate('request', 'patientName bloodGroupRequired hospitalName city emergencyLevel contactNumber requesterEmail contactName createdAt')
      .lean();
    if (!record) return res.status(404).json({ success: false, error: 'Not found.' });
    res.json({ success: true, record });
  } catch (err) {
    console.error('getDetails error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
