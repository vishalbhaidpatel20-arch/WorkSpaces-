/**
 * Smart matching engine.
 *
 * Turns a user's stated requirements into a 0-100 match score per space, plus
 * human-readable reasons so the UI can explain *why* a space was recommended.
 *
 * Each criterion is scored independently on 0..1, then combined with the
 * weights below. Criteria the user left blank score 1 (neutral) so they neither
 * reward nor punish a space.
 */
export const WEIGHTS = {
  capacity:  25, // can it seat the team, without wasting space?
  budget:    25, // does it fit the stated budget?
  amenities: 15, // how many must-have amenities are present?
  location:  15, // is it in the requested city/locality?
  area:      10, // does it meet the area requirement?
  type:       5, // is it the requested workspace type?
  workStyle:  5, // does the host's work style match the team's?
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Seats the team, and ideally without paying for a lot of empty desks. */
function scoreCapacity(space, { persons }) {
  if (!persons) return { score: 1, reason: null };
  if (space.capacity < persons) {
    // Too small, but a near miss is still worth surfacing.
    const shortfall = (persons - space.capacity) / persons;
    return {
      score: clamp01(0.35 - shortfall),
      reason: `Seats ${space.capacity}, ${persons - space.capacity} short of your team of ${persons}`,
    };
  }
  const utilisation = persons / space.capacity;
  if (utilisation >= 0.6) {
    return { score: 1, reason: `Right-sized for ${persons} (capacity ${space.capacity})` };
  }
  // Oversized: fades from 1.0 at 60% utilisation down to 0.5 at near-empty.
  return {
    score: clamp01(0.5 + (utilisation / 0.6) * 0.5),
    reason: `Room to grow - capacity ${space.capacity} for your team of ${persons}`,
  };
}

function scoreBudget(space, { budget }) {
  if (!budget) return { score: 1, reason: null };
  const price = space.price_per_seat_month;
  if (price <= budget) {
    const headroom = Math.round(((budget - price) / budget) * 100);
    return {
      score: 1,
      reason: headroom >= 10
        ? `${headroom}% under your budget at Rs.${price.toLocaleString('en-IN')}/seat`
        : `Within budget at Rs.${price.toLocaleString('en-IN')}/seat`,
    };
  }
  const overBy = (price - budget) / budget;
  return {
    score: clamp01(1 - overBy * 2),
    reason: `${Math.round(overBy * 100)}% over your budget`,
  };
}

function scoreArea(space, { areaRequired }) {
  if (!areaRequired) return { score: 1, reason: null };
  if (space.area_sqft >= areaRequired) {
    return { score: 1, reason: `${space.area_sqft} sq.ft meets your ${areaRequired} sq.ft need` };
  }
  const shortfall = (areaRequired - space.area_sqft) / areaRequired;
  return {
    score: clamp01(1 - shortfall * 1.5),
    reason: `${space.area_sqft} sq.ft, under your ${areaRequired} sq.ft requirement`,
  };
}

function scoreAmenities(space, { amenities }) {
  if (!amenities?.length) return { score: 1, reason: null };
  const have = new Set((space.amenities || []).map((a) => a.slug));
  const matched = amenities.filter((slug) => have.has(slug));
  const missing = amenities.filter((slug) => !have.has(slug));
  return {
    score: matched.length / amenities.length,
    reason: missing.length === 0
      ? `Has all ${amenities.length} amenities you asked for`
      : `${matched.length} of ${amenities.length} amenities (missing: ${missing.join(', ')})`,
  };
}

function scoreLocation(space, { city, locality }) {
  if (!city && !locality) return { score: 1, reason: null };
  const cityHit = city && space.city?.toLowerCase() === city.toLowerCase();
  const localityHit =
    locality && space.locality?.toLowerCase().includes(locality.toLowerCase());
  if (localityHit) return { score: 1, reason: `In ${space.locality}, ${space.city}` };
  if (cityHit) return { score: 0.85, reason: `In ${space.city}` };
  return { score: 0, reason: `Located in ${space.city}, not ${city || locality}` };
}

function scoreType(space, { workspaceType }) {
  if (!workspaceType) return { score: 1, reason: null };
  if (space.workspace_type === workspaceType) {
    return { score: 1, reason: `Matches requested ${label(workspaceType)}` };
  }
  return { score: 0.3, reason: `Offers ${label(space.workspace_type)} instead` };
}

function scoreWorkStyle(space, { workStyle }) {
  if (!workStyle) return { score: 1, reason: null };
  if (!space.work_style) return { score: 0.6, reason: null };
  if (space.work_style === workStyle) {
    return { score: 1, reason: `Shares your "${workStyle}" work style` };
  }
  return { score: 0.5, reason: `Hosts a "${space.work_style}" crowd` };
}

export function label(type) {
  return ({
    private_cabin: 'private cabin',
    shared_desk: 'shared desk',
    dedicated_desk: 'dedicated desk',
    meeting_room: 'meeting room',
  })[type] || type;
}

function fitLabel(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

/**
 * Score one space against a criteria object.
 * @returns {{score:number, fit:string, reasons:string[], breakdown:object}}
 */
export function scoreSpace(space, criteria = {}) {
  const parts = {
    capacity:  scoreCapacity(space, criteria),
    budget:    scoreBudget(space, criteria),
    amenities: scoreAmenities(space, criteria),
    location:  scoreLocation(space, criteria),
    area:      scoreArea(space, criteria),
    type:      scoreType(space, criteria),
    workStyle: scoreWorkStyle(space, criteria),
  };

  let total = 0;
  const breakdown = {};
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const earned = parts[key].score * weight;
    total += earned;
    breakdown[key] = {
      weight,
      earned: Math.round(earned * 10) / 10,
      ratio: Math.round(parts[key].score * 100) / 100,
    };
  }

  // A well-reviewed space edges ahead of an identical one with no track record.
  const ratingBonus = (space.rating || 0) >= 4.5 ? 2 : 0;
  const score = Math.min(100, Math.round(total + ratingBonus));

  return {
    score,
    fit: fitLabel(score),
    reasons: Object.values(parts).map((p) => p.reason).filter(Boolean),
    breakdown,
  };
}

/** Score, attach, and sort a list of spaces best-match first. */
export function rankSpaces(spaces, criteria = {}) {
  return spaces
    .map((space) => ({ ...space, match: scoreSpace(space, criteria) }))
    .sort((a, b) => b.match.score - a.match.score || b.rating - a.rating);
}
