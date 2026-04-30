"""
브라우저 자동화 모듈 v2
원콜 등 메일의 상세보기 URL만 열고(공동인증·ActiveX·보안모듈 경로 없음),
사업자번호 입력·확인·승인/발행 계열 버튼을 누른 뒤 세금계산서 영역을 캡처한다.
"""

import asyncio
import logging
import re
import time
from pathlib import Path
from typing import Dict, List, Optional
from playwright.async_api import async_playwright, Page, Browser, BrowserContext, ElementHandle

from config import (
    BROWSER_CONFIG, BUSINESS_CONFIG,
    BIZ_NUMBER_INPUT_SELECTORS, CONFIRM_BUTTON_SELECTORS,
    ISSUE_APPROVE_BUTTON_SELECTORS,
    is_blocked_tax_invoice_url, is_excluded_tax_platform, is_blocked_invoice_email,
)
from platform_detector import detect_platform, extract_platform_from_page

logger = logging.getLogger(__name__)


def _attach_image_request_logging(page: Page, label: str) -> None:
    """gif/jpg 등 이미지 요청 URL을 로그로 남김."""

    def on_request(req):  # sync callback
        try:
            u = req.url or ""
            rt = req.resource_type or ""
            base = u.split("?", 1)[0].lower()
            if rt == "image" or base.endswith(
                (".gif", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".bmp", ".ico")
            ):
                logger.info("[%s] 이미지 리소스 요청 (%s) %s", label, rt, u[:300])
        except Exception:
            pass

    page.on("request", on_request)


async def _log_page_image_elements(page: Page, label: str) -> None:
    try:
        rows = await page.eval_on_selector_all(
            "img",
            """els => els.slice(0, 60).map((e, i) => ({
                i,
                src: String(e.currentSrc || e.src || '').slice(0, 300),
                complete: !!e.complete,
                nw: e.naturalWidth,
                nh: e.naturalHeight
            }))""",
        )
        if not rows:
            logger.info("[%s] DOM: <img> 없음", label)
            return
        for r in rows:
            logger.info(
                "[%s] img #%s complete=%s natural=%sx%s %s",
                label,
                r.get("i"),
                r.get("complete"),
                r.get("nw"),
                r.get("nh"),
                r.get("src"),
            )
    except Exception as e:
        logger.debug("[%s] img DOM 로그 실패: %s", label, e)


async def _wait_for_invoice_images_loaded(page: Page, timeout_ms: int) -> None:
    """img가 있으면 complete·naturalWidth>0 될 때까지 최대 timeout_ms."""
    logger.info("세금계산서 이미지 로드 대기 (최대 %dms)", timeout_ms)
    try:
        await page.wait_for_function(
            """() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                if (!imgs.length) return true;
                return imgs.every(i => i.complete && i.naturalWidth > 0);
            }""",
            timeout=timeout_ms,
        )
        logger.info("이미지 로드 조건 충족(또는 img 없음)")
    except Exception as e:
        logger.warning("이미지 완전 로드 미충족(캡처는 계속): %s", e)


async def click_issue_approve_hunt(
    page: Page,
    total_timeout_ms: int,
    per_selector_timeout_ms: int = 1200,
) -> int:
    """
    [승인]/[발행]을 이미지 로드보다 우선해 반복 탐색한다.
    total_timeout_ms 동안 라운드를 돌며 보이는 버튼부터 클릭.
    """
    deadline = time.monotonic() + total_timeout_ms / 1000.0
    total_clicks = 0
    round_id = 0
    while time.monotonic() < deadline:
        round_id += 1
        round_clicks = 0
        for selector in ISSUE_APPROVE_BUTTON_SELECTORS:
            if time.monotonic() >= deadline:
                break
            try:
                loc = page.locator(selector).first
                if await loc.is_visible(timeout=per_selector_timeout_ms):
                    await loc.scroll_into_view_if_needed()
                    await loc.click(timeout=8000)
                    round_clicks += 1
                    total_clicks += 1
                    logger.info("승인/발행 우선 클릭 (라운드 %d): %s", round_id, selector)
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=12000)
                    except Exception:
                        pass
                    await asyncio.sleep(0.35)
            except Exception:
                continue
        if round_clicks == 0:
            await asyncio.sleep(0.35)
    logger.info(
        "승인/발행 우선 탐색 종료 (한도 %dms): 총 %d회 클릭",
        total_timeout_ms,
        total_clicks,
    )
    return total_clicks


