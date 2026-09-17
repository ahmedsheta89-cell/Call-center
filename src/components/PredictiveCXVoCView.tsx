/**
 * @file src/components/PredictiveCXVoCView.tsx
 * Predictive CX Intelligence, Churn Risk Scoring & Voice of Customer (VoC) Root Cause Analysis
 * Includes Proactive Retention Playbook Dispatcher & VoC Regional Drilldown
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  AlertOctagon,
  HeartHandshake,
  Sparkles,
  PieChart,
  BarChart3,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Users,
  Compass,
  Send,
  X,
  Phone,
  MessageCircle,
  Clock,
  Layers,
} from 'lucide-react';

interface ChurnCandidate {
  id: string;
  customerName: string;
  tier: 'VIP' | 'Gold' | 'Standard';
  phone: string;
  churnProbability: number; // 0 to 100
  predictedCSAT: number; // 1 to 5
  mainFrictionPoint: string;
  recommendedAction: string;
  actionTaken: boolean;
  history?: string[];
}

interface VoCCluster {
  id: string;
  topic: string;
  affectedVolume: number;
  sentimentScore: number; // -1 to +1
  trend: 'up' | 'down' | 'steady';
  rootCause: string;
  recommendedFix: string;
  region: string;
  sampleQuotes: string[];
}

export const PredictiveCXVoCView: React.FC = () => {
  const [candidates, setCandidates] = useState<ChurnCandidate[]>([
    {
      id: 'churn-1',
      customerName: 'م. طارق عبد الرحمن',
      tier: 'VIP',
      phone: '+201009876543',
      churnProbability: 88,
      predictedCSAT: 1.8,
      mainFrictionPoint: 'انقطاع خدمة الألياف الضوئية مرتين خلال 48 ساعة دون إشعار مسبق',
      recommendedAction: 'تفعيل باقة إنترنت طوارئ 50GB مجانية فوراً والاتصال به عبر مدير الحسابات',
      actionTaken: false,
      history: ['عميل منذ 4 سنوات', 'متوسط إنفاق 850 EGP شهرياً', '2 بلاغ عطل مفتوح'],
    },
    {
      id: 'churn-2',
      customerName: 'د. منى الكردي',
      tier: 'Gold',
      phone: '+201223456789',
      churnProbability: 72,
      predictedCSAT: 2.3,
      mainFrictionPoint: 'تأخر تسوية خطأ تحويل في محفظة فودافون كاش وبطء الرد في الشات',
      recommendedAction: 'إلغاء رسوم التحويل وإصدار قسيمة رصيد مجانية بقيمة 100 جنيه',
      actionTaken: false,
      history: ['عميل منذ سنتين', 'مشتركة في المحفظة الإلكترونية', 'تقييم مكالمة أخير: 1 نجوم'],
    },
    {
      id: 'churn-3',
      customerName: 'كريم الحسين',
      tier: 'Standard',
      phone: '+201112233445',
      churnProbability: 64,
      predictedCSAT: 2.9,
      mainFrictionPoint: 'هبوط سرعة باقة VDSL في أوقات الذروة بمنطقة الهرم',
      recommendedAction: 'إعادة تهيئة مسار الـ Gateway وتحديث Firmware الراوتر عن بُعد',
      actionTaken: true,
      history: ['تم تحديث مسار الـ Gateway', 'انخفاض نسبة الخطر من 64% إلى 19%'],
    },
  ]);

  const [clusters] = useState<VoCCluster[]>([
    {
      id: 'voc-1',
      topic: 'أعطال كبائن الفايبر وسرعات الرفع (VDSL Sync Drop)',
      affectedVolume: 1420,
      sentimentScore: -0.74,
      trend: 'up',
      rootCause: 'أعمال صيانة وتطوير شبكات الجهد العالي في سنترال رمسيس والمهندسين',
      recommendedFix: 'إرسال تنبيه SMS استباقي للعملاء في النطاق الجغرافي وتوجيه المكالمات لرسالة الـ IVR المخصصة',
      region: 'القاهرة والجيزة',
      sampleQuotes: [
        '"النت قاطع من الصبح ومحدش بيرد"',
        '"عندي شغل ريموت واللمبة الحمرا منورة في الراوتر"',
      ],
    },
    {
      id: 'voc-2',
      topic: 'تأخر تأكيدات سداد الفواتير عبر إنستاباي (InstaPay IPN Latency)',
      affectedVolume: 890,
      sentimentScore: -0.58,
      trend: 'steady',
      rootCause: 'تأخير استجابة الـ Webhook من البنك المركزي في فترات المساء',
      recommendedFix: 'تفعيل نظام التسوية المؤقتة الفورية (Instant Soft-Credit) لتجنب انقطاع خط العميل',
      region: 'شامل المحافظات',
      sampleQuotes: [
        '"دفعت بإنستاباي والخط لسه مفصول"',
        '"الفلوس اتخصمت والرسالة مجتليش على الموبايل"',
      ],
    },
    {
      id: 'voc-3',
      topic: 'استفسارات باقات التجوال والبيانات الدولية',
      affectedVolume: 430,
      sentimentScore: +0.62,
      trend: 'up',
      rootCause: 'موسم السفر والإجازات الصيفية والرحلات الخليجية',
      recommendedFix: 'إتاحة تفعيل باقة تجوال بنقرة واحدة عبر بوت الواتساب دون مراجعة الفرع',
      region: 'المطارات والمنافذ',
      sampleQuotes: [
        '"عايز باقة إنترنت للسعودية والإمارات"',
        '"ازاي اشغل الشريحة اول ما الطيارة تنزل؟"',
      ],
    },
  ]);

  // Filters
  const [tierFilter, setTierFilter] = useState<'all' | 'VIP' | 'Gold' | 'Standard'>('all');
  const [selectedCluster, setSelectedCluster] = useState<VoCCluster | null>(null);

  // Retention Modal State
  const [activeRetentionCandidate, setActiveRetentionCandidate] = useState<ChurnCandidate | null>(null);
  const [customRetentionMsg, setCustomRetentionMsg] = useState('');
  const [isSendingRetention, setIsSendingRetention] = useState(false);

  const filteredCandidates = candidates.filter((c) => {
    if (tierFilter !== 'all' && c.tier !== tierFilter) return false;
    return true;
  });

  const handleOpenRetentionModal = (cand: ChurnCandidate) => {
    setActiveRetentionCandidate(cand);
    setCustomRetentionMsg(
      `عزيزنا ${cand.customerName}، نعتذر بشدة عن التأخير أو الانقطاع الأخير. كتقدير لثقتكم بنا، تم ${cand.recommendedAction} لحسابكم بدون أي رسوم. فريقنا يتابع استقرار خدمتكم على مدار الساعة.`
    );
  };

  const handleConfirmRetention = () => {
    if (!activeRetentionCandidate) return;
    setIsSendingRetention(true);

    setTimeout(() => {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === activeRetentionCandidate.id
            ? {
                ...c,
                actionTaken: true,
                churnProbability: Math.max(12, c.churnProbability - 50),
                predictedCSAT: 4.6,
              }
            : c
        )
      );
      setIsSendingRetention(false);
      setActiveRetentionCandidate(null);
    }, 700);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto select-none" dir="rtl">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30 rounded-xl text-amber-400">
            <TrendingUp className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>التحليلات التنبؤية وصوت العميل (Predictive CX & Voice of Customer)</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                Predictive AI Active
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              التنبؤ اللحظي باحتمالية مغادرة العملاء (Churn Scoring) وتجميع الأسباب الجذرية (RCA Clusters) استباقياً
            </p>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-center">
            <span className="text-slate-400 block text-[10px]">معدل الرضا المتوقع (CSAT)</span>
            <span className="text-emerald-400 font-bold text-sm">4.42 / 5.0</span>
          </div>
          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-center">
            <span className="text-slate-400 block text-[10px]">مؤشر تجنب الإلغاء (Saved Churn)</span>
            <span className="text-teal-400 font-bold text-sm">84.2%</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Churn Risk Candidates & Playbooks */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>قائمة العملاء الأكثر عرضة لإلغاء الخدمة (Churn Watchlist)</span>
            </h3>

            {/* Tier Filters */}
            <div className="flex items-center gap-1.5 text-[10px]">
              {(['all', 'VIP', 'Gold', 'Standard'] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setTierFilter(tier)}
                  className={`px-2 py-0.5 rounded-md font-mono transition ${
                    tierFilter === tier
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tier === 'all' ? 'الكل' : tier}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredCandidates.map((cand) => (
              <div
                key={cand.id}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{cand.customerName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                      {cand.tier}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{cand.phone}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">احتمالية المغادرة:</span>
                    <span
                      className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                        cand.churnProbability > 70
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {cand.churnProbability}%
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800/80 text-[11px] text-slate-300">
                  <span className="text-slate-400 font-semibold block mb-0.5">نقطة الاحتكاك المكتشفة:</span>
                  <p>{cand.mainFrictionPoint}</p>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{cand.recommendedAction}</span>
                  </div>

                  <button
                    onClick={() => handleOpenRetentionModal(cand)}
                    disabled={cand.actionTaken}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                      cand.actionTaken
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-md'
                    }`}
                  >
                    {cand.actionTaken ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>تم تفعيل الاحتواء</span>
                      </>
                    ) : (
                      <>
                        <HeartHandshake className="w-3.5 h-3.5" />
                        <span>تنفيذ خطة الاستبقاء</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Voice of Customer (VoC) Root Cause Clusters */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-400" />
              <span>تجميع الأسباب الجذرية للشكاوى (VoC RCA Clusters)</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Semantic Topic Modeling</span>
          </div>

          <div className="space-y-3">
            {clusters.map((cluster) => (
              <div
                key={cluster.id}
                onClick={() => setSelectedCluster(cluster)}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer rounded-xl p-4 space-y-2.5 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">{cluster.topic}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      النطاق الجغرافي: {cluster.region} | المتأثرون: {cluster.affectedVolume.toLocaleString()} عميل
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      cluster.sentimentScore < 0
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    المشاعر: {cluster.sentimentScore}
                  </span>
                </div>

                <div className="text-[11px] bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                  <p className="text-slate-300">
                    <strong className="text-slate-400">السبب الجذري: </strong>
                    {cluster.rootCause}
                  </p>
                  <p className="text-teal-300">
                    <strong className="text-teal-400">الإجراء المقترح: </strong>
                    {cluster.recommendedFix}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>انقر لعرض نماذج اقتباسات العملاء</span>
                  <span className="text-teal-400 font-mono">2 اقتباسات مسجلة</span>
                </div>
              </div>
            ))}
          </div>

          {/* Drilldown Modal / Box */}
          {selectedCluster && (
            <div className="p-4 bg-teal-950/20 border border-teal-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-300">
                  اقتباسات مباشرة من العملاء: {selectedCluster.topic}
                </span>
                <button
                  onClick={() => setSelectedCluster(null)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  إغلاق
                </button>
              </div>
              <div className="space-y-1 text-[11px] font-mono text-slate-300">
                {selectedCluster.sampleQuotes.map((q, i) => (
                  <p key={i} className="bg-slate-950/80 p-2 rounded border border-slate-800/80 text-amber-200">
                    {q}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Proactive Retention Playbook Modal */}
      {activeRetentionCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white">
                  إرسال خطة الاستبقاء الفورية: {activeRetentionCandidate.customerName}
                </h3>
              </div>
              <button
                onClick={() => setActiveRetentionCandidate(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">رقم الهاتف:</span>
                  <span className="font-mono text-white">{activeRetentionCandidate.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">تصنيف العميل:</span>
                  <span className="font-mono text-amber-300">{activeRetentionCandidate.tier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">الإجراء الموصى به:</span>
                  <span className="text-emerald-400 font-semibold">{activeRetentionCandidate.recommendedAction}</span>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  نص الرسالة التعويضية (SMS & WhatsApp):
                </label>
                <textarea
                  rows={4}
                  value={customRetentionMsg}
                  onChange={(e) => setCustomRetentionMsg(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setActiveRetentionCandidate(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmRetention}
                disabled={isSendingRetention}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingRetention ? 'جاري الإرسال والتسوية...' : 'تأكيد وإرسال التعويض'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
