// services/gamificationService.js

const DonorStats = require('../models/DonorStats');
const { RARE_BLOOD_GROUPS } = require('./priorityService');

const POINTS = { BASE: 100, EMERGENCY_BONUS: 50, RARE_BONUS: 75 };

const BADGES = [
  { id: 'bronze',    name: 'Bronze Donor',      icon: '🥉', minDonations: 1,  desc: 'First donation' },
  { id: 'silver',    name: 'Silver Donor',       icon: '🥈', minDonations: 3,  desc: '3 verified donations' },
  { id: 'gold',      name: 'Gold Donor',         icon: '🥇', minDonations: 5,  desc: '5 verified donations' },
  { id: 'platinum',  name: 'Platinum Lifesaver', icon: '💎', minDonations: 10, desc: '10+ donations' },
  { id: 'emergency', name: 'Emergency Hero',     icon: '🚨', minEmergency: 1,  desc: 'Emergency donation' },
  { id: 'rare',      name: 'Rare Guardian',      icon: '🩸', minRare: 1,       desc: 'Rare blood donation' },
];

async function awardDonation(userId, donation) {
  let stats = await DonorStats.findOne({ user: userId });
  if (!stats) stats = new DonorStats({ user: userId });

  let points = POINTS.BASE;
  if (donation.isEmergency) { points += POINTS.EMERGENCY_BONUS; stats.emergencyDonations += 1; }
  if (RARE_BLOOD_GROUPS.includes(donation.bloodGroup)) { points += POINTS.RARE_BONUS; stats.rareDonations += 1; }

  stats.totalDonations    += 1;
  stats.verifiedDonations += 1;
  stats.totalPoints       += points;
  stats.livesSaved        += 1;
  stats.lastDonationAt     = new Date();
  stats.cooldownUntil      = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  stats.donorLevel         = stats.computeLevel();

  // Award new badges
  const earned = BADGES.filter(b => {
    if (b.minDonations && stats.verifiedDonations >= b.minDonations) return true;
    if (b.minEmergency && stats.emergencyDonations >= b.minEmergency) return true;
    if (b.minRare      && stats.rareDonations      >= b.minRare)      return true;
    return false;
  });

  for (const badge of earned) {
    if (!stats.badges.some(b => b.name === badge.name)) {
      stats.badges.push({ name: badge.name, icon: badge.icon, description: badge.desc });
    }
  }

  await stats.save();
  return { stats, pointsEarned: points };
}

async function getLeaderboard(limit = 10) {
  return DonorStats.find({ verifiedDonations: { $gt: 0 } })
    .sort({ totalPoints: -1 }).limit(limit)
    .populate('user', 'name profilePic');
}

async function isInCooldown(userId) {
  const stats = await DonorStats.findOne({ user: userId });
  if (!stats?.cooldownUntil) return false;
  return new Date() < stats.cooldownUntil;
}

function getNextLevelInfo(stats) {
  const levels = [{ name: 'Bronze', min: 1 }, { name: 'Silver', min: 3 }, { name: 'Gold', min: 5 }, { name: 'Platinum', min: 10 }];
  const cur  = stats.verifiedDonations;
  const next = levels.find(l => l.min > cur);
  if (!next) return { nextLevel: 'Max', progress: 100, needed: 0 };
  const prev    = levels.filter(l => l.min <= cur).pop();
  const prevMin = prev ? prev.min : 0;
  const progress = Math.round(((cur - prevMin) / (next.min - prevMin)) * 100);
  return { nextLevel: next.name, progress, needed: next.min - cur };
}

module.exports = { awardDonation, getLeaderboard, isInCooldown, getNextLevelInfo, BADGES, POINTS };
