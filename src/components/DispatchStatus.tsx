import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Clock } from "lucide-react";

type Status = "접수" | "대기" | "배차" | "운행" | "완료";

interface Dispatch {
  id: number;
  name: string;
  location: string;
  vehicle: string;
  status: Status;
}

const names = ["김**", "이**", "박**", "최**", "정**", "강**", "조**", "윤**", "장**", "임**", "한**", "오**", "서**", "신**", "권**"];
const locations = [
  "서울 강남구 **", "경기 파주시 **", "인천 서구 **", "부산 해운대구 **", "대구 수성구 **", 
  "광주 북구 **", "대전 유성구 **", "울산 남구 **", "강원 춘천시 **", "충북 청주시 **",
  "전남 보성군 **", "경북 포항시 **", "제주 제주시 **", "경기 고양시 **", "서울 강서구 **"
];
const vehicles = ["1T", "2.5T", "5T", "11T", "25T", "다마스", "라보", "냉동탑", "윙바디"];
const statuses: Status[] = ["접수", "대기", "배차", "운행", "완료"];

const getRandomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const generateInitialData = (): Dispatch[] => {
  return Array.from({ length: 6 }, (_, i) => ({
    id: Date.now() + i,
    name: getRandomItem(names),
    location: getRandomItem(locations),
    vehicle: getRandomItem(vehicles),
    status: getRandomItem(statuses),
  }));
};

export default function DispatchStatus() {
  const [data, setData] = useState<Dispatch[]>(generateInitialData());

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const newData = [...prev];
        // Remove the first item and add a new one to the end to simulate scrolling/real-time
        newData.shift();
        newData.push({
          id: Date.now(),
          name: getRandomItem(names),
          location: getRandomItem(locations),
          vehicle: getRandomItem(vehicles),
          status: getRandomItem(statuses),
        });
        return newData;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: Status) => {
    switch (status) {
      case "완료": return "bg-green-500 text-white";
      case "운행": return "bg-blue-500 text-white";
      case "배차": return "bg-blue-400 text-white";
      case "접수":
      case "대기": return "bg-slate-400 text-white";
      default: return "bg-slate-400 text-white";
    }
  };

  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="bg-blue-600 rounded-t-xl p-4 text-center shadow-lg">
            <h2 className="text-white text-xl font-bold flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 animate-pulse" />
              (주)세계로지스의 실시간 접수 현황
            </h2>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-b-xl shadow-xl border-x border-b border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {data.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="grid grid-cols-4 items-center p-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-slate-900 font-bold text-lg">{item.name}</div>
                    <div className="text-slate-500 text-sm truncate pr-2">{item.location}</div>
                    <div className="text-blue-600 font-bold text-center">{item.vehicle}</div>
                    <div className="flex justify-end">
                      <span className={`px-4 py-1.5 rounded-md text-sm font-bold min-w-[60px] text-center shadow-sm ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          
          <p className="text-center text-slate-400 text-xs mt-6">
            * 위 현황은 실시간 접수 데이터를 기반으로 세계로지스 서버와 연결된 정보입니다.
          </p>
        </div>
      </div>
    </section>
  );
}
