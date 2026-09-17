/**
 * @file src/components/RecommendationsHub.tsx
 * Intelligent Executive & Operational Recommendations Center (مركز التوصيات الذكية الشامل)
 * Consolidates actionable AI insights across Workforce, Operations, QA, Retention, and Cost.
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Zap,
  TrendingUp,
  DollarSign,
  Users,
  Award,
  BookOpen,
  Filter,
  Check,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { SmartRecommendation, RecommendationDomain } from '../types.ts';

interface RecommendationsHubProps {
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToWFM?: () => void;
  onNavigateToQA?: () => void;
  onNavigateToKB?: () => void;
}

export const RecommendationsHub: React.FC<RecommendationsHubProps> = ({
  onNavigateToCustomer,
  onNavigateToWFM,
  onNavigateToQA,
  onNavigateToKB,
}) => {
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'applied'>('all');
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchRecs = () => {
    setLoading(true);
    fetch('/api/v1/recommendations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRecommendations(d.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRecs();
  }, []);

  const handleApply = async (rec: SmartRecommendation) => {
    setApplyingId(rec.id);
    setActionSuccessMsg(null);
    try {
      const res = await fetch(`/api/v1/recommendations/${rec.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (d.success) {
        setActionSuccessMsg(`تم تطبيق التوصية بنجاح: "${rec.title}" وتوثيقها في سجل الحوكمة.`);
        fetchRecs();
        setTimeout(() => setActionSuccessMsg(null), 5000);
      }
    } catch {
      // ignore
    } finally {
      setApplyingId(null);
    }
  };

  const domainTabs: Array<{ key: string; label: string; icon: React.ReactNode }> = [
    { key: 'all', label: 'كافة التوصيات', icon: <Sparkles className="w-4 h-4" /> },
    { key: 'operational', label: 'العمليات اللحظية', icon: <Zap className="w-4 h-4 text-amber-400" /> },
    { key: 'wfm', label: 'القوى العاملة (WFM)', icon: <Users className="w-4 h-4 text-indigo-400" /> },
    { key: 'customer_nba', label: 'الاستبقاء والمبيعات (NBA)', icon: <TrendingUp className="w-4 h-4 text-emerald-400" /> },
    { key: 'qa_coaching', label: 'جودة الخدمة وتدريب الوكلاء', icon: <Award className="w-4 h-4 text-rose-400" /> },
    { key: 'knowledge_gap', label: 'سد فجوات المعرفة', icon: <BookOpen className="w-4 h-4 text-cyan-400" /> },
    { key: 'cost_optimization', label: 'ترشيد التكاليف', icon: <DollarSign className="w-4 h-4 text-emerald-300" /> },
  ];

  const filteredRecs = recommendations.filter((r) => {
    const matchesDomain = selectedDomain === 'all' || r.domain === selectedDomain;
    const matchesStatus =
      filterStatus === 'all'
        ? true
        : filterStatus === 'pending'
        ? !r.applied
        : r.applied;
    return matchesDomain && matchesStatus;
  });

  const pendingCount = recommendations.filter((r) => !r.applied).length;
  const appliedCount = recommendations.filter((r) => r.applied).length;
  const criticalCount = recommendations.filter((r) => !r.applied && r.priority === 'critical').length;

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* 1. Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            <span>مركز التوصيات الذكية الشامل (AI Recommendations & Advisory Hub)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            توليد توصيات استباقية قابلة للتنفيذ المباشر مستندة إلى تحليلات Erlang C، وجودة المكالمات، وسلوك العملاء
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">الحالة:</span>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg transition ${
                filterStatus === 'all' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({recommendations.length})
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1 rounded-lg transition ${
                filterStatus === 'pending' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              قيد الانتظار ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('applied')}
              className={`px-3 py-1 rounded-lg transition ${
                filterStatus === 'applied' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              تم تطبيقها ({appliedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionSuccessMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* High-Level Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">توصيات تتطلب إجراء عاجل</div>
            <div className="text-xl font-bold font-mono text-rose-400 flex items-center gap-2">
              <span>{criticalCount} توصيات حرجة</span>
              {criticalCount > 0 && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">نسبة تطبيق التوصيات الذكية</div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {recommendations.length > 0 ? Math.round((appliedCount / recommendations.length) * 100) : 0}%
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">محرك التوصيات المعتمد</div>
            <div className="text-sm font-bold text-slate-200">Anti-Hallucination Verified</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Ground Truth SLA & Erlang-C</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Domain Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {domainTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSelectedDomain(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              selectedDomain === t.key
                ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                : 'bg-slate-900/70 text-slate-400 border-slate-800/80 hover:text-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Recommendations Cards Grid */}
      <div className="space-y-3.5">
        {loading ? (
          <div className="text-center py-16 text-xs text-slate-400">جارٍ استرجاع التوصيات الذكية...</div>
        ) : filteredRecs.length === 0 ? (
          <div className="text-center py-16 text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-3xl p-8">
            لا توجد توصيات مطابقة للفلاتر المحددة حالياً.
          </div>
        ) : (
          filteredRecs.map((rec) => {
            const isCritical = rec.priority === 'critical';
            const isHigh = rec.priority === 'high';
            return (
              <div
                key={rec.id}
                className={`p-5 rounded-3xl border transition space-y-3 ${
                  rec.applied
                    ? 'bg-slate-900/40 border-slate-800/60 opacity-80'
                    : isCritical
                    ? 'bg-slate-900 border-rose-500/40 shadow-sm'
                    : 'bg-slate-900 border-slate-800 shadow-sm hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase font-mono ${
                        isCritical
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isHigh
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isCritical ? 'أولوية قصوى' : isHigh ? 'أولوية عالية' : 'متوسطة'}
                    </span>

                    <span className="text-xs text-slate-400 font-mono">
                      {rec.domain === 'operational'
                        ? 'العمليات اللحظية'
                        : rec.domain === 'wfm'
                        ? 'جدولة القوى العاملة'
                        : rec.domain === 'customer_nba'
                        ? 'استبقاء ومبيعات'
                        : rec.domain === 'qa_coaching'
                        ? 'جودة وتدريب'
                        : rec.domain === 'knowledge_gap'
                        ? 'قاعدة المعرفة'
                        : 'ترشيد تكاليف'}
                    </span>

                    {rec.targetEntity?.name && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono">
                        الهدف: {rec.targetEntity.name}
                      </span>
                    )}
                  </div>

                  {rec.applied ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تم التطبيق</span>
                      {rec.appliedAt && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({new Date(rec.appliedAt).toLocaleDateString('ar-SA')})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>بانتظار موافقة المشرف</span>
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white mb-1">{rec.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{rec.description}</p>
                </div>

                {/* Impact Highlight Box */}
                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-slate-400 text-[11px] ml-1">الأثر التشغيلي المتوقع:</span>
                      <span className="text-emerald-300 font-bold">{rec.impact}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {rec.targetEntity?.type === 'customer' && (
                      <button
                        onClick={() => onNavigateToCustomer?.(rec.targetEntity!.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <span>عرض ملف العميل</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {rec.targetEntity?.type === 'shift' && (
                      <button
                        onClick={() => onNavigateToWFM?.()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <span>فتح جدول الـ WFM</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {rec.targetEntity?.type === 'agent' && (
                      <button
                        onClick={() => onNavigateToQA?.()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <span>لوحة تدريب الوكلاء</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {rec.targetEntity?.type === 'kb' && (
                      <button
                        onClick={() => onNavigateToKB?.()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <span>مستودع المعرفة</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {!rec.applied ? (
                      <button
                        onClick={() => handleApply(rec)}
                        disabled={applyingId === rec.id}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                          isCritical
                            ? 'bg-rose-600 hover:bg-rose-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{applyingId === rec.id ? 'جارٍ التطبيق...' : rec.actionLabel}</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="px-3 py-1.5 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-semibold flex items-center gap-1 cursor-default"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>مطبقة وموثقة</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
