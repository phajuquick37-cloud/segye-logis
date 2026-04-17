import { motion } from "motion/react";
import { Button } from "../../components/ui/button";

const vehicleList = [
  {
    name: "다마스",
    image: "/vehicle-damas.jpg",
    specs: [
      { label: "적재함 길이", value: "1,600mm" },
      { label: "적재함 지상고", value: "-" },
      { label: "적재함 폭", value: "1,100mm" },
      { label: "차량 총 길이", value: "3,395mm" },
      { label: "적재함 높이", value: "1,100mm" },
      { label: "차량 총 높이", value: "1,920mm" },
      { label: "적재량", value: "300kg" },
      { label: "차량 적재 용적", value: "1.5BM" },
    ]
  },
  {
    name: "라보",
    image: "/vehicle-labo.jpg",
    specs: [
      { label: "적재함 길이", value: "2,190mm" },
      { label: "적재함 지상고", value: "80mm" },
      { label: "적재함 폭", value: "1,400mm" },
      { label: "차량 총 길이", value: "3,400mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "1,780mm" },
      { label: "적재량", value: "550kg" },
      { label: "차량 적재 용적", value: "3.5BM" },
    ]
  },
  {
    name: "1톤 카고",
    image: "/vehicle-1ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "2,850mm" },
      { label: "적재함 지상고", value: "80mm" },
      { label: "적재함 폭", value: "1,600mm" },
      { label: "차량 총 길이", value: "4,820mm" },
      { label: "적재함 높이", value: "1,700mm" },
      { label: "차량 총 높이", value: "1,995mm" },
      { label: "적재량", value: "1,000kg" },
      { label: "차량 적재 용적", value: "6CBM" },
    ]
  },
  {
    name: "1톤 윙바디·탑",
    image: "/vehicle-1ton-wing.jpg",
    specs: [
      { label: "적재함 길이", value: "2,850mm" },
      { label: "적재함 지상고", value: "80mm" },
      { label: "적재함 폭", value: "1,600mm" },
      { label: "차량 총 길이", value: "4,820mm" },
      { label: "적재함 높이", value: "1,700mm" },
      { label: "차량 총 높이", value: "2,570mm" },
      { label: "적재량", value: "1,000kg" },
      { label: "차량 적재 용적", value: "6CBM" },
    ]
  },
  {
    name: "1.4톤 카고",
    image: "/vehicle-1.4ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "3,100mm" },
      { label: "적재함 지상고", value: "80mm" },
      { label: "적재함 폭", value: "1,700mm" },
      { label: "차량 총 길이", value: "5,425mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "2,080mm" },
      { label: "적재량", value: "2,000kg" },
      { label: "차량 적재 용적", value: "6.5CBM" },
    ]
  },
  {
    name: "1.4톤 윙바디·탑",
    image: "/vehicle-1.4ton-wing.jpg",
    specs: [
      { label: "적재함 길이", value: "3,100mm" },
      { label: "적재함 지상고", value: "80mm" },
      { label: "적재함 폭", value: "1,700mm" },
      { label: "차량 총 길이", value: "5,425mm" },
      { label: "적재함 높이", value: "1,800mm" },
      { label: "차량 총 높이", value: "2,580mm" },
      { label: "적재량", value: "2,000kg" },
      { label: "차량 적재 용적", value: "6.5CBM" },
    ]
  },
  {
    name: "2.5톤 카고",
    image: "/vehicle-2.5ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "4,300mm" },
      { label: "적재함 지상고", value: "100mm" },
      { label: "적재함 폭", value: "1,800mm" },
      { label: "차량 총 길이", value: "6,225mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "2,325mm" },
      { label: "적재량", value: "2,500kg" },
      { label: "차량 적재 용적", value: "12CBM" },
    ]
  },
  {
    name: "2.5톤 윙바디·탑",
    image: "/vehicle-2.5ton-wing.jpg",
    specs: [
      { label: "적재함 길이", value: "4,300mm" },
      { label: "적재함 지상고", value: "100mm" },
      { label: "적재함 폭", value: "1,800mm" },
      { label: "차량 총 길이", value: "6,225mm" },
      { label: "적재함 높이", value: "2,200mm" },
      { label: "차량 총 높이", value: "3,100mm" },
      { label: "적재량", value: "2,500kg" },
      { label: "차량 적재 용적", value: "12CBM" },
    ]
  },
  {
    name: "3.5톤 카고",
    image: "/vehicle-3.5ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "5,100mm" },
      { label: "적재함 지상고", value: "100mm" },
      { label: "적재함 폭", value: "2,100mm" },
      { label: "차량 총 길이", value: "7,100mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "2,400mm" },
      { label: "적재량", value: "3,500kg" },
      { label: "차량 적재 용적", value: "18CBM" },
    ]
  },
  {
    name: "3.5톤 윙바디·탑",
    image: "/vehicle-3.5ton-wing.jpg",
    specs: [
      { label: "적재함 길이", value: "5,100mm" },
      { label: "적재함 지상고", value: "100mm" },
      { label: "적재함 폭", value: "2,100mm" },
      { label: "차량 총 길이", value: "7,100mm" },
      { label: "적재함 높이", value: "2,200mm" },
      { label: "차량 총 높이", value: "3,200mm" },
      { label: "적재량", value: "3,500kg" },
      { label: "차량 적재 용적", value: "18CBM" },
    ]
  },
  {
    name: "5톤 카고",
    image: "/vehicle-5ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "6,200mm" },
      { label: "적재함 지상고", value: "120mm" },
      { label: "적재함 폭", value: "2,350mm" },
      { label: "차량 총 길이", value: "8,200mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "2,500mm" },
      { label: "적재량", value: "5,000kg" },
      { label: "차량 적재 용적", value: "24CBM" },
    ]
  },
  {
    name: "5톤 윙바디·탑",
    image: "/vehicle-5ton-wing.jpg",
    specs: [
      { label: "적재함 길이", value: "6,200mm" },
      { label: "적재함 지상고", value: "120mm" },
      { label: "적재함 폭", value: "2,350mm" },
      { label: "차량 총 길이", value: "8,200mm" },
      { label: "적재함 높이", value: "2,400mm" },
      { label: "차량 총 높이", value: "3,400mm" },
      { label: "적재량", value: "5,000kg" },
      { label: "차량 적재 용적", value: "24CBM" },
    ]
  },
  {
    name: "11톤 카고",
    image: "/vehicle-11ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "9,100mm" },
      { label: "적재함 지상고", value: "130mm" },
      { label: "적재함 폭", value: "2,230mm" },
      { label: "차량 총 길이", value: "11,500mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "2,900mm" },
      { label: "적재량", value: "13,000kg" },
      { label: "차량 적재 용적", value: "48CBM" },
    ]
  },
  {
    name: "11톤 윙바디·탑",
    image: "/vehicle-11ton-wing.jpg",
    specs: [
      { label: "적재함 길이", value: "9,100mm" },
      { label: "적재함 지상고", value: "130mm" },
      { label: "적재함 폭", value: "2,340mm" },
      { label: "차량 총 길이", value: "11,500mm" },
      { label: "적재함 높이", value: "2,500mm" },
      { label: "차량 총 높이", value: "3,800mm" },
      { label: "적재량", value: "13,000kg" },
      { label: "차량 적재 용적", value: "48CBM" },
    ]
  },
  {
    name: "25톤 카고",
    image: "/vehicle-25ton-cargo.jpg",
    specs: [
      { label: "적재함 길이", value: "10,100mm" },
      { label: "적재함 지상고", value: "150mm" },
      { label: "적재함 폭", value: "2,340mm" },
      { label: "차량 총 길이", value: "13,000mm" },
      { label: "적재함 높이", value: "-" },
      { label: "차량 총 높이", value: "3,000mm" },
      { label: "적재량", value: "25,000kg" },
      { label: "차량 적재 용적", value: "72CBM" },
    ]
  },
];