# ─── 사업자번호 입력 ──────────────────────────────────────────────────────────

async def find_biz_number_input(page: Page) -> Optional[ElementHandle]:
    """
    공통 속성 기반으로 사업자번호 입력창 탐색
    input[type='text'], input[type='number'], input[type='tel'],
    placeholder 키워드, name/id 키워드 순서로 시도
    """
    for selector in BIZ_NUMBER_INPUT_SELECTORS:
        try:
            elements = await page.query_selector_all(selector)
            for el in elements:
                if await el.is_visible():
                    return el
        except Exception:
            continue

    # 최후 수단: 보이는 모든 input
    try:
        inputs = await page.query_selector_all("input:visible")
        for inp in inputs:
            t = (await inp.get_attribute("type") or "text").lower()
            if t in ("text", "number", "tel"):
                return inp
    except Exception:
        pass

    return None


async def input_business_number(page: Page) -> bool:
    """사업자번호 자동 입력. 성공 시 True 반환."""
    biz_no = BUSINESS_CONFIG["business_number"]        # 10자리 숫자
    biz_no_fmt = BUSINESS_CONFIG["business_number_formatted"]  # 141-81-42581

    el = await find_biz_number_input(page)
    if not el:
        logger.warning("사업자번호 입력창을 찾지 못했습니다.")
        return False

    try:
        await el.scroll_into_view_if_needed()
        await el.click()
        await el.fill("")
        await asyncio.sleep(0.2)

        # placeholder로 하이픈 포함 여부 결정
        placeholder = (await el.get_attribute("placeholder") or "").lower()
        max_len_attr = await el.get_attribute("maxlength")
        max_len = int(max_len_attr) if max_len_attr and max_len_attr.isdigit() else 12

        use_formatted = "-" in placeholder or max_len >= 12
        value_to_type = biz_no_fmt if use_formatted else biz_no

        await el.type(value_to_type, delay=60)
        logger.info(f"사업자번호 입력 완료: {value_to_type}")
        try:
            await el.press("Enter")
            await asyncio.sleep(0.4)
        except Exception:
            try:
                await page.keyboard.press("Enter")
                await asyncio.sleep(0.4)
            except Exception:
                pass
        return True
    except Exception as e:
        logger.error(f"사업자번호 입력 실패: {e}")
        return False


# ─── 확인 버튼 클릭 ───────────────────────────────────────────────────────────

async def click_confirm_button(page: Page) -> bool:
    """공통 선택자로 확인/조회 버튼 클릭"""
    # 버튼 클릭 후 networkidle 대기 60초, 초과 시 domcontentloaded로 폴백
    _WAIT_MS = 60000
    sel_timeout = int(BROWSER_CONFIG.get("confirm_selector_timeout_ms", 10_000))

    for selector in CONFIRM_BUTTON_SELECTORS:
        try:
            el = await page.wait_for_selector(selector, timeout=sel_timeout, state="visible")
            if el:
                await el.scroll_into_view_if_needed()
                await el.click()
                logger.info(f"확인 버튼 클릭: {selector}")
                try:
                    await page.wait_for_load_state("networkidle", timeout=_WAIT_MS)
                except Exception:
                    logger.warning("networkidle 초과 — domcontentloaded로 폴백")
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=_WAIT_MS)
                    except Exception:
                        pass
                return True
        except Exception:
            continue

    # Enter 키 fallback
    try:
        await page.keyboard.press("Enter")
        try:
            await page.wait_for_load_state("networkidle", timeout=_WAIT_MS)
        except Exception:
            logger.warning("Enter 후 networkidle 초과 — domcontentloaded로 폴백")
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=_WAIT_MS)
            except Exception:
                pass
        logger.info("Enter 키로 제출")
        return True
    except Exception as e:
        logger.error(f"확인 버튼 클릭 실패: {e}")
        return False


