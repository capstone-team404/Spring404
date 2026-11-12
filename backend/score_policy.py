"""Provisional experience index, not a probability of crime or a safety guarantee."""
from collections import defaultdict

USER_STAR_WEIGHT = 0.8
PRIOR_SCORE = 3.0
PRIOR_WEIGHT = 0.5


def review_evidence(rows):
    # One author's repeated posts cannot outweigh several independent visitors.
    authors = defaultdict(list)
    for row in rows:
        weight = max(0, min(1, float(row.get('reliability_weight') or 0)))
        if row.get('reliability_status') == 'rejected' or weight == 0:
            continue
        stars = float(row['user_score'])
        ai = row.get('ai_score')
        score = stars if ai is None else USER_STAR_WEIGHT * stars + (1 - USER_STAR_WEIGHT) * float(ai)
        authors[row.get('user_id') or ('deleted', row['id'])].append((score, weight))
    votes = []
    for values in authors.values():
        total = sum(w for _, w in values)
        votes.append((sum(s*w for s, w in values) / total, max(w for _, w in values)))
    total = sum(w for _, w in votes)
    raw = sum(s*w for s, w in votes) / total if total else None
    smoothed = (sum(s*w for s, w in votes) + PRIOR_SCORE*PRIOR_WEIGHT) / (total+PRIOR_WEIGHT) if total else None
    return {'review_safety_score': smoothed, 'review_raw_score': raw,
            'review_author_count': len(votes), 'review_evidence_weight': round(total, 2)}


def combine_score(public_zone, evidence):
    public = float(public_zone.get('public_safety_score') or 0)
    counts = sum(max(0, int(public_zone.get(k) or 0)) for k in
                 ('cctv_count', 'lamp_count', 'convenience_count', 'police_count'))
    has_public = public_zone.get('facility_score_available', False) or public > 0 or counts > 0
    review = evidence['review_safety_score']
    # Few observed facilities do not establish that a street is dangerous.
    # Pull this provisional facility index toward a neutral prior, not toward zero.
    facility = public if has_public else None
    if review is not None and facility is not None:
        final = review * .7 + facility * .3
    else:
        final = review if review is not None else facility
    return {**evidence, 'public_safety_score': public,
            'facility_adjusted_score': round(facility, 2) if facility is not None else None,
            'final_safety_score': round(final, 2) if final is not None else 0.0,
            'score_status': 'available' if final is not None else 'insufficient_data',
            'score_basis': 'reviews_and_facilities' if review is not None and has_public else
                           'reviews' if review is not None else 'facilities' if has_public else 'none',
            'score_is_provisional': evidence['review_author_count'] < 3,
            'score_policy_version': 'facility-integrated-v1'}
