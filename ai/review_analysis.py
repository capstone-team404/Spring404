from pathlib import Path
import importlib.util


# AI와 백엔드가 서로 독립 배포되므로 AI 서비스 내부에서도 동일 규칙을 사용합니다.
_backend_rules = Path(__file__).resolve().parents[1] / "backend" / "review_analysis.py"
if _backend_rules.exists():
    _spec = importlib.util.spec_from_file_location("hereji_shared_review_analysis", _backend_rules)
    _module = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_module)
    build_analysis = _module.build_analysis
    ALLOWED_TAGS = _module.ALLOWED_TAGS
else:
    raise RuntimeError("Shared review analysis rules are missing")
