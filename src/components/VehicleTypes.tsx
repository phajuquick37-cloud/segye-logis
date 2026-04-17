import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const vehicles = [
  // Slide 1
  { name: "다마스", length: "1,600", width: "1,100", height: "1,100", load: "400kg", img: "/vehicle-damas.jpg" },
  { name: "라보", length: "2,200", width: "1,400", height: "1,500", load: "500kg", img: "/vehicle-labo.jpg" },
  { name: "1톤 카고", length: "2,850", width: "1,600", height: "1,700", load: "1,000kg", img: "/vehicle-1ton-cargo.jpg" },
  { name: "1톤 탑·윙바디", length: "2,850", width: "1,600", height: "1,700", load: "1,000kg", img: "/vehicle-1ton-wing.jpg" },
  { name: "1.4톤 카고", length: "3,100", width: "1,700", height: "-", load: "2,000kg", img: "/vehicle-1.4ton-cargo.jpg" },
  // Slide 2
  { name: "1.4톤 탑·윙바디", length: "3,100", width: "1,700", height: "1,800", load: "2,000kg", img: "/vehicle-1.4ton-wing.jpg" },
  { name: "2.5톤 카고", length: "4,300", width: "1,800", height: "-", load: "3,000kg", img: "/vehicle-2.5ton-cargo.jpg" },
  { name: "2.5톤 탑·윙바디", length: "4,300", width: "1,800", height: "2,200", load: "3,000kg", img: "/vehicle-2.5ton-wing.jpg" },
  { name: "3.5톤 카고", length: "5,100", width: "2,100", height: "-", load: "3,500kg", img: "/vehicle-3.5ton-cargo.jpg" },
  { name: "3.5톤 탑·윙바디", length: "5,100", width: "2,100", height: "2,200", load: "3,500kg", img: "/vehicle-3.5ton-wing.jpg" },
  // Slide 3
  { name: "5톤 카고", length: "6,200", width: "2,230", height: "-", load: "5,000kg", img: "/vehicle-5ton-cargo.jpg" },
  { name: "5톤 탑·윙바디", length: "6,200", width: "2,230", height: "2,400", load: "5,000kg", img: "/vehicle-5ton-wing.jpg" },
  { name: "11톤 카고", length: "9,100", width: "2,230", height: "-", load: "13,000kg", img: "/vehicle-11ton-cargo.jpg" },
  { name: "11톤 탑·윙바디", length: "9,100", width: "2,340", height: "2,500", load: "13,000kg", img: "/vehicle-11ton-wing.jpg" },
  { name: "25톤 카고", length: "10,100", width: "2,340", height: "-", load: "25,000kg", img: "/vehicle-25ton-cargo.jpg" },
];

export default function VehicleTypes() {
  const [page, setPage] = useState(0);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(vehicles.length / itemsPerPage);

  const next = () => setPage((p) => (p + 1) % totalPages);
  const prev = () => setPage((p) => (p - 1 + totalPages) % totalPages);

  const currentVehicles = vehicles.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  return (
    <section id="vehicle-types" className="py-24 bg-[#f0f4f7] relative overflow-hidden">
      {/* Background decorative circles */}
      <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-200/50 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-slate-200/50 rounded-full blur-3xl" />
      
      {/* Decorative dots on the right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden lg:grid grid-cols-4 gap-2 opacity-20">
        {[...Array(24)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-blue-400 rounded-full" />
        ))}
      </div>
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="mb-12">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            차량종류 확인
          </h2>
        </div>

        <div className="relative group">
          <button 
            onClick={prev}
            className="absolute left-[-20px] top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors border border-slate-100"
          >
            <ChevronLeft className="w-6 h-6 text-slate-400" />
          </button>
          
          <button 
            onClick={next}
            className="absolute right-[-20px] top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors border border-slate-100"
          >
            <ChevronRight className="w-6 h-6 text-slate-400" />
          </button>

          <div className="overflow-hidden relative min-h-[500px]">
            <AnimatePresence mode="wait">
              <motion.div 
                key={page}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
              >
                {currentVehicles.map((v, i) => (
                  <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-full">
                    <div className="p-6 flex items-center justify-center bg-white h-48">
                      <img 
                        src={v.img} 
                        alt={v.name} 
                        className="max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="bg-white border-t border-slate-100 flex-grow">
                      <div className="py-4 text-center border-b border-slate-100">
                        <h3 className="font-black text-lg text-slate-900">{v.name}</h3>
                      </div>
                      <div className="divide-y divide-slate-100">
                        <div className="grid grid-cols-2 text-sm">
                          <div className="px-4 py-3 text-slate-900 font-bold bg-white">길이</div>
                          <div className="px-4 py-3 text-slate-900 font-medium text-right bg-white">{v.length}mm</div>
                        </div>
                        <div className="grid grid-cols-2 text-sm">
                          <div className="px-4 py-3 text-slate-900 font-bold bg-white">폭</div>
                          <div className="px-4 py-3 text-slate-900 font-medium text-right bg-white">{v.width}mm</div>
                        </div>
                        <div className="grid grid-cols-2 text-sm">
                          <div className="px-4 py-3 text-slate-900 font-bold bg-white">높이</div>
                          <div className="px-4 py-3 text-slate-900 font-medium text-right bg-white">{v.height === "-" ? "-" : `${v.height}mm`}</div>
                        </div>
                        <div className="grid grid-cols-2 text-sm">
                          <div className="px-4 py-3 text-slate-900 font-bold bg-white">적재량</div>
                          <div className="px-4 py-3 text-slate-900 font-medium text-right bg-white">{v.load}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
