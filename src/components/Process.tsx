import { motion } from "motion/react";
import { Search, FileEdit, Truck, MapPinCheck } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "무료 운송요금 조회",
    description: "시간, 장소에 제약없이 편안하게 요금조회 / 다년간 쌓아온 노하우로 최적화 된 거리에 뺀 가격을 제공",
    icon: Search,
  },
  {
    number: "02",
    title: "화물접수",
    description: "자동화 된 시스템으로 빠르고 정확하게 화물접수 불필요한 정보 입력없이 누구나 간편하게 접수",
    icon: FileEdit,
  },
  {
    number: "03",
    title: "화물운송",
    description: "다년간 운전하신 숙련된 기사님께서 고객님의 소중한 화물을 안전하게 운송 / 운반",
    icon: Truck,
  },
  {
    number: "04",
    title: "배송지 도착",
    description: "정확한 시간에 신속하고 안전하게 고객님의 화물이 배송",
    icon: MapPinCheck,
  },
];

export default function Process() {
  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center space-y-4 mb-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            누구나 손쉽고 빠르게 PC, 모바일, 앱에서<br />
            언제 어디서든 <span className="text-blue-600">간편하게 접수</span>하세요.
          </h2>
          <p className="text-slate-500 max-w-[700px] mx-auto">
            이번달 지출한 운송비 조회로,미리 운송비 예산을 각부서별로 조정하세요!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center lg:gap-20">
          <motion.div
            className="relative lg:scale-110 lg:origin-left"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <motion.img 
              src="/process-laptop.png" 
              alt="PC 모바일 접수 화면" 
              className="rounded-3xl shadow-2xl w-full"
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.3 }}
            />
            <motion.div
              className="absolute -bottom-6 -right-6 h-32 w-32 bg-yellow-400 rounded-2xl flex items-center justify-center shadow-xl"
              initial={{ opacity: 0, scale: 0 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4, type: "spring", stiffness: 200 }}
              viewport={{ once: true }}
            >
              <Truck className="h-16 w-16 text-blue-900" />
            </motion.div>
          </motion.div>

          <div className="space-y-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex gap-6 group"
              >
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white border-2 border-blue-600 text-blue-600 font-bold shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <step.icon className="h-6 w-6" />
                  </div>
                  {index !== steps.length - 1 && (
                    <div className="w-0.5 h-full bg-blue-100 mt-2" />
                  )}
                </div>
                <div className="pb-8">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Step {step.number}</span>
                  <h3 className="text-xl font-bold text-slate-900 mt-1 mb-2">{step.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
