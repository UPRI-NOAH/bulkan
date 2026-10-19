import { state } from './state.js';
import { SCHOOLS_URL } from './config.js';

export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getSchoolRiskStatusByDistance(distanceKm) {
  if (distanceKm <= 3) return 'Critical';
  if (distanceKm <= 6) return 'Priority';
  if (distanceKm <= 10) return 'Moderate';
  return 'Low';
}

function getSchoolRiskStatus(hazardLevel) {
  return { High: 'Critical', Moderate: 'Priority', Low: 'Moderate', 'Little to None': 'Low' }[hazardLevel] || 'Low';
}

function getSchoolType(schoolId) {
  if (!schoolId) return 'Other';
  const id = parseInt(schoolId);
  if (id >= 300000 && id < 400000) return 'High School';
  if (id >= 100000 && id < 200000) return 'Elementary';
  return 'Other';
}

export async function loadDepEdSchools() {
  const res = await fetch(SCHOOLS_URL);
  if (!res.ok) throw new Error(`Failed to load schools: HTTP ${res.status}`);
  const raw = await res.json();

  state.allDepEdSchools = raw.map(s => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    hazard: s.hazard || 'Little to None',
    type: getSchoolType(s.id),
    municipality: s.municipality || '',
    province: s.province || '',
    status: getSchoolRiskStatus(s.hazard),
  }));

  console.log(`[schools] loaded ${state.allDepEdSchools.length} DepEd schools`);
  return state.allDepEdSchools.length;
}

export function getDepEdSchoolsInRadius(volcanLat, volcanLng, radiusKm) {
  const inRadius = state.allDepEdSchools
    .map(s => ({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      distance: calculateDistance(volcanLat, volcanLng, s.lat, s.lng),
      type: s.type,
      isDepEd: true,
    }))
    .filter(s => s.distance <= radiusKm)
    .map(s => ({ ...s, status: getSchoolRiskStatusByDistance(s.distance) }));

  return {
    elementary: inRadius.filter(s => s.type === 'Elementary').sort((a, b) => a.distance - b.distance),
    highSchool: inRadius.filter(s => s.type === 'High School').sort((a, b) => a.distance - b.distance),
    total: inRadius,
  };
}
