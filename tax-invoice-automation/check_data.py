"""Firestore 저장 데이터 확인 스크립트"""
import firebase_admin
from firebase_admin import credentials, firestore

if firebase_admin._apps:
    firebase_admin.delete_app(firebase_admin.get_app())

cred = credentials.Certificate("google_credentials.json")
firebase_admin.initialize_app(cred, {"storageBucket": "gen-lang-client-0127550748.firebasestorage.app"})
db = firestore.client(database_id="ai-studio-08ae3b29-6eb5-4e08-8bb0-f20ab80e5ffc")

docs = list(db.collection("tax_invoices").order_by("issue_date", direction=firestore.Query.DESCENDING).get())

# 테스트 데이터 제외
real_docs = [d for d in docs if d.to_dict().get("platform") != "테스트"]
test_docs = [d for d in docs if d.to_dict().get("platform") == "테스트"]

print(f"\n{'='*55}")
print(f"  세계로지스 세금계산서 수집 현황")
print(f"{'='*55}")
print(f"  전체 저장: {len(docs)}건 (실제: {len(real_docs)}건, 테스트: {len(test_docs)}건)")
print()

# 월별 집계
monthly = {}
for d in real_docs:
    data = d.to_dict()
    date = data.get("issue_date", "")
    month = date[:7] if date and len(date) >= 7 else "미상"
    if month not in monthly:
        monthly[month] = {"count": 0, "total": 0, "paid": 0, "platforms": set()}
    monthly[month]["count"] += 1
    monthly[month]["total"] += int(data.get("total_amount") or 0)
    if data.get("status") == "paid":
        monthly[month]["paid"] += 1
    if data.get("platform"):
        monthly[month]["platforms"].add(data["platform"])

print("  [월별 집계]")
print(f"  {'월':^10} {'건수':^6} {'합계금액':^16} {'입금완료':^8} {'플랫폼'}")
print(f"  {'-'*55}")
for month in sorted(monthly.keys(), reverse=True):
    m = monthly[month]
    platforms = ", ".join(sorted(m["platforms"])) or "-"
    paid_str = f"{m['paid']}/{m['count']}건"
    print(f"  {month:^10} {m['count']:^6} {m['total']:>14,}원  {paid_str:^8}  {platforms}")

print()
print("  [최근 10건]")
print(f"  {'발행일':^12} {'플랫폼':^12} {'공급자':^16} {'합계금액':^12} {'상태'}")
print(f"  {'-'*65}")
for d in real_docs[:10]:
    data = d.to_dict()
    status = "✓입금완료" if data.get("status") == "paid" else "미처리"
    supplier = (data.get("supplier_name") or "-")[:14]
    platform = (data.get("platform") or "-")[:10]
    total = int(data.get("total_amount") or 0)
    date = data.get("issue_date", "?")
    total_str = f"{total:,}원" if total else "-"
    print(f"  {date:^12} {platform:^12} {supplier:^16} {total_str:>12}  {status}")

print(f"\n{'='*55}\n")
