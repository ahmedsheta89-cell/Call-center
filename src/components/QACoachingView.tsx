/**
 * @file src/components/QACoachingView.tsx
 * Quality Assurance (QA) Scorecards & Agent Coaching Console
 */

import React, { useState, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  User,
  Sparkles,
  BookOpen,
  Plus,
  TrendingUp,
  Target,
  Check,
  Clock,
  Zap,
} from 'lucide-react';
import { CoachingActionPlan } from '../types.ts';

export const QACoachingView: React.FC = () => {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string>('');
  const [coachingPlans, setCoachingPlans] = useState<CoachingActionPlan[]>([]);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [newPlanAgent, setNewPlanAgent] = useState('سارة أحمد');
  const [newPlanTitle, setNewPlanTitle] = useState('إتقان مهارات خفض حدة التوتر في المحادثات الغاضبة');
  const [newPlanFocus, setNewPlanFocus] = useState('De-escalation and Tone Management');
  const [newPlanTarget, setNewPlanTarget] = useState('رفع نقاط نبرة الصوت إلى 95%');

  const fetchPlans = () => {
    fetch('/api/v1/qa/coaching-plans')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCoachingPlans(d.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/v1/qa/evaluations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setEvaluations(d.data);
          if (d.data.length > 0) setSelectedEvalId(d.data[0].id);
        }
      });

    fetch('/api/v1/qa/rubrics')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRubrics(d.data);
      });

    fetchPlans();
  }, []);

  const handleUpdateProgress = async (planId: string, currentProgress: number) => {
    const nextProgress = Math.min(100, currentProgress + 25);
    const nextStatus = nextProgress >= 100 ? 'completed' : 'in_progress';
    try {
      const res = await fetch(`/api/v1/qa/coaching-plans/${planId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPercent: nextProgress, status: nextStatus }),
      });
      const d = await res.json();
      if (d.success) {
        fetchPlans();
      }
    } catch {
      // ignore
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/qa/coaching-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'agent-1',
          agentName: newPlanAgent,
          title: newPlanTitle,
          focusArea: newPlanFocus,
          targetMetric: newPlanTarget,
          targetDate: new Date(Date.now() + 14 * 86400000).toISOString(),
          recommendedActions: [
            'الاستماع إلى تسجيلين نموذجيين لمكالمات de-escalation',
            'إجراء محاكاة تفاعلية مع المدرب الآلي Gemini Coach',
          ],
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowNewPlanModal(false);
        fetchPlans();
      }
    } catch {
      // ignore
    }
  };

  const activeEval = evaluations.find((e) => e.id === selectedEvalId) || evaluations[0];
  const activeRubric = rubrics[0];

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <span>إدارة جودة الخدمة وتدريب الوكلاء (QA & Coaching)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تقييم موضوعي للمحادثات والمكالمات عبر الذكاء الاصطناعي والمشرفين مع خطط تدريب فردية وتوصيات نمو
          </p>
        </div>

        <button
          onClick={() => setShowNewPlanModal(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء خطة تدريب وتوصية جديدة</span>
        </button>
      </div>

      {/* Top Section: Active Coaching & Development Plans */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">خطط التدريب والتوصيات التنموية للوكلاء (Active Coaching Plans)</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">{coachingPlans.length} خطط نشطة</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coachingPlans.map((plan) => {
            const isCompleted = plan.status === 'completed';
            return (
              <div
                key={plan.id}
                className={`p-4 rounded-2xl border space-y-3 transition ${
                  isCompleted
                    ? 'bg-slate-950/60 border-emerald-500/30'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{plan.agentName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                      {plan.focusArea}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {isCompleted ? 'مكتملة' : 'قيد التدريب'}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-slate-200">{plan.title}</h4>

                <div className="text-[11px] text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    <span>الهدف: {plan.targetMetric}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    الاستحقاق: {new Date(plan.targetDate).toLocaleDateString('ar-SA')}
                  </div>
                </div>

                {/* Progress Bar & Actions */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>نسبة الإنجاز</span>
                    <span className="font-bold text-emerald-400">{plan.progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${plan.progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-500">
                    {plan.recommendedActions.length} إجراءات تدريب موصى بها
                  </span>
                  {!isCompleted ? (
                    <button
                      onClick={() => handleUpdateProgress(plan.id, plan.progressPercent)}
                      className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>تسجيل تقدم (+25%)</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تم استيفاء معايير الجودة</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Section: Evaluations & Rubrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Evaluations History List */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-bold text-white">التقييمات الأخيرة</span>
            <span className="text-xs text-slate-400 font-mono">{evaluations.length} تقييم</span>
          </div>

          <div className="space-y-2.5">
            {evaluations.map((ev) => {
              const isSelected = ev.id === activeEval?.id;
              return (
                <div
                  key={ev.id}
                  onClick={() => setSelectedEvalId(ev.id)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white">سارة أحمد (وكيل)</span>
                    <span className="text-xs font-bold font-mono text-emerald-400">
                      {ev.totalScore}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mb-2">
                    المقيّم: {ev.evaluatorName}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>{ev.conversationId || 'مكالمة هاتفية'}</span>
                    <span>{new Date(ev.createdAt).toLocaleDateString('ar-SA')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed Scorecard & Rubric */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          {activeEval ? (
            <>
              {/* Score Header */}
              <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">بطاقة التقييم الشاملة</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      ناجح ومطابق (PASSED)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    تم التقييم بواسطة {activeEval.evaluatorName} وفق معيار الجودة الموحد
                  </p>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-black text-emerald-400 font-mono">
                    {activeEval.totalScore}
                    <span className="text-sm font-normal text-slate-400"> / 100</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">درجة الامتثال الكلية</div>
                </div>
              </div>

              {/* Rubric Criteria Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-200">تفاصيل الدرجات حسب المعايير:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeRubric?.criteria?.map((cr: any, i: number) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-100">{cr.category}</span>
                        <span className="text-emerald-400 font-mono font-bold">الوزن: {cr.weight}%</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{cr.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coaching Feedback */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                  <span>ملاحظات التوجيه والتدريب (Coaching Recommendation):</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{activeEval.feedback}</p>
              </div>
            </>
          ) : (
            <div className="text-center text-xs text-slate-500 py-20">اختر بطاقة تقييم للعرض</div>
          )}
        </div>
      </div>

      {/* Modal: Create New Coaching Plan */}
      {showNewPlanModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">إضافة خطة تدريب وتوصية مخصصة للوكيل</h3>
              <button
                onClick={() => setShowNewPlanModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">اسم الوكيل المستهدف</label>
                <input
                  type="text"
                  value={newPlanAgent}
                  onChange={(e) => setNewPlanAgent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">عنوان الخطة أو التوصية</label>
                <input
                  type="text"
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">مجال التركيز (Focus Area)</label>
                <input
                  type="text"
                  value={newPlanFocus}
                  onChange={(e) => setNewPlanFocus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">المؤشر أو الهدف القابل للقياس (Target)</label>
                <input
                  type="text"
                  value={newPlanTarget}
                  onChange={(e) => setNewPlanTarget(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPlanModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-sm"
                >
                  حفظ وتعيين الخطة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

