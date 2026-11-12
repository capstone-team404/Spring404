"""Explainable facility availability index. Not a crime-risk estimate."""
import math


def score_facilities(zone, sources):
    if not zone.get('in_collection_area'):
        return None, []
    components=[]
    for key, field, weight, scale in (
        ('cctv','cctv_count',.4,1),
        ('convenience','convenience_count',.3,1),
        ('streetlight','streetlight_count',.1,2),
        ('security_light','security_light_count',.1,2),
    ):
        state=sources.get(key,{})
        count=zone.get(field)
        if (not state.get('has_data') or state.get('stale') or state.get('estimated_coordinates')
                or count is None or (state.get('partial') and count == 0)):
            continue
        count=max(0,float(count))
        # Diminishing returns prevent one dense inventory from dominating forever.
        value=1-math.exp(-count/scale)
        components.append({'source':key,'value':round(value,6),'weight':weight,'count':count})
    police=sources.get('police',{})
    distance=zone.get('nearest_police_distance_m')
    if police.get('has_data') and not police.get('stale') and distance is not None:
        value=max(0,1-float(distance)/1000)
        components.append({'source':'police','value':round(value,6),'weight':.1,'distance_m':distance})
    if not components:
        return None, []
    return round(5*sum(c['value']*c['weight'] for c in components)/sum(c['weight'] for c in components),2), components