async def click_issue_approve_if_present(page: Page) -> int:
    """
    원콜·전자세금 뷰어 등: '승인'·'발행' 계열 노출 시 클릭.
    공동인증·ActiveX·보안 프로그램 설치는 사용하지 않음.
    """
    clicks = 0
    vis_timeout = 2500
    for selector in ISSUE_APPROVE_BUTTON_SELECTORS:
        try:
            loc = page.locator(selector).first
            if await loc.is_visible(timeout=vis_timeout):
                await loc.scroll_into_view_if_needed()
                await loc.click(timeout=8000)
                clicks += 1
                logger.info("승인/발행 계열 클릭: %s", selector)
                await asyncio.sleep(1.0)
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=15000)
                except Exception:
                    pass
        except Exception:
            continue
    return clicks


# ─── 사업자번호 입력 화면 감지 ────────────────────────────────────────────────

async def needs_biz_number(page: Page) -> bool:
    """
    보이는 사업자번호 입력 칸이 있으면 True.
    (한메일 보안·열람 게이트 등 — 키워드 미일치여도 입력 시도)
    """
    try:
        el = await find_biz_number_input(page)
        return el is not None
    except Exception:
        return False


# ─── 세금계산서 테이블 감지 + 캡처 ───────────────────────────────────────────

async def find_invoice_tables(page: Page) -> List[ElementHandle]:
    """
    페이지에서 세금계산서 테이블 영역 감지.
    '공급가액', '세액', '합계' 등의 텍스트가 포함된 <table> 반환
    """
    tax_keywords = ["공급가액", "세액", "합계", "공급자", "작성일", "승인번호",
                    "품목", "공급받는자", "invoice"]
    found_tables = []

    try:
        tables = await page.query_selector_all("table")
        for table in tables:
            text = await table.inner_text()
            score = sum(1 for kw in tax_keywords if kw in text)
            if score >= 2:
                found_tables.append((score, table))

        found_tables.sort(key=lambda x: -x[0])
        return [t for _, t in found_tables]
    except Exception as e:
        logger.warning(f"테이블 감지 오류: {e}")
        return []


async def capture_invoice_area(page: Page, output_dir: Path) -> List[str]:
    """세금계산서 테이블 영역 캡처 (부분 스크린샷)"""
    screenshots = []
    tables = await find_invoice_tables(page)

    if not tables:
        logger.info("세금계산서 테이블 없음 → 전체 페이지 캡처")
        path = output_dir / "invoice_fullpage.png"
        await page.screenshot(path=str(path), full_page=True)
        screenshots.append(str(path))
        return screenshots

    for idx, table in enumerate(tables[:3], 1):
        try:
            await table.scroll_into_view_if_needed()
            await asyncio.sleep(0.3)
            path = output_dir / f"invoice_table_{idx}.png"
            await table.screenshot(path=str(path))
            screenshots.append(str(path))
            logger.info(f"테이블 캡처 완료: {path}")
        except Exception as e:
            logger.warning(f"테이블 캡처 실패 (#{idx}): {e}")

    # 전체 페이지 캡처도 추가
    full_path = output_dir / "invoice_fullpage.png"
    await page.screenshot(path=str(full_path), full_page=True)
    screenshots.append(str(full_path))

    return screenshots


# ─── 팝업 / 레이어 처리 ───────────────────────────────────────────────────────

async def handle_popups(page: Page):
    """alert, confirm, 레이어 팝업 자동 처리"""
    page.on("dialog", lambda d: asyncio.create_task(d.accept()))

    # 닫기 버튼 레이어
    close_selectors = [
        ".popup-close", ".modal-close", ".btn-close",
        "button:has-text('닫기')", "button:has-text('확인')",
        "[class*='close']", "[id*='close']",
    ]
    for sel in close_selectors:
        try:
            el = page.locator(sel).first
            if await el.is_visible():
                await el.click()
                await asyncio.sleep(0.5)
        except Exception:
            pass


