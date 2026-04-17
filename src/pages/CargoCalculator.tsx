import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calculator, Package, Truck, CheckCircle2, AlertCircle, ChevronRight, Phone } from "lucide-react";

// 차량 재원 데이터 (길이·폭·높이 단위: mm, 적재량: kg, cbm: m³)
const VEHICLES = [
  { name: "다마스",          type: "카고",   length: 1600,  width: 1100,  height: 1100,  load: 400,   cbm: 1.5,  img: "/vehicle-damas.jpg" },
  { name: "라보",            type: "카고",   length: 2190,  width: 1400,  height: 0,     load: 550,   cbm: 3.5,  img: "/vehicle-labo.jpg" },
  { name: "1톤 카고",        type: "카고",   length: 2850,  width: 1600,  height: 0,     load: 1000,  cbm: 6,    img: "/vehicle-1ton-cargo.jpg" },
  { name: "1톤 탑·윙바디",   type: "윙바디", length: 2850,  width: 1600,  height: 1700,  load: 1000,  cbm: 6,    img: "/vehicle-1ton-wing.jpg" },
  { name: "1.4톤 카고",      type: "카고",   length: 3100,  width: 1700,  height: 0,     load: 2000,  cbm: 6.5,  img: "/vehicle-1.4ton-cargo.jpg" },
  { name: "1.4톤 탑·윙바디", type: "윙바디", length: 3100,  width: 1700,  height: 1800,  load: 2000,  cbm: 6.5,  img: "/vehicle-1.4ton-wing.jpg" },
  { name: "2.5톤 카고",      type: "카고",   length: 4300,  width: 1800,  height: 0,     load: 2500,  cbm: 12,   img: "/vehicle-2.5ton-cargo.jpg" },
  { name: "2.5톤 탑·윙바디", type: "윙바디", length: 4300,  width: 1800,  height: 2200,  load: 2500,  cbm: 12,   img: "/vehicle-2.5ton-wing.jpg" },
  { name: "3.5톤 카고",      type: "카고",   length: 5100,  width: 2100,  height: 0,     load: 3500,  cbm: 18,   img: "/vehicle-3.5ton-cargo.jpg" },
  { name: "3.5톤 탑·윙바디", type: "윙바디", length: 5100,  width: 2100,  height: 2200,  load: 3500,  cbm: 18,   img: "/vehicle-3.5ton-wing.jpg" },
  { name: "5톤 카고",        type: "카고",   length: 6200,  width: 2350,  height: 0,     load: 5000,  cbm: 24,   img: "/vehicle-5ton-cargo.jpg" },
  { name: "5톤 탑·윙바디",   type: "윙바디", length: 6200,  width: 2350,  height: 2400,  load: 5000,  cbm: 24,   img: "/vehicle-5ton-wing.jpg" },
  { name: "11톤 카고",       type: "카고",   length: 9100,  width: 2230,  height: 0,     load: 13000, cbm: 48,   img: "/vehicle-11ton-cargo.jpg" },
  { name: "11톤 탑·윙바디",  type: "윙바디", length: 9100,  width: 2340,  height: 2500,  load: 13000, cbm: 48,   img: "/vehicle-11ton-wing.jpg" },
  { name: "25톤 카고",       type: "카고",   length: 10100, width: 2340,  height: 0,     load: 25000, cbm: 72,   img: "/vehicle-25ton-cargo.jpg" },
];

type Vehicle = typeof VEHICLES[0];

interface CalcResult {
  recommended: Vehicle[];
  alternatives: Vehicle[];
  totalCBM: number;
  totalVol: number;
  itemW: number;
  itemD: number;
  itemH: number;
}

function calcRecommend(w: number, d: number, h: number, qty: number): CalcResult {
  const totalVol = w * d * h * qty; // mm³
  const totalCBM = totalVol / 1_000_000_000;

  const fits = VEHICLES.filter((v) => {
    const volOk = totalCBM <= v.cbm;
    // 카고(오픈): 높이 제한 없음 → 가로·세로만 체크
    const dimOk =
      v.type === "카고"
        ? w <= v.width && d <= v.length
        : w <= v.width && d <= v.length && h <= v.height;
    return volOk && dimOk;
  });

  // 부피는 맞지만 단품 치수가 안 맞는 경우 (부분 대안)
  const volOnly = VEHICLES.filter(
    (v) => totalCBM <= v.cbm && !fits.includes(v)
  );

  return {
    recommended: fits.slice(0, 3),
    alternatives: volOnly.slice(0, 2),
    totalCBM,
    totalVol,
    itemW: w,
    itemD: d,
    itemH: h,
  };
}

