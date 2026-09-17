/**
 * @file src/components/GuidedWalkthroughModal.tsx
 * Interactive Guided Operational Tour & End-to-End Scenario Simulator
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Phone,
  MessageSquare,
  Ticket,
  ChevronRight,
  ChevronLeft,
  Play,
  FileCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface GuidedWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string, contextId?: string) => void;
  onRefreshData: () => void;
}

interface ScenarioStep {
  stepNumber: number;
  title: string;
  badge: string;
  description: string;
  targetTab: string;
  tabLabel: string;
  details: string[];
}

export const GuidedWalkthroughModal: React.FC<GuidedWalkthroughModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onRefreshData,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isRunningScenario, setIsRunningScenario] = useState(false);
  const [scenarioData, setScenarioData] = useState<{
    conversationId?: string;
    customerId?: string;
    ticketId?: string;
    customerName?: string;
    messageText?: string;
  } | null>(null);
  const [scenarioFeedback, setScenarioFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const steps: ScenarioStep[] = [
    {
      stepNumber: 1,
      title: 'استقبال بلاغ عميل VIP عبر واتساب وتحليل النوايا (AI Ingestion)',
      badge: 'WhatsApp Cloud API',
      description:
        'استقبال رسالة شكوى فوترة فورية من عميل VIP مع استخراج النية التشغيلية ومستوى المشاعر وتحديد مهلة الـ SLA.',
      targetTab: 'inbox',
      tabLabel: 'صندوق الوارد الموحد',
      details: [
        'مصدر الرسالة: Meta WhatsApp Cloud API الرسمي',
        'تصنيف النية: نزاع فوترة اشتراك فايبر أعمال (billing_dispute)',
        'تحليل المشاعر: سلبي (Negative) يستدعي تدخلاً سريعاً',
        'مستوى العميل: VIP (قيمة دورية > 14,500 ر.س)',
      ],
    },
    {
      stepNumber: 2,
      title: 'توليد تذكرة الدعم آلياً وتطبيق اتفاقية الخدمة (SLA Routing)',
      badge: 'SLA Engine',
      description:
        'محرك الأتمتة ينشئ تذكرة دعم فورية برقم مرجعي ويحدد مهلة حل ملزمة لا تتجاوز ساعتين مع مراقبة مؤشر الامتثال.',
      targetTab: 'tickets',
      tabLabel: 'إدارة التذاكر والـ SLA',
      details: [
        'رقم التذكرة: مولدة آلياً ومرتبطة بـ Customer 360',
        'مهلة الاستجابة الأولى: 15 دقيقة (Healthy)',
        'مهلة الحل الكامل: ساعتان وفق لوائح هيئة الاتصالات والفضاء والتقنية (CST)',
        'قواعد التصعيد: تنبيه المشرف التلقائي عند انقضاء 70% من المهلة',
      ],
    },
    {
      stepNumber: 3,
      title: 'مساعد الوكيل الذكي وقاعدة المعرفة (RAG & Anti-Hallucination)',
      badge: 'AI Copilot RAG',
      description:
        'الذكاء الاصطناعي يستحضر المادة النظامية للتعويض المالي من قاعدة المعرفة ويقترح رداً معتمداً بنسبة ثقة 98%.',
      targetTab: 'knowledge',
      tabLabel: 'قاعدة المعرفة وسياسات CST',
      details: [
        'المستند المسترجع: لائحة حماية حقوق مستخدمي خدمات الاتصالات (المادة 12)',
        'فحص الهلوسة: نجاح المطابقة بنسبة 100% مع البنود المنشورة',
        'الرد المقترح: توثيق الخطأ وقيد رصيد تعويضي مع تفعيل الخدمة',
        'ميزة الماكرو: تطبيق قالب الرد والاعتذار المعتمد بنقرة واحدة',
      ],
    },
    {
      stepNumber: 4,
      title: 'التواصل الصوتي عبر الهاتف الرقمي وفحص الميكروفون المباشر',
      badge: 'WebRTC Softphone',
      description:
        'الوكيل يجري اتصالاً بالعميل للتأكيد، مع تفريغ صوتي لحظي STT وأمواج صوتية حية مدفوعة بميكروفون المتصفح.',
      targetTab: 'voice',
      tabLabel: 'الهاتف الرقمي (Softphone)',
      details: [
        'بروتوكول الصوت: WebRTC مباشر بجودة 48kHz HD Voice',
        'التفريغ اللحظي: تقنية Speech-to-Text للغة العربية واللهجة المحلية',
        'التحكم الإشرافي: الاستماع الصامت، الهمس للموظف، والاقتحام المباشر',
        'مقياس الترددات: تفاعل حي مع صوت المتحدث في المتصفح',
      ],
    },
    {
      stepNumber: 5,
      title: 'سجل التدقيق المؤسسي والتقرير التنفيذي الشامل',
      badge: 'Compliance & Audit',
      description:
        'توثيق غير قابل للتعديل لكافة الإجراءات وتحديث مؤشرات أداء القوى العاملة (WFM) والتقرير التنفيذي.',
      targetTab: 'audit',
      tabLabel: 'سجل التدقيق والامتثال',
      details: [
        'التوثيق: سجل تدقيق غير قابل للتلاعب يوثق كافة التحركات بالثانية والـ IP',
        'الامتثال النظامي: مطابق لمتطلبات CST وهيئة البيانات والذكاء الاصطناعي (SDAIA)',
        'إنتاجية الوكلاء: تحديث فوري لجدول الالتزام بالوردية (Adherence Rate)',
        'تصدير التقارير: إمكانية استخراج تقرير PDF و Excel معتمدين فوراً',
      ],
    },
  ];

  const currentStep = steps[currentStepIndex];

  const handleRunScenario = async () => {
    setIsRunningScenario(true);
    setScenarioFeedback(null);
    try {
      const res = await fetch('/api/v1/demo/run-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioType: 'vip_billing_dispute' }),
      });
      const d = await res.json();
      if (d.success) {
        setScenarioData(d.data);
        setScenarioFeedback('تم حقن سيناريو الشكوى الحقيقي وبث الأحداث عبر SSE بنجاح!');
        onRefreshData();
      }
    } catch {
      setScenarioFeedback('حدث خطأ أثناء تشغيل السيناريو');
    } finally {
      setIsRunningScenario(false);
    }
  };

  const handleNavigateAndClose = (tab: string) => {
    onNavigateTab(tab, scenarioData?.conversationId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>جولة المحاكاة التشغيلية التفاعلية المتكاملة (End-to-End Tour)</span>
              </h2>
              <p className="text-xs text-slate-400">
                اختبار دورة العمل الحية من وصول الشكوى حتى الإغلاق والامتثال النظامي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Live Scenario Action Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>محاكاة بلاغ حقيقي لعميل VIP (سلطان القحطاني)</span>
            </div>
            <p className="text-[11px] text-slate-300">
              يقوم هذا الزر بإرسال رسالة واتساب حية للنظام، وإنشاء تذكرة دعم، وبث البيانات عبر SSE لحظياً.
            </p>
          </div>
          <button
            onClick={handleRunScenario}
            disabled={isRunningScenario}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition shrink-0 disabled:opacity-50 shadow-md shadow-emerald-600/30"
          >
            <Play className={`w-3.5 h-3.5 ${isRunningScenario ? 'animate-spin' : ''}`} />
            <span>{isRunningScenario ? 'جارٍ البث...' : 'إطلاق السيناريو الحي'}</span>
          </button>
        </div>

        {scenarioFeedback && (
          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {scenarioFeedback}
            </span>
            {scenarioData?.ticketId && (
              <span className="font-mono bg-emerald-950 px-2 py-0.5 rounded text-[11px] border border-emerald-500/40">
                التذكرة: #{scenarioData.ticketId}
              </span>
            )}
          </div>
        )}

        {/* Progress Stepper */}
        <div className="grid grid-cols-5 gap-2 pt-1">
          {steps.map((s, idx) => (
            <button
              key={s.stepNumber}
              onClick={() => setCurrentStepIndex(idx)}
              className={`p-2.5 rounded-xl border text-right transition flex flex-col justify-between ${
                currentStepIndex === idx
                  ? 'bg-slate-800 border-emerald-500 text-white'
                  : currentStepIndex > idx
                  ? 'bg-slate-950/60 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold">0{s.stepNumber}</span>
                {currentStepIndex > idx && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
              </div>
              <span className="text-[11px] font-bold truncate mt-1">{s.badge}</span>
            </button>
          ))}
        </div>

        {/* Active Step Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              المرحلة {currentStep.stepNumber} من {steps.length}: {currentStep.badge}
            </span>
            <button
              onClick={() => handleNavigateAndClose(currentStep.targetTab)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition"
            >
              <span>فتح شاشة {currentStep.tabLabel}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-1.5">{currentStep.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{currentStep.description}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
            {currentStep.details.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
            <span>السابق</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNavigateAndClose(currentStep.targetTab)}
              className="px-4 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition"
            >
              معاينة شاشة {currentStep.tabLabel}
            </button>

            {currentStepIndex < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              >
                <span>الخطوة التالية</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
              >
                إنهاء الجولة
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
