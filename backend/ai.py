import openai
import os

openai.api_key = "YOUR_API_KEY"

def analyze_review(text):
    return 3
    """
    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "이 텍스트의 위험도를 1~5 점수로 평가해줘"},
            {"role": "user", "content": text}
        ]
    )

    score = response["choices"][0]["message"]["content"]
    
    try:
        return int(score)
    except:
    """
