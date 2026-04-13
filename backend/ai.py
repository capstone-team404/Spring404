import json

def yuna_engine(text: str) -> float:
    try:
        # 🔥 지금은 mock AI 결과
        mock_ai = {
            "lighting": 4,
            "crowd": 5,
            "infrastructure": 3
        }

        base_score = (
            mock_ai['lighting'] * 0.5 +
            mock_ai['crowd'] * 0.3 +
            mock_ai['infrastructure'] * 0.2
        )

        
        danger_keywords = ["칼", "취객", "무서워", "공사", "담배", "어두워"]
        bonus = 0

        for word in danger_keywords:
            if word in text:
                bonus += 0.5

        return min(5.0, base_score + bonus)

    except:
        return 0.0