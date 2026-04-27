"""
발행 플랫폼 감지 모듈
이메일 발신자/제목/링크 URL을 분석하여 어떤 플랫폼에서 발송됐는지 판별합니다.
화물맨(tax12/tax15), 원콜(ONEBILL), 로지노트 등을 자동으로 구분합니다.
"""

import re
import logging
from typing import Dict, Optional
from config import PLATFORM_RULES

logger = logging.getLogger(__name__)


def detect_platform(
    email_subject: str = "",
    email_from: str = "",
    url: str = "",
    page_content: str = "",
) -> str:
    """
    이메일 정보와 URL로 발행 플랫폼 감지
    Returns: 플랫폼명 (예: "화물맨", "원콜(ONEBILL)", "로지노트", "기타")
    """
    text_to_check = f"{email_subject} {email_from} {url} {page_content}".lower()

    for platform_name, rules in PLATFORM_RULES.items():
        # 도메인 체크
        for domain in rules.get("domains", []):
            if domain.lower() in text_to_check:
                logger.info(f"플랫폼 감지 (도메인): {platform_name} ← {domain}")
                return platform_name

        # 제목 키워드 체크
        for kw in rules.get("subject_keywords", []):
            if kw.lower() in email_subject.lower():
                logger.info(f"플랫폼 감지 (제목): {platform_name} ← {kw}")
                return platform_name

        # 발신자 키워드 체크
        for kw in rules.get("sender_keywords", []):
            if kw.lower() in email_from.lower():
                logger.info(f"플랫폼 감지 (발신자): {platform_name} ← {kw}")
                return platform_name

    # URL 기반 추가 감지
    if url:
        domain_match = re.search(r"https?://(?:www\.)?([^/]+)", url)
        if domain_match:
            domain = domain_match.group(1)
            logger.info(f"플랫폼 미식별 - 도메인: {domain}")
            return f"기타({domain})"

    return "기타"


def extract_platform_from_page(page_title: str = "", page_text: str = "") -> str:
    """페이지 내용에서 플랫폼명 추출 (브라우저 진입 후 재감지용)"""
    combined = f"{page_title} {page_text[:500]}".lower()

    platform_keywords = {
        "화물맨": ["화물맨", "hwamulman", "tax12", "tax15"],
        "원콜(ONEBILL)": ["원콜", "onebill", "onecall", "ONEBILL"],
        "전국24시콜화물": ["전국24시", "24시콜", "15887924", "콜화물"],
        "로지노트플러스": ["로지노트플러스", "로지노트 플러스", "logynote plus", "loginote plus"],
        "로지노트": ["로지노트", "loginote", "logynote"],
    }

    for platform, keywords in platform_keywords.items():
        if any(kw.lower() in combined for kw in keywords):
            return platform

    return ""


def get_platform_info(platform_name: str) -> Dict:
    """플랫폼별 부가 정보 반환"""
    info_map = {
        "화물맨": {
            "full_name": "화물맨 전자세금계산서",
            "biz_input_hint": "사업자등록번호 10자리",
            "typical_flow": "링크 → 사업자번호 입력 → 확인 → 계산서 조회",
        },
        "원콜(ONEBILL)": {
            "full_name": "원콜 ONEBILL",
            "biz_input_hint": "사업자등록번호",
            "typical_flow": "링크 → 인증 → 계산서 열람",
        },
        "로지노트플러스": {
            "full_name": "로지노트 플러스",
            "biz_input_hint": "사업자번호",
            "typical_flow": "링크 → 로그인/인증 → 계산서 확인",
        },
        "로지노트": {
            "full_name": "로지노트 물류 플랫폼",
            "biz_input_hint": "사업자번호",
            "typical_flow": "링크 → 로그인/인증 → 계산서 확인",
        },
    }
    return info_map.get(platform_name, {
        "full_name": platform_name,
        "biz_input_hint": "사업자번호",
        "typical_flow": "링크 → 인증 → 계산서",
    })
