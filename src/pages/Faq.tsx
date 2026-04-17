import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Phone, MessageCircle } from "lucide-react";

const faqs = [
  {
    question: "결제는 어떻게 하나요? 현장 카드 결제가 가능한가요?",
    answer: "결제는 계좌이체, 카드 결제, 신용 거래(법인 회원) 모두 가능합니다. 기사님 방문 시 현장 카드 결제를 원하실 경우, 1588-7185로 접수하실 때 미리 말씀해 주시면 카드 단말기를 지참한 기사님으로 우선 배차해 드립니다.",
  },
  {
    question: "시간 및 날짜를 지정할 수 있나요?",
    answer: "네, 가능합니다. 세계로지스는 실시간 배차뿐만 아니라 고객님이 원하시는 특정 날짜와 시간에 맞춘 예약 운송 서비스를 제공하고 있습니다.",
  },
  {
    question: "당일 운송 예약도 가능한가요?",
    answer: "물론입니다. 세계로지스는 경기도 파주, 고양, 김포 일대를 포함해 전국 어디든 접수 즉시 가장 가까운 기사님을 매칭하여 당일 배송을 완료해 드립니다.",
  },
  {
    question: "예약을 취소할 수 있나요?",
    answer: "예약 취소는 가능합니다. 다만, 기사님이 이미 출발한 후에 취소하실 경우 거리와 상황에 따라 소정의 회차비(취소수수료)가 발생할 수 있으니 가급적 빠른 연락 부탁드립니다.",
  },
  {
    question: "기사님 정보는 언제 확인할 수 있나요?",
    answer: "배차가 완료되는 즉시 고객님의 휴대폰으로 기사님 성함, 연락처, 차량 번호가 포함된 안내 문자를 발송해 드립니다.",
  },
  {
    question: "운송 중 기사님이 추가금을 요구하면 어떻게 하나요?",
    answer: "세계로지스는 투명한 정찰제 운임을 지향합니다. 사전에 협의되지 않은 부당한 요금 요구가 있을 경우, 현장에서 직접 지불하지 마시고 즉시 고객센터(1588-7185)로 연락 주십시오.",
  },
  {
    question: "대기 시간이 길어질 경우 어떻게 되나요?",
    answer: "출발지 및 도착지에서 상/하차 시간이 길어질 경우 추가 요금이 발생할 수 있습니다. 원활한 배송을 위해 미리 준비해 주시면 신속한 운송이 가능합니다.",
  },
  {
    question: "출·퇴근 시간 또는 기상 상황에 따라 요금이 변동되나요?",
    answer: "폭설, 폭우 등 기상 상황이나 차량이 극심하게 붐비는 시간대에는 짧은 거리라도 운행 시간이 길어지기 때문에 추가 요금이 발생할 수 있습니다.",
  },
  {
    question: "운송 차량에 동승할 수 있나요?",
    answer: "화물 보호와 상하차 확인을 위해 필요한 경우 기사님과 협의 하에 1인까지 동승이 가능한 차량을 배차해 드릴 수 있습니다. 접수 시 상담원에게 미리 확인해 주세요.",
  },
  {
    question: "포장도 해주시나요?",
    answer: "세계로지스의 기본 서비스는 운송 기반입니다. 일반 퀵/용달 서비스는 고객님이 미리 포장해두신 물품을 옮겨 드리는 것이 원칙이며, 포장 서비스 필요 시 별도로 문의 부탁드립니다.",
  },
];

function FaqItem({ item, index }: { item: typeof faqs[0]; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      viewport={{ once: true }}
      className={`rounded-xl border transition-all duration-200 overflow-hidden
        ${open ? "border-blue-300 shadow-md shadow-blue-100" : "border-slate-200 hover:border-blue-200 hover:shadow-sm"}`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left bg-white"
      >
        <div className="flex items-center gap-4">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-black flex items-center justify-center">
            Q
          </span>
          <span className={`text-base font-semibold transition-colors ${open ? "text-blue-700" : "text-slate-800"}`}>
            {item.question}
          </span>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex-shrink-0"
        >
          <ChevronDown className={`w-5 h-5 transition-colors ${open ? "text-blue-600" : "text-slate-400"}`} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="px-6 pb-5 flex gap-4 bg-blue-50/60 border-t border-blue-100">
              <span className="flex-shrink-0 mt-1 w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-black flex items-center justify-center">
                A
              </span>
              <p className="text-slate-600 leading-relaxed text-sm pt-1">{item.answer}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Faq() {
  return (
    <div id="segye-faq" className="bg-white min-h-screen">
      {/* Hero */}
      <div className="bg-blue-600 py-16 text-center">
        <div className="container mx-auto px-4">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-blue-200 text-sm font-semibold uppercase tracking-widest mb-3"
          >
            FAQ
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white text-4xl font-black mb-3"
          >
            자주 묻는 질문
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-blue-100 text-lg"
          >
            궁금하신 사항을 빠르게 확인해보세요.
          </motion.p>
        </div>
      </div>

      {/* FAQ List */}
      <div className="container mx-auto px-4 md:px-6 py-16 max-w-3xl">
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <FaqItem key={i} item={faq} index={i} />
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mt-14 rounded-2xl bg-blue-700 p-8 text-center text-white"
        >
          <h3 className="text-xl font-black mb-2">
            "1997년부터 이어온 29년 경력, 세계로지스는 기업 물류 전문가입니다."
          </h3>
          <p className="text-blue-100 text-sm mb-6">
            기업 간 신용 거래(외상) 및 대량 배차 상담은 아래 연락처로 문의해 주세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:1588-7185"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-white text-blue-700 font-black rounded-lg hover:bg-blue-50 transition-colors shadow"
            >
              <Phone className="w-5 h-5" />
              1588-7185 전화상담
            </a>
            <a
              href="http://pf.kakao.com/_bNaPxj/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-yellow-400 text-slate-900 font-black rounded-lg hover:bg-yellow-300 transition-colors shadow"
            >
              <MessageCircle className="w-5 h-5" />
              카카오 실시간 상담
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