export default function Vehicles() {
  return (
    <div className="bg-white min-h-screen">
      {/* Header Section */}
      <div className="bg-blue-600 py-16 text-center">
        <div className="container mx-auto px-4">
          <h1 className="text-white text-4xl font-bold mb-4">차량종류 확인</h1>
          <p className="text-blue-100 text-lg">언제 어디서든 365일 24시간 접수 플랫폼</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-20 max-w-5xl">
        <div className="space-y-24">
          {vehicleList.map((vehicle, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              className="group"
            >
              {/* Vehicle Title with line */}
              <div className="flex items-center gap-4 mb-10">
                <h2 className="text-2xl font-black text-blue-900 whitespace-nowrap">{vehicle.name}</h2>
                <div className="h-[2px] w-full bg-blue-100" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                {/* Vehicle Image and Action */}
                <div className="flex flex-col items-center">
                  <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-100 mb-6 bg-slate-50">
                    <img 
                      src={vehicle.image} 
                      alt={vehicle.name} 
                      className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <Button className="w-full max-w-[200px] h-12 bg-blue-600 hover:bg-blue-700 font-bold">
                    내용 자세히 보기
                  </Button>
                </div>

                {/* Specs Table */}
                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="grid grid-cols-2">
                    {vehicle.specs.map((spec, sIdx) => (
                      <div 
                        key={sIdx} 
                        className={`flex flex-col md:flex-row border-b border-slate-100 last:border-0 ${
                          sIdx % 2 === 0 ? "bg-slate-50/50" : "bg-white"
                        }`}
                      >
                        <div className="bg-slate-100/50 p-4 text-sm font-bold text-slate-600 min-w-[120px] flex items-center">
                          {spec.label}
                        </div>
                        <div className="p-4 text-sm text-slate-700 font-medium flex-grow flex items-center">
                          {spec.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
