import { motion } from "motion/react";
import { Zap, DollarSign, Clock, ShieldCheck } from "lucide-react";

const features = [
  {
    title: "간편하다",
    description: "쉽게 접수하고 실시간조회!",
    icon: Zap,
    color: "bg-yellow-400",
  },
  {
    title: "합리적요금",
    description: "최적의 예상거리로 합리적인 금액",
    icon: DollarSign,
    color: "bg-red-400",
  },
  {
    title: "빠르다",
    description: "세계로지스 고객1:1배송",
    icon: Clock,
    color: "bg-orange-400",
  },
  {
    title: "믿을수있다",
    description: "29년 업력이 증명합니다.",
    icon: ShieldCheck,
    color: "bg-blue-400",
  },
];

export default function Features() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            빅데이터 기반!!<br />
            <span className="text-blue-600">최적의 요금</span>으로 최선을 다해 배송해드릴것을 약속드립니다.
          </h2>
          <p className="text-slate-500 max-w-[700px] mx-auto">
            출발지와 도착지의 거리를 최적화된 금액으로 모든차종을 빠르고 안전하게 이용하세요
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="flex flex-col items-center text-center space-y-4 p-6 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-xl transition-all duration-300"
            >
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${feature.color} text-white shadow-lg`}>
                <feature.icon className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">{feature.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