# ─── DOM 텍스트 추출 ──────────────────────────────────────────────────────────

async def extract_dom_data(page: Page) -> Dict:
    """DOM에서 구조화된 데이터 추출"""
    data = {"full_text": "", "tables": [], "page_url": "", "page_title": ""}

    try:
        data["full_text"] = await page.inner_text("body")
        data["page_url"] = page.url
        data["page_title"] = await page.title()
    except Exception:
        pass

    try:
        tables = await page.query_selector_all("table")
        for table in tables:
            rows_data = []
            rows = await table.query_selector_all("tr")
            for row in rows:
                cells = await row.query_selector_all("td, th")
                row_texts = [(await c.inner_text()).strip() for c in cells]
                row_texts = [t for t in row_texts if t]
                if row_texts:
                    rows_data.append(row_texts)
            if rows_data:
                data["tables"].append(rows_data)
    except Exception as e:
        logger.warning(f"테이블 DOM 추출 오류: {e}")

    return data


# ─── 메인 브라우저 클래스 ─────────────────────────────────────────────────────

class TaxInvoiceBrowser:

    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None

    async def start(self):
        self.playwright = await async_playwright().start()
        btype = getattr(self.playwright, BROWSER_CONFIG["browser"])
        self.browser = await btype.launch(
            headless=BROWSER_CONFIG["headless"],
            slow_mo=BROWSER_CONFIG.get("slow_mo", 0),
        )
        self.context = await self.browser.new_context(
            viewport=BROWSER_CONFIG["viewport"],
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            ignore_https_errors=bool(BROWSER_CONFIG.get("ignore_https_errors", True)),
        )
        logger.info(f"🌐 브라우저 시작 ({BROWSER_CONFIG['browser']})")

    async def stop(self):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def process_link(
        self,
        link_info: Dict,
        output_dir: Path,
        email_info: Dict,
    ) -> Dict:
        """
        단일 링크 처리 (메일의 상세보기 URL → Playwright, 공동인증·ActiveX 미사용):
        1. URL 열기
        2. 팝업 처리 · 승인/발행 버튼(노출 시)
        3. 사업자번호 입력 (필요시) 및 확인
        4. 재팝업 · 승인/발행
        5. 테이블 캡처 및 DOM 추출
        """
        url = link_info["url"]
        result = {
            "url": url,
            "link_text": link_info.get("text", ""),
            "success": False,
            "screenshots": [],
            "dom_data": {},
            "platform": "기타",
            "error": None,
            "rfc_message_id": (email_info.get("rfc_message_id") or ""),
        }

        if is_blocked_tax_invoice_url(url):
            result["error"] = "blocked_url"
            logger.info(f"🚫 링크 스킵 (차단 URL): {url[:80]}")
            return result

        # 플랫폼 사전 감지
        result["platform"] = detect_platform(
            email_subject=email_info.get("subject", ""),
            email_from=email_info.get("from", ""),
            url=url,
        )
        if is_excluded_tax_platform(result["platform"]):
            result["error"] = "excluded_platform"
            logger.info(f"🚫 링크 스킵 (제외 플랫폼): {result['platform']}")
            return result

        output_dir.mkdir(parents=True, exist_ok=True)
        page = await self.context.new_page()
        page_tag = (link_info.get("text") or "link")[:24]
        _attach_image_request_logging(page, f"{page_tag}:{url[:40]}")

        try:
            # 1. 페이지 열기 — networkidle 우선, 타임아웃 시 domcontentloaded 폴백
            logger.info("🌐 접속 URL: %s", url[:480] + ("…" if len(url) > 480 else ""))
            try:
                await page.goto(
                    url,
                    timeout=BROWSER_CONFIG["timeout"],
                    wait_until="networkidle",
                )
            except Exception as nav_err:
                logger.warning(f"⚠️ networkidle 대기 초과, domcontentloaded 폴백: {nav_err}")
                try:
                    await page.goto(
                        url,
                        timeout=BROWSER_CONFIG["timeout"],
                        wait_until="domcontentloaded",
                    )
                except Exception as nav_err2:
                    logger.warning(f"⚠️ domcontentloaded도 초과 — 현재 상태로 계속 진행: {nav_err2}")
                    # 페이지가 부분 로드된 경우에도 계속 처리
            await asyncio.sleep(2)

            # 2. 팝업 처리
            await handle_popups(page)
            await click_issue_approve_if_present(page)

            # 3. 초기 스크린샷
            init_ss = output_dir / "step1_initial.png"
            await page.screenshot(path=str(init_ss), full_page=False)
            result["screenshots"].append(str(init_ss))

            # 4. 사업자번호 입력 (한메일 보안 등 — 최대 2회 시도)
            for biz_round in range(2):
                if not await needs_biz_number(page):
                    break
                logger.info(
                    "🔐 사업자번호 입력 화면 감지 (%d/2) — 사장님 번호 입력 후 진행",
                    biz_round + 1,
                )
                ok_in = await input_business_number(page)
                if not ok_in:
                    logger.warning("사업자 입력창 조작 실패 — 계속 확인/열람 시도")
                await asyncio.sleep(0.5)

                input_ss = output_dir / f"step2_after_input_r{biz_round}.png"
                await page.screenshot(path=str(input_ss), full_page=False)
                result["screenshots"].append(str(input_ss))

                await click_confirm_button(page)

                hunt_ms = int(BROWSER_CONFIG.get("issue_approve_hunt_ms", 30_000))
                await click_issue_approve_hunt(page, hunt_ms)

                img_ms = int(BROWSER_CONFIG.get("image_load_wait_ms", 30_000))
                await _wait_for_invoice_images_loaded(page, img_ms)
                await _log_page_image_elements(page, "after-img-wait")

                await asyncio.sleep(0.5)
                confirm_ss = output_dir / f"step3_after_confirm_r{biz_round}.png"
                await page.screenshot(path=str(confirm_ss), full_page=False)
                result["screenshots"].append(str(confirm_ss))

                await click_issue_approve_if_present(page)
                await handle_popups(page)

            if await needs_biz_number(page):
                logger.warning(
                    "사업자번호 화면이 남아 있을 수 있음 — 추가 승인/열람 버튼 탐색"
                )
                await click_issue_approve_hunt(
                    page,
                    int(BROWSER_CONFIG.get("issue_approve_hunt_ms", 30_000)),
                )

            # 재차 팝업 처리
            await handle_popups(page)
            await asyncio.sleep(1)
            await click_issue_approve_if_present(page)

            # 6. 페이지 내 플랫폼 재감지
            try:
                page_text_preview = (await page.inner_text("body"))[:300]
                page_platform = extract_platform_from_page(await page.title(), page_text_preview)
                if page_platform:
                    result["platform"] = page_platform
            except Exception:
                pass

            # 7. 테이블 감지 + 캡처
            table_screenshots = await capture_invoice_area(page, output_dir)
            result["screenshots"].extend(table_screenshots)

            # 8. DOM 데이터 추출
            result["dom_data"] = await extract_dom_data(page)
            try:
                page_url = page.url or ""
            except Exception:
                page_url = ""
            if is_blocked_tax_invoice_url(page_url):
                result["error"] = "blocked_url_after_redirect"
                result["success"] = False
                logger.info(f"🚫 리다이렉트 후 차단 URL — 스킵: {page_url[:80]}")
            elif is_excluded_tax_platform(result["platform"]):
                result["error"] = "excluded_platform"
                result["success"] = False
                logger.info(f"🚫 제외 플랫폼(페이지 반영 후) — 스킵: {result['platform']}")
            else:
                result["success"] = True
            if result["success"]:
                logger.info(f"✅ 처리 완료 | 플랫폼: {result['platform']} | 스크린샷: {len(result['screenshots'])}개")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"❌ 링크 처리 실패: {url[:60]} | {e}")
            try:
                err_ss = output_dir / "error.png"
                await page.screenshot(path=str(err_ss))
                result["screenshots"].append(str(err_ss))
            except Exception:
                pass

        finally:
            await page.close()

        return result

    async def process_image_email(self, email_info: Dict, output_dir: Path) -> List[Dict]:
        """
        이미지형 메일 처리 — 링크 없이 첨부/인라인 이미지만 있는 세금계산서 메일.
        이미지를 디스크에 저장하고 OCR 대상 스크린샷으로 등록한다.
        """
        images = email_info.get("images", [])
        if not images:
            logger.info("이미지형 메일이지만 추출된 이미지 없음 — 건너뜀")
            return []

        det_pf = detect_platform(
            email_subject=email_info.get("subject", ""),
            email_from=email_info.get("from", ""),
            url="",
        )
        if is_excluded_tax_platform(det_pf) or (
            det_pf and "qoo10" in det_pf.lower()
        ):
            logger.info(f"🚫 이미지형 메일 스킵 (제외 플랫폼): {det_pf}")
            return []

        if is_blocked_invoice_email(
            email_info.get("from", ""),
            email_info.get("subject", ""),
            email_info.get("html_body", ""),
            email_info.get("text_body", ""),
        ):
            logger.info("🚫 이미지형 메일 스킵 (Qoo10 등 차단: 본문/발신)")
            return []

        output_dir.mkdir(parents=True, exist_ok=True)
        plat_label = det_pf if det_pf and det_pf != "기타" else "이미지형 세금계산서"
        result: Dict = {
            "url": "",
            "link_text": "이미지형 세금계산서",
            "success": True,
            "screenshots": [],
            "dom_data": {
                "full_text": "",
                "tables": [],
                "page_url": "",
                "page_title": "이미지형 세금계산서",
            },
            "platform": plat_label,
            "error": None,
            "email_type": "image",
            "email_subject": email_info.get("subject"),
            "email_from": email_info.get("from"),
            "email_date": email_info.get("date"),
            "rfc_message_id": (email_info.get("rfc_message_id") or ""),
            "html_body": email_info.get("html_body", ""),
            "text_body": email_info.get("text_body", ""),
        }

        for idx, img_data in enumerate(images, 1):
            try:
                ext = img_data.get("ext", "png")
                path = output_dir / f"invoice_image_{idx}.{ext}"
                path.write_bytes(img_data["data"])
                result["screenshots"].append(str(path))
                logger.info(f"📷 이미지 저장 완료: {path}")
            except Exception as e:
                logger.warning(f"이미지 저장 실패 (#{idx}): {e}")

        logger.info(
            f"✅ 이미지형 메일 처리 완료 | 이미지 {len(result['screenshots'])}개 저장"
        )
        return [result]

    async def process_email(self, email_info: Dict, base_output_dir: Path) -> List[Dict]:
        """이메일의 모든 링크(또는 이미지) 순서대로 처리"""
        results = []
        links = email_info.get("links", [])

        # ── 이미지형 메일: 링크 없이 첨부 이미지만 있는 경우 ──
        if not links:
            if email_info.get("images"):
                logger.info(f"📷 이미지형 메일 감지: [{email_info.get('subject', '')}]")
                return await self.process_image_email(email_info, base_output_dir)
            logger.warning(f"링크도 이미지도 없는 메일 건너뜀: [{email_info.get('subject', '')}]")
            return []

        # ── 링크형 메일: 각 링크별 브라우저 처리 ──
        for idx, link_info in enumerate(links, 1):
            safe_subject = re.sub(r'[\\/:*?"<>|]', '_', email_info.get("subject", "unknown"))[:40]
            link_dir = base_output_dir / f"{safe_subject}_link{idx}"

            logger.info(f"\n링크 처리 ({idx}/{len(links)}): [{link_info.get('text','')}] {link_info['url'][:60]}")
            res = await self.process_link(link_info, link_dir, email_info)
            res["email_subject"] = email_info.get("subject")
            res["email_from"] = email_info.get("from")
            res["email_date"] = email_info.get("date")
            res["rfc_message_id"] = email_info.get("rfc_message_id") or ""
            res["html_body"] = email_info.get("html_body", "")
            res["text_body"] = email_info.get("text_body", "")
            results.append(res)

        return results

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, *_):
        await self.stop()
