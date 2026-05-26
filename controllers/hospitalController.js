// controllers/hospitalController.js
const Hospital   = require('../models/Hospital');
const Donation   = require('../models/Donation');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { enqueue }            = require('../services/queueService');
const { geocodeAddress }     = require('../services/locationService');
const { notifyNearbyDonors } = require('../services/notificationService');

exports.showLogin    = (req, res) => res.render('hospital/login',    { error: null });
exports.showRegister = (req, res) => res.render('hospital/register', { error: null });

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, address, city } = req.body;
    if (await Hospital.findOne({ email }))
      return res.render('hospital/register', { error: 'Already registered. Please login.' });
    const hashed  = await bcrypt.hash(password, 10);
    const coords  = await geocodeAddress(`${address}, ${city}`);
    const hospital = await Hospital.create({
      name, email, password: hashed, phone, address, city,
      location: coords ? { type: 'Point', coordinates: [coords.lng, coords.lat] } : undefined
    });
    res.render('hospital/pending', { hospital });
  } catch (err) {
    if (err.code === 11000)
      return res.render('hospital/register', { error: 'Already registered. Please login.' });
    res.render('hospital/register', { error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const hospital = await Hospital.findOne({ email });
    if (!hospital) return res.render('hospital/login', { error: 'Hospital not found.' });
    if (!await bcrypt.compare(password, hospital.password)) return res.render('hospital/login', { error: 'Incorrect password.' });
    if (!hospital.isVerified) return res.render('hospital/login', { error: 'Your hospital is pending admin verification.' });
    const token = jwt.sign({ id: hospital._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('hospitalToken', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/hospital/dashboard');
  } catch (err) {
    res.render('hospital/login', { error: err.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const BloodRequest = mongoose.model('BloodRequest');
    const requests = await BloodRequest.find({ hospitalRef: req.hospital._id }).sort({ createdAt: -1 }).limit(10);
    const donations = await Donation.find({ hospitalRef: req.hospital._id, status: 'pending' }).limit(10);
    res.render('hospital/dashboard', { hospital: req.hospital, requests, donations });
  } catch (err) {
    res.status(500).send('Something went wrong.');
  }
};

exports.createEmergencyRequest = async (req, res) => {
  try {
    const BloodRequest = mongoose.model('BloodRequest');
    const {
      patientName,
      bloodGroup,
      bloodGroupRequired,
      emergencyLevel,
      contactPhone,
      contactNumber,
      patientAge
    } = req.body;
    const resolvedBloodGroup = bloodGroupRequired || bloodGroup;
    const resolvedContactNumber = contactNumber || contactPhone;
    const request = await BloodRequest.create({
      patientName,
      bloodGroupRequired: resolvedBloodGroup,
      bloodGroup: resolvedBloodGroup,
      emergencyLevel,
      contactNumber: resolvedContactNumber,
      contactPhone: resolvedContactNumber,
      unitsRequired: 1,
      patientAge: parseInt(patientAge) || null,
      hospitalName: req.hospital.name, city: req.hospital.city,
      hospitalRef: req.hospital._id, hospitalVerified: true,
      location: req.hospital.location
    });
    await enqueue(request);
    const io      = req.app.get('io');
    const emitters = req.app.get('socketEmitters');
    const notified = await notifyNearbyDonors(request, io);
    if (emitters && emergencyLevel === 'Critical') emitters.broadcastEmergency(request);
    if (emitters) emitters.broadcastQueueUpdate();
    res.json({ success: true, requestId: request._id, notifiedDonors: notified });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const { bloodGroup, units } = req.body;
    const hospital = await Hospital.findById(req.hospital._id);
    const item = hospital.inventory.find(i => i.bloodGroup === bloodGroup);
    if (item) { item.units = parseInt(units); item.updatedAt = new Date(); }
    else hospital.inventory.push({ bloodGroup, units: parseInt(units) });
    await hospital.save();
    res.json({ success: true, units: parseInt(units) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.fulfillRequest = async (req, res) => {
  try {
    const BloodRequest = mongoose.model('BloodRequest');
    const Queue        = require('../models/Queue');
    const { recalculatePositions } = require('../services/queueService');

    const request = await BloodRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Mark request as fulfilled
    request.status = 'Fulfilled';
    await request.save();

    // Remove from queue
    const entry = await Queue.findOne({ request: req.params.requestId });
    if (entry) {
      const level = entry.queueLevel;
      await Queue.findByIdAndDelete(entry._id);
      await recalculatePositions(level);
    }

    // Broadcast queue update
    const emitters = req.app.get('socketEmitters');
    if (emitters) emitters.broadcastQueueUpdate();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('hospitalToken');
  res.redirect('/hospital/login');
};
