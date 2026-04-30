/**
 * MonthlyHistory
 *
 * 월별 미수금/입금 히스토리 대시보드.
 * - ar_records를 월별로 집계해 요약 테이블 표시
 * - ar_closures 컬렉션으로 마감 확정/해제 관리
 * - 확정된 달은 잠금 표시, 신용내역 탭에서 체크 불가
 */

import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../lib/firebase";
import {
  collection, onSnapshot, query, orderBy, where,
  doc, setDoc, deleteDoc, getDocs, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Lock, Unlock, CheckCircle, AlertCircle, Clock,
  TrendingUp, ChevronRight, Calendar, Users, Trash2,
} from "lucide-react";
import { grandTotalVatIncluded } from "../../config/companyInfo";

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────
interface ArRecord {
  id: string;
  billing_month: string;
  client_name: string;
  total_amount: number;
  delivery_fee?: number;
  paid_amount: number;
  unpaid_amount: number;
  checked: boolean;
  status: string;
}

export interface MonthClosure {
  billing_month: string;
  closed_by: string;
  closed_at: string;
  snapshot: {
    total_billed: number;
    total_confirmed: number;
    total_outstanding: number;
    client_count: number;
    confirmed_count: number;
  };
}

interface MonthSummary {
  month: string;
  clientCount: number;
  confirmedCount: number;
  totalBilled: number;
  totalConfirmed: number;
  totalOutstanding: number;
  rate: number;
  closure?: MonthClosure;
}

// ─────────────────────────────────────────────────────────────
// 수금률 색상
// ─────────────────────────────────────────────────────────────
function rateColor(rate: number) {
  if (rate === 100) return "text-emerald-600";
  if (rate >= 70)   return "text-blue-600";
  if (rate >= 40)   return "text-yellow-600";
  return "text-red-600";
}

function rateBg(rate: number) {
  if (rate === 100) return "bg-emerald-500";
  if (rate >= 70)   return "bg-blue-500";
  if (rate >= 40)   return "bg-yellow-400";
  return "bg-red-500";
}

