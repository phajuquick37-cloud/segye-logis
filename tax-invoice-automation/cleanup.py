"""오탐지 데이터 정리 스크립트"""
import firebase_admin
from firebase_admin import credentials, firestore

if firebase_admin._apps:
    firebase_admin.delete_app(firebase_admin.get_app())

cred = credentials.Certificate("google_credentials.json")
firebase_admin.initialize_app(cred, {"storageBucket": "gen-lang-client-0127550748.firebasestorage.app"})
db = firestore.client(database_id="ai-studio-08ae3b29-6eb5-4e08-8bb0-f20ab80e5ffc")

# 오탐지 데이터 삭제 (supplier_name이 None인 건 + 테스트 화물맨 데이터)
docs = list(db.collection("tax_invoices").get())
deleted = 0
for d in docs:
    data = d.to_dict()
    # 공급자 이름이 없거나 테스트 데이터면 삭제
    if not data.get("supplier_name") or data.get("supplier_name") in ["테스트공급자", "(주)화물맨물류"]:
        db.collection("tax_invoices").document(d.id).delete()
        print(f"삭제: {d.id} | {data.get('platform')} | {data.get('supplier_name')}")
        deleted += 1

print(f"\n총 {deleted}건 정리 완료")
