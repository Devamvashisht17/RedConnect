// services/locationService.js — Geospatial donor matching

const DonorStats = require('../models/DonorStats');
const mongoose   = require('mongoose');

const BLOOD_COMPATIBILITY = {
  'O-':  ['O-','O+','A-','A+','B-','B+','AB-','AB+'],
  'O+':  ['O+','A+','B+','AB+'],
  'A-':  ['A-','A+','AB-','AB+'],
  'A+':  ['A+','AB+'],
  'B-':  ['B-','B+','AB-','AB+'],
  'B+':  ['B+','AB+'],
  'AB-': ['AB-','AB+'],
  'AB+': ['AB+'],
};

/**
 * Find nearby available donors matching blood group within radius
 * Auto-expands radius if no donors found
 */
async function findNearbyDonors(lat, lng, bloodGroup, options = {}) {
  const { maxRadiusKm = 20, limit = 20 } = options;
  const compatibleGroups = BLOOD_COMPATIBILITY[bloodGroup] || [bloodGroup];
  const radii = [5, 10, 20, maxRadiusKm];

  for (const radiusKm of radii) {
    const donors = await DonorStats.find({
      location: {
        $near: {
          $geometry:    { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000 // metres
        }
      },
      bloodGroup:    { $in: compatibleGroups },
      isAvailable:   true,
      $or: [
        { cooldownUntil: { $exists: false } },
        { cooldownUntil: { $lt: new Date() } }
      ]
    })
    .limit(limit)
    .populate('user', 'name email phone profilePic');

    if (donors.length > 0) {
      return { donors, radiusKm, expanded: radiusKm > 5 };
    }
  }

  return { donors: [], radiusKm: maxRadiusKm, expanded: true };
}

/**
 * Calculate straight-line distance between two coordinates (Haversine)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * (Math.PI / 180); }

/**
 * Estimate travel time in minutes (assumes 30km/h average city speed)
 */
function estimateTravelTime(distanceKm) {
  return Math.ceil((distanceKm / 30) * 60);
}

/**
 * Geocode a city/address using Nominatim (OpenStreetMap) — free, no API key
 */
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res  = await fetch(url, { headers: { 'User-Agent': 'RedConnect/1.0' } });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    console.error('Geocode error:', err.message);
    return null;
  }
}

module.exports = { findNearbyDonors, calculateDistance, estimateTravelTime, geocodeAddress, BLOOD_COMPATIBILITY };