// ─────────────────────────────────────────────────────────────
// 마감 확정 확인 다이얼로그
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({
  title, description, confirmLabel, confirmClass,
  onConfirm, onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
        <p className="text-sm text-slate-600 whitespace-pre-line">{description}</p>
        <div className="flex gap-2 pt-1">
          <Button onClick={onConfirm} className={`flex-1 font-bold ${confirmClass}`}>
            {confirmLabel}
          </Button>
          <Button onClick={onCancel} variant="outline" className="flex-1">취소</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function MonthlyHistory({
  records,
  username,
  onSelectMonth,
}: {
  records: ArRecord[];
  username: string;
  onSelectMonth: (month: string) => void;
}) {
  const [closures, setClosures]   = useState<MonthClosure[]>([]);
  const [confirm, setConfirm]     = useState<{ month: string; action: "close" | "open" | "delete" } | null>(null);
  const [deleting, setDeleting]   = useState(false);

  // ── ar_closures 실시간 구독 ──
  useEffect(() => {
    const q = query(collection(db, "ar_closures"), orderBy("billing_month", "desc"));
    return onSnapshot(q, (snap) =>
      setClosures(snap.docs.map((d) => d.data() as MonthClosure))
    );
  }, []);

  // ── 월별 집계 (records prop 기반) ──
  const summaries: MonthSummary[] = useMemo(() => {
    const map = new Map<string, MonthSummary>();

    records.forEach((r) => {
      const m = r.billing_month || "미분류";
      if (!map.has(m)) {
        map.set(m, {
          month: m, clientCount: 0, confirmedCount: 0,
          totalBilled: 0, totalConfirmed: 0, totalOutstanding: 0, rate: 0,
        });
      }
      const s = map.get(m)!;
      const billGrand = grandTotalVatIncluded(r);
      s.clientCount++;
      s.totalBilled += billGrand;
      if (r.checked) {
        s.confirmedCount++;
        s.totalConfirmed += billGrand;
      } else {
        s.totalOutstanding += billGrand;
      }
    });

    // 수금률 + 마감 정보 병합
    const closureMap = new Map(closures.map((c) => [c.billing_month, c]));
    map.forEach((s) => {
      s.rate    = s.totalBilled > 0 ? Math.round((s.totalConfirmed / s.totalBilled) * 100) : 0;
      s.closure = closureMap.get(s.month);
    });

    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [records, closures]);

  // ── 마감 확정 ──
  const handleClose = async (summary: MonthSummary) => {
    if (!username) { alert("먼저 담당자 이름을 설정해주세요."); return; }
    await setDoc(doc(db, "ar_closures", summary.month), {
      billing_month:  summary.month,
      closed_by:      username,
      closed_at:      new Date().toISOString(),
      snapshot: {
        total_billed:       summary.totalBilled,
        total_confirmed:    summary.totalConfirmed,
        total_outstanding:  summary.totalOutstanding,
        client_count:       summary.clientCount,
        confirmed_count:    summary.confirmedCount,
      },
      created_at: serverTimestamp(),
    });
    setConfirm(null);
  };

  // ── 마감 해제 ──
  const handleOpen = async (month: string) => {
    await deleteDoc(doc(db, "ar_closures", month));
    setConfirm(null);
  };

  // ── 월 전체 삭제 (ar_records + ar_closures) ──
  const handleDeleteMonth = async (month: string) => {
    setDeleting(true);
    try {
      // 해당 월의 ar_records 모두 조회
      const snap = await getDocs(
        query(collection(db, "ar_records"), where("billing_month", "==", month))
      );
      // 500개 단위로 배치 삭제
      const ids = snap.docs.map((d) => d.id);
      for (let i = 0; i < ids.length; i += 490) {
        const batch = writeBatch(db);
        ids.slice(i, i + 490).forEach((id) => batch.delete(doc(db, "ar_records", id)));
        await batch.commit();
      }
      // 마감 문서도 삭제 (있으면)
      await deleteDoc(doc(db, "ar_closures", month)).catch(() => {});
    } finally {
      setDeleting(false);
      setConfirm(null);
    }
  };

  // ── 전체 통계 ──
  const totalBilled      = summaries.reduce((s, m) => s + m.totalBilled, 0);
  const totalConfirmed   = summaries.reduce((s, m) => s + m.totalConfirmed, 0);
  const totalOutstanding = summaries.reduce((s, m) => s + m.totalOutstanding, 0);
  const totalMonths      = summaries.length;
  const closedMonths     = summaries.filter((m) => m.closure).length;

  return (
    <div className="space-y-6">

      {/* ── 전체 요약 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "관리 월수",   val: `${totalMonths}개월`, icon: Calendar,    color: "text-slate-700", bg: "bg-slate-100" },
          { label: "누적 청구(부가포함)", val: `${totalBilled.toLocaleString()}원`,   icon: TrendingUp,  color: "text-blue-700",    bg: "bg-blue-50" },
          { label: "누적 입금",   val: `${totalConfirmed.toLocaleString()}원`, icon: CheckCircle, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "누적 미수금", val: `${totalOutstanding.toLocaleString()}원`, icon: AlertCircle, color: "text-red-700",  bg: "bg-red-50" },
        ].map(({ label, val, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 border border-slate-100`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${color}`} />
              <p className="text-xs font-semibold text-slate-500">{label}</p>
            </div>
            <p className={`text-xl font-black font-mono tabular-nums ${color}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* ── 마감 현황 ── */}
      <div className="flex items-center gap-3 text-sm">
        <Lock className="h-4 w-4 text-slate-400" />
        <span className="text-slate-600">
          마감 확정 <strong className="text-slate-800">{closedMonths}개월</strong> /
          미확정 <strong className="text-orange-600">{totalMonths - closedMonths}개월</strong>
        </span>
        <span className="text-xs text-slate-400 ml-2">
          * 마감 확정된 달은 신용내역 탭에서 체크박스 변경이 차단됩니다.
        </span>
      </div>

      {/* ── 월별 히스토리 테이블 ── */}
      {summaries.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          아직 등록된 정산 데이터가 없습니다.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">마감월</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">거래처</th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  title="거래처별 합계(부가포함)의 합. (요금+탁송)×1.1"
                >
                  총 청구(부가포함)
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  title="입금 확인된 건의 합계(부가포함) 합"
                >
                  입금 확인
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  title="미확인 건의 합계(부가포함) 합"
                >
                  미수금
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">수금률</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                <th className="px-3 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map((s) => {
                const isClosed = !!s.closure;
                return (
                  <tr key={s.month} className={`transition-colors ${isClosed ? "bg-slate-50/50" : "hover:bg-blue-50/30"}`}>

                    {/* 마감월 */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {isClosed && <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                        <div>
                          <p className="font-bold text-slate-800 font-mono">{s.month}</p>
                          {isClosed && s.closure && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {s.closure.closed_by} · {s.closure.closed_at.slice(0, 10)}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 거래처 수 */}
                    <td className="px-3 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-slate-600">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold">{s.clientCount}</span>
                        <span className="text-xs text-slate-400">개</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        확인 {s.confirmedCount}/{s.clientCount}
                      </p>
                    </td>

                    {/* 총 청구액 */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono font-bold text-slate-700 tabular-nums">
                        {s.totalBilled.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-0.5">원</span>
                    </td>

                    {/* 입금 확인 */}
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        {s.totalConfirmed.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-0.5">원</span>
                    </td>

                    {/* 미수금 */}
                    <td className="px-4 py-4 text-right">
                      <span className={`font-mono font-bold tabular-nums ${s.totalOutstanding > 0 ? "text-red-600" : "text-slate-400"}`}>
                        {s.totalOutstanding.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-0.5">원</span>
                    </td>

                    {/* 수금률 바 */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${rateBg(s.rate)}`}
                            style={{ width: `${s.rate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold w-9 text-right tabular-nums ${rateColor(s.rate)}`}>
                          {s.rate}%
                        </span>
                      </div>
                    </td>

                    {/* 상태 배지 */}
                    <td className="px-4 py-4 text-center">
                      {isClosed ? (
                        <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200 gap-1 whitespace-nowrap">
                          <Lock className="h-3 w-3" />마감확정
                        </Badge>
                      ) : s.rate === 100 ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1 whitespace-nowrap">
                          <CheckCircle className="h-3 w-3" />수금완료
                        </Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 gap-1 whitespace-nowrap">
                          <Clock className="h-3 w-3" />진행중
                        </Badge>
                      )}
                    </td>

                    {/* 액션 */}
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 이 달 보기 */}
                        <button
                          onClick={() => onSelectMonth(s.month)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50 transition-colors whitespace-nowrap"
                        >
                          보기<ChevronRight className="h-3 w-3" />
                        </button>

                        {/* 마감 확정 / 해제 */}
                        {isClosed ? (
                          <button
                            onClick={() => setConfirm({ month: s.month, action: "open" })}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-red-50 hover:border-red-200 transition-colors"
                            title="마감 해제"
                          >
                            <Unlock className="h-3 w-3" />해제
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirm({ month: s.month, action: "close" })}
                            className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-2 py-1 hover:bg-slate-100 transition-colors"
                            title="마감 확정"
                          >
                            <Lock className="h-3 w-3" />확정
                          </button>
                        )}

                        {/* 월 전체 삭제 */}
                        <button
                          onClick={() => setConfirm({ month: s.month, action: "delete" })}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-red-50 hover:border-red-200 transition-colors"
                          title={`${s.month} 데이터 전체 삭제`}
                          disabled={deleting}
                        >
                          <Trash2 className="h-3 w-3" />삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 마감 확정 확인 다이얼로그 ── */}
      {confirm?.action === "close" && (
        <ConfirmDialog
          title={`${confirm.month} 마감 확정`}
          description={
            `이 달의 데이터를 마감 확정하면 신용내역 탭에서\n` +
            `체크박스 변경이 차단됩니다.\n\n` +
            `확정 후에도 '해제' 버튼으로 다시 열 수 있습니다.`
          }
          confirmLabel="마감 확정"
          confirmClass="bg-slate-800 hover:bg-slate-900 text-white"
          onConfirm={() => {
            const s = summaries.find((m) => m.month === confirm.month);
            if (s) handleClose(s);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.action === "open" && (
        <ConfirmDialog
          title={`${confirm.month} 마감 해제`}
          description={`${confirm.month}의 마감 확정을 해제합니다.\n신용내역 탭에서 다시 수정할 수 있게 됩니다.`}
          confirmLabel="마감 해제"
          confirmClass="bg-red-600 hover:bg-red-700 text-white"
          onConfirm={() => handleOpen(confirm.month)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.action === "delete" && (() => {
        const s = summaries.find((m) => m.month === confirm.month);
        return (
          <ConfirmDialog
            title={`${confirm.month} 데이터 전체 삭제`}
            description={
              `⚠️ 이 달의 신용내역 데이터를 완전히 삭제합니다.\n\n` +
              `• 거래처: ${s?.clientCount ?? 0}개\n` +
              `• 청구(부가포함): ${(s?.totalBilled ?? 0).toLocaleString()}원\n\n` +
              `삭제된 데이터는 복구할 수 없습니다.\n정말 삭제하시겠습니까?`
            }
            confirmLabel={deleting ? "삭제 중..." : "전체 삭제"}
            confirmClass="bg-red-600 hover:bg-red-700 text-white"
            onConfirm={() => handleDeleteMonth(confirm.month)}
            onCancel={() => setConfirm(null)}
          />
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 마감 여부 조회 유틸 (Settlement.tsx에서 import해서 사용)
// ─────────────────────────────────────────────────────────────
export function useMonthClosures(): Map<string, MonthClosure> {
  const [closures, setClosures] = useState<MonthClosure[]>([]);

  useEffect(() => {
    const q = query(collection(db, "ar_closures"));
    return onSnapshot(q, (snap) =>
      setClosures(snap.docs.map((d) => d.data() as MonthClosure))
    );
  }, []);

  return useMemo(
    () => new Map(closures.map((c) => [c.billing_month, c])),
    [closures]
  );
}
