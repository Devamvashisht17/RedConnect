const Donor = require('../models/Donor');

async function ensureDonorProfileForUser(user, profileData = {}) {
  if (!user?._id && !user?.id) return null;

  const userId = user?._id || user?.id;
  const normalizedEmail = String(profileData.email || user?.email || '').trim().toLowerCase();

  const baseData = {
    user: userId,
    name: profileData.name || user?.name || '',
    email: normalizedEmail || '',
    phone: profileData.phone || '',
    dob: profileData.dob || '',
    bloodGroup: profileData.bloodGroup || '',
    city: profileData.city || ''
  };

  let donor = await Donor.findOne({ user: userId });

  if (!donor && normalizedEmail) {
    donor = await Donor.findOne({ email: normalizedEmail });
  }

  if (!donor) {
    donor = await Donor.create(baseData);
    return donor;
  }

  const updates = {
    user: donor.user || userId,
    name: baseData.name || donor.name || '',
    email: normalizedEmail || donor.email || '',
    phone: profileData.phone ?? donor.phone ?? '',
    dob: profileData.dob ?? donor.dob ?? '',
    bloodGroup: profileData.bloodGroup ?? donor.bloodGroup ?? '',
    city: profileData.city ?? donor.city ?? ''
  };

  if (donor.user !== userId) donor.user = userId;
  if (donor.name !== updates.name) donor.name = updates.name;
  if (donor.email !== updates.email) donor.email = updates.email;
  if (donor.phone !== updates.phone) donor.phone = updates.phone;
  if (donor.dob !== updates.dob) donor.dob = updates.dob;
  if (donor.bloodGroup !== updates.bloodGroup) donor.bloodGroup = updates.bloodGroup;
  if (donor.city !== updates.city) donor.city = updates.city;

  await donor.save();
  return donor;
}

module.exports = {
  ensureDonorProfileForUser
};
