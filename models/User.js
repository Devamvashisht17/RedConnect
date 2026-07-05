const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  password:   { type: String },
  profilePic: { type: String, default: '' },
  googleId:   { type: String },
  activity:   { type: String },
  roles:      { type: [String], enum: ['donor', 'requester'], default: ['donor'] },
  createdAt:  { type: Date, default: Date.now }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
