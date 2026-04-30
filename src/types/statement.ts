/** 거래명세표 · Firestore items / 공통 타입 */

export interface SettlementItem {
  id?: string;
  date: string;
  description: string;
  quantity: number;
  unit_price: number;
  supply_amount: number;
  /** 엑셀 「기본요금」 등 — 있으면 명세 기본요금·할인 계산에 사용 */
  base_amount?: number;
  /** 엑셀 「할인요금」 등 — 있으면 할인요금 열에 그대로 표시 */
  discount_amount?: number;
  tax_amount: number;
  total_amount: number;
  memo: string;
  departure?: string;
  destination?: string;
  vehicle_type?: string;
  driver?: string;
  vehicle_no?: string;
  unload_client?: string;
  row_client?: string;
  jeeyo?: string;
  /** 엑셀 「왕복」 등 전용 열 (없으면 명세표 왕복 칸은 적요·비고 규칙으로만 보조) */
  round_trip?: string;
}

export type StatementTemplateKey =
             | "basic" | "samil" | "jiyoo" | "rapid"
             | "nokwon" | "dabit" | "book_person" | "book_corp"
             | "snowpeak" | "imtechplus"
             | "custom";

export interface StatementClientProfile {
  id?: string;
  name: string;
  aggregation_link_key?: string;
  biz_no: string;
  ceo_name: string;
  address: string;
  phone: string;
  email: string;
  business_type: string;
  business_item: string;
  template: StatementTemplateKey;
  /** template === "custom" 일 때 열 키 순서 (예: ["order_date","client_name",...]) */
  custom_statement_columns?: string[] | null;
}

export interface StatementArRecord {
  id: string;
  billing_month: string;
  client_name: string;
  client_biz_no?: string;
  total_amount: number;
  delivery_fee?: number;
  paid_amount: number;
  unpaid_amount: number;
  due_date?: string;
  status: string;
  memo?: string;
  checked?: boolean;
  contact_email?: string;
  item_count?: number;
}
