// services/priorityService.js — Core priority scoring engine

const RARE_BLOOD_GROUPS = ['AB-', 'B-', 'A-', 'O-'];

const WEIGHTS = {
  CRITICAL:           1000,
  EMERGENCY:           700,
  URGENT:              400,
  VERIFIED_HOSPITAL:   300,
  RARE_BLOOD:          250,
  CHILD_ELDERLY:       150,
  DONATIONS_10PLUS:    400,
  DONATIONS_5PLUS:     200,
  IS_DONOR:            100,
  WAITING_PER_HOUR:     10,
  NEARBY_5KM:          100,
  NEARBY_10KM:          50,
};

function calculatePriorityScore(request, stats = null, distanceKm = null) {
  let score = 0;

  // Emergency level — always dominates
  if (request.emergencyLevel === 'Critical')      score += WEIGHTS.CRITICAL;
  else if (request.emergencyLevel === 'Urgent')   score += WEIGHTS.EMERGENCY;
  else                                            score += WEIGHTS.URGENT;

  // Rare blood group
  if (RARE_BLOOD_GROUPS.includes(request.bloodGroup)) score += WEIGHTS.RARE_BLOOD;

  // Verified hospital
  if (request.hospitalVerified) score += WEIGHTS.VERIFIED_HOSPITAL;

  // Child or elderly
  if (request.patientAge && (request.patientAge < 12 || request.patientAge > 65)) {
    score += WEIGHTS.CHILD_ELDERLY;
  }

  // Donor benefits — ONLY within same urgency tier to prevent domination
  if (stats && request.emergencyLevel !== 'Critical') {
    if (stats.verifiedDonations >= 10)     score += WEIGHTS.DONATIONS_10PLUS;
    else if (stats.verifiedDonations >= 5) score += WEIGHTS.DONATIONS_5PLUS;
    if (stats.verifiedDonations >= 1)      score += WEIGHTS.IS_DONOR;
  }

  // Location proximity bonus
  if (distanceKm !== null) {
    if (distanceKm <= 5)       score += WEIGHTS.NEARBY_5KM;
    else if (distanceKm <= 10) score += WEIGHTS.NEARBY_10KM;
  }

  // Waiting time — prevents starvation of older requests
  const hoursWaiting = request.createdAt
    ? (Date.now() - new Date(request.createdAt).getTime()) / 3600000
    : 0;
  score += Math.floor(hoursWaiting) * WEIGHTS.WAITING_PER_HOUR;

  return score;
}

function getQueueLevel(emergencyLevel) {
  switch (emergencyLevel) {
    case 'Critical': return 'critical';
    case 'Urgent':   return 'emergency';
    default:         return 'normal';
  }
}

function estimateWaitTime(position, queueLevel) {
  const base = { critical: 5, emergency: 15, priority: 30, normal: 60 };
  return position * (base[queueLevel] || 60);
}

module.exports = { calculatePriorityScore, getQueueLevel, estimateWaitTime, RARE_BLOOD_GROUPS, WEIGHTS };
