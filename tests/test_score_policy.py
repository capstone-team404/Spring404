import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from score_policy import review_evidence, combine_score
from review_analysis import build_analysis


def row(stars=5, ai=1, user=1, id=1, weight=1):
    return dict(id=id,user_id=user,user_score=stars,ai_score=ai,reliability_weight=weight,reliability_status='normal')


def test_stars_dominate_and_one_review_is_smoothed():
    result = review_evidence([row()])
    assert result['review_raw_score'] == pytest.approx(4.2)
    assert result['review_safety_score'] == pytest.approx(3.4)
    assert review_evidence([row(stars=1,ai=5)])['review_raw_score'] == pytest.approx(1.8)


def test_repeat_author_cannot_outweigh_independent_visitors():
    single = review_evidence([row()])
    repeat = review_evidence([row(id=i) for i in range(100)])
    assert repeat == single
    assert review_evidence([row(weight=.25,id=i) for i in range(100)]) == review_evidence([row(weight=.25)])
    independent = review_evidence([row(user=i,id=i) for i in range(10)])
    assert independent['review_safety_score'] > single['review_safety_score']


def test_missing_public_does_not_lower_valid_review_and_empty_is_gray():
    evidence = review_evidence([row()])
    result = combine_score({}, evidence)
    assert result['score_basis'] == 'reviews'
    assert result['final_safety_score'] == round(evidence['review_safety_score'],2)
    assert combine_score({},review_evidence([]))['score_status'] == 'insufficient_data'
    assert combine_score({'cctv_count':1,'public_safety_score':0},review_evidence([]))['score_status'] == 'available'


def test_repeated_low_reviews_still_produce_low_score():
    result = combine_score({}, review_evidence([row(stars=1,ai=1,user=i,id=i) for i in range(10)]))
    assert result['final_safety_score'] < 2
    assert result['score_is_provisional'] is False


def test_reliability_does_not_penalize_disagreeing_stars():
    text = '저녁 골목에 조명이 밝고 편의점이 영업 중이었습니다.'
    payload = {'ai_score':4,'tags':['밝은 조명'],'summary':'밝은 조명'}
    a,b = (build_analysis(text,stars,payload,'openai') for stars in (1,5))
    assert a['reliability_weight'] == b['reliability_weight']
    assert '스토킹·수상한 사람' not in build_analysis('불안함이 적고 편안했습니다')['tags']
