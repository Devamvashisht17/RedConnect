const BloodRequest = require('../models/BloodRequest');

exports.getRequest = (req, res) => res.render('request');

exports.postRequest = async (req, res) => {
  try {
    await BloodRequest.create({
      patientName:    req.body.patientName,
      bloodGroup:     req.body.bloodGroup,
      hospitalName:   req.body.hospitalName,
      city:           req.body.city,
      contactName:    req.body.contactName,
      contactPhone:   req.body.contactPhone,
      emergencyLevel: req.body.emergencyLevel
    });
    res.redirect('/thankyou?name=' + encodeURIComponent(req.body.contactName || 'User'));
  } catch (err) {
    console.error('Blood request error:', err.message);
    res.redirect('/request');
  }
};
