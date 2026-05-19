const Volunteer = require('../models/Volunteer');

exports.getVolunteer = (req, res) => res.render('volunteer');

exports.postVolunteer = async (req, res) => {
  try {
    const v = await Volunteer.create({
      name:         req.body.name,
      email:        req.body.email,
      phone:        req.body.phone,
      age:          req.body.age,
      city:         req.body.city,
      availability: req.body.availability,
      skills:       req.body.skills
    });
    res.redirect('/thankyou?name=' + encodeURIComponent(v.name));
  } catch (err) {
    console.error('Volunteer error:', err.message);
    res.redirect('/volunteer');
  }
};