export default function CargoCalculator() {
  const [form, setForm] = useState({ w: "", d: "", h: "", qty: "1" });
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState("");

  const handleCalc = () => {
    const w = parseFloat(form.w);
    const d = parseFloat(form.d);
    const h = parseFloat(form.h);
    const qty = parseInt(form.qty) || 1;

    if (!w || !d || !h || w <= 0 || d <= 0 || h <= 0) {
      setError("가로, 세로, 높이를 모두 입력해주세요.");
      setResult(null);
      return;
    }
    setError("");
    setResult(calcRecommend(w, d, h, qty));
  };

  const handleReset = () => {
    setForm({ w: "", d: "", h: "", qty: "1" });
    setResult(null);
    setError("");
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="bg-blue-600 py-16 text-center">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 text-blue-200 text-sm font-semibold uppercase tracking-widest mb-3"
          >
            <Calculator className="w-4 h-4" />
            Cargo Calculator
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white text-3xl md:text-4xl font-black mb-3"
          >
            화물의 가로 × 세로 × 높이 × 갯수만 입력하세요
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-blue-100"
          >
            화물 치수를 입력하면 적합한 차종을 자동으로 추천해 드립니다.
          </motion.p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
        {/* Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-black text-slate-900">화물 치수 입력 <span className="text-slate-400 font-normal text-sm">(단위: mm)</span></h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { key: "w", label: "가로 (mm)", placeholder: "예) 800" },
              { key: "d", label: "세로 (mm)", placeholder: "예) 1200" },
              { key: "h", label: "높이 (mm)", placeholder: "예) 1000" },
              { key: "qty", label: "갯수", placeholder: "예) 5" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{label}</label>
                <input
                  type="number"
                  min="0"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleCalc()}
                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800 font-bold text-base transition-colors"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCalc}
              className="flex-1 h-13 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-base rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              <Calculator className="w-5 h-5" />
              차종 추천받기
            </button>
            {result && (
              <button
                onClick={handleReset}
                className="h-13 py-3.5 px-5 border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-bold text-sm rounded-xl transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        </motion.div>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4 }}
            >
              {/* 부피 요약 */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 px-6 py-4 mb-6 flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-slate-400">단품 치수</span>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {result.itemW} × {result.itemD} × {result.itemH} mm
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">총 부피</span>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {result.totalCBM.toFixed(3)} CBM
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">환산</span>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {(result.totalVol / 1_000_000).toFixed(1)} L
                  </p>
                </div>
              </div>

              {result.recommended.length > 0 ? (
                <>
                  <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    추천 차종
                  </h3>
                  <div className="space-y-4 mb-8">
                    {result.recommended.map((v, i) => (
                      <motion.div
                        key={v.name}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className={`flex items-center gap-4 rounded-2xl border-2 p-4 shadow-sm
                          ${i === 0 ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        {i === 0 && (
                          <span className="absolute -mt-8 ml-2 text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                            최적 추천
                          </span>
                        )}
                        <img
                          src={v.img}
                          alt={v.name}
                          className="w-24 h-16 object-contain rounded-lg bg-white border border-slate-100 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-black text-lg ${i === 0 ? "text-blue-700" : "text-slate-800"}`}>
                              {v.name}
                            </span>
                            {i === 0 && (
                              <span className="text-[10px] font-black text-white bg-blue-600 px-2 py-0.5 rounded-full">
                                최적
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">
                              {v.type}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>적재함 {v.length}×{v.width}{v.height ? `×${v.height}` : ""} mm</span>
                            <span>최대 {v.cbm} CBM</span>
                            <span>적재량 {v.load.toLocaleString()} kg</span>
                          </div>
                        </div>
                        <Truck className={`w-6 h-6 shrink-0 ${i === 0 ? "text-blue-500" : "text-slate-300"}`} />
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-6 mb-6 text-center">
                  <AlertCircle className="w-10 h-10 text-orange-400 mx-auto mb-2" />
                  <p className="font-bold text-orange-700 mb-1">단품 치수가 모든 차량을 초과합니다.</p>
                  <p className="text-sm text-orange-500">고객센터에 직접 문의해 주세요.</p>
                </div>
              )}

              {/* 상담 CTA */}
              <div className="rounded-2xl bg-blue-700 p-6 text-white text-center">
                <p className="font-black text-lg mb-1">추천 차종으로 바로 접수하세요!</p>
                <p className="text-blue-200 text-sm mb-4">24시간 친절 상담 · 즉시 배차</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a
                    href="https://15887185.co.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-yellow-400 text-blue-900 font-black rounded-xl hover:bg-yellow-300 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                    온라인 접수하기
                  </a>
                  <a
                    href="tel:1588-7185"
                    className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-colors border border-white/20"
                  >
                    <Phone className="w-4 h-4" />
                    1588-7185 전화 접수
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 차량 규격 안내표 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-14"
        >
          <h3 className="text-base font-black text-slate-700 mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            전체 차량 적재함 규격 참고표
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="py-3 px-4 text-left font-bold">차종</th>
                  <th className="py-3 px-3 text-center font-bold">길이(mm)</th>
                  <th className="py-3 px-3 text-center font-bold">폭(mm)</th>
                  <th className="py-3 px-3 text-center font-bold">높이(mm)</th>
                  <th className="py-3 px-3 text-center font-bold">CBM</th>
                  <th className="py-3 px-3 text-center font-bold">적재량</th>
                </tr>
              </thead>
              <tbody>
                {VEHICLES.map((v, i) => (
                  <tr key={v.name} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{v.name}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{v.length}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{v.width}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{v.height || "제한없음"}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-blue-600">{v.cbm}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{v.load.toLocaleString()}kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">※ 적재함 높이 "제한없음"은 개방형 카고 차량으로 상단 적재 높이에 제한이 없습니다.</p>
        </motion.div>
      </div>
    </div>
  );
}
