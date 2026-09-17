/**
 * @file src/components/LiveOpsDashboard.tsx
 * Real-time Contact Center Command Center & Floor Operations Dashboard
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  PhoneCall,
  MessageSquare,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ShieldAlert,
  Headphones,
  Eye,
  Radio,
  Sparkles,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { LiveMetrics, Agent, Ticket, Conversation, SmartRecommendation } from '../types.ts';

interface LiveOpsDashboardProps {
  metrics: LiveMetrics;
  agents: Agent[];
  tickets: Ticket[];
  conversations: Conversation[];
  onSelectConversation: (convId: string) => void;
  onOpenSoftphone: () => void;
  onNavigateToRecommendations?: () => void;
  userRole: string;
}

export const LiveOpsDashboard: React.FC<LiveOpsDashboardProps> = ({
  metrics,
  agents,
  tickets,
  conversations,
  onSelectConversation,
  onOpenSoftphone,
  onNavigateToRecommendations,
  userRole,
}) => {
  const atRiskTickets = tickets.filter((t) => t.slaStatus === 'at_risk' || t.slaStatus === 'warning');
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const fetchRecs = () => {
    fetch('/api/v1/recommendations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRecommendations(d.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchRecs();
  }, []);

  const handleApplyRec = async (recId: string) => {
    setApplyingId(recId);
    try {
      const res = await fetch(`/api/v1/recommendations/${recId}/apply`, {
        method: 'POST',
      });
      const d = await res.json();
      if (d.success) {
        fetchRecs();
      }
    } catch {
      // ignore
    } finally {
      setApplyingId(null);
    }
  };

  const pendingRecs = recommendations.filter((r) => !r.applied).slice(0, 3);

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-65px)]">
      {/* Top Banner: AI Supervisor Live Floor Alert */}
      <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-amber-200">
                تنبيه ذكاء اصطناعي تشغيلي (AI Supervisor Active Watch)
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 font-mono">
                مباشر
              </span>
            </div>
            <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
              تم رصد ارتفاع طفيف في استفسارات باقات التجوال الدولي خلال الساعة الماضية (+35%). تم تحديث مقترحات الـ AI Copilot تلقائياً بروابط توثيق باقة الخليج لتقليص زمن معالجة المكالمات (AHT).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSoftphone}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition"
          >
            مراقبة المكالمات النشطة
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">المحادثات النشطة</span>
            <MessageSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{metrics.activeConversations}</div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <TrendingUp className="w-3 h-3" /> عبر 5 قنوات
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">المكالمات الجارية</span>
            <PhoneCall className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{metrics.activeCalls}</div>
          <div className="text-[11px] text-amber-400 mt-1 flex items-center gap-1 font-medium">
            <Radio className="w-3 h-3 animate-pulse" /> SIP / VoIP متصل
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">قائمة الانتظار (Queue)</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{metrics.waitingQueue}</div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">متوسط الانتظار: 24 ثانية</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">خطر تجاوز الـ SLA</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{metrics.slaAtRiskCount}</div>
          <div className="text-[11px] text-rose-400 mt-1 font-medium">حالة تحتاج تدخلاً عاجلاً</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">الوكلاء المتصلون</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics.agentsOnline} <span className="text-sm text-slate-400 font-normal">/ {agents.length}</span>
          </div>
          <div className="text-[11px] text-indigo-400 mt-1 font-mono">{metrics.agentsBusy} منشغلون بمكالمات/شات</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">نسبة الجودة والـ CSAT</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-teal-400 font-mono">4.85 / 5</div>
          <div className="text-[11px] text-teal-400 mt-1 font-mono">FCR: 87.4%</div>
        </div>
      </div>

      {/* AI Smart Executive Recommendations Widget */}
      {pendingRecs.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-amber-950/40 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-white">توصيات تشغيلية عاجلة من محرك الذكاء الاصطناعي (AI Recommendations)</span>
            </div>
            {onNavigateToRecommendations && (
              <button
                onClick={onNavigateToRecommendations}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition"
              >
                <span>عرض جميع التوصيات</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {pendingRecs.map((rec) => {
              const isCritical = rec.priority === 'critical';
              return (
                <div
                  key={rec.id}
                  className={`p-3 rounded-xl bg-slate-950/80 border flex flex-col justify-between gap-2.5 transition ${
                    isCritical ? 'border-rose-500/40' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase font-mono ${
                          isCritical
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {isCritical ? 'أولوية قصوى' : 'أولوية عالية'}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold truncate max-w-[130px]">
                        {rec.impact}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-100">{rec.title}</h4>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {rec.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end">
                    <button
                      onClick={() => handleApplyRec(rec.id)}
                      disabled={applyingId === rec.id}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm ${
                        isCritical
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      <span>{applyingId === rec.id ? 'جارٍ التطبيق...' : rec.actionLabel}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real-time Agent Floor Status Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Headphones className="w-4 h-4 text-emerald-400" />
              <span>خريطة الوكلاء وحالة الاتصال اللحظية (Live Floor Matrix)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              متابعة مباشرة لـ 10 وكلاء عبر 3 فرق تخصصية مع مؤشرات الحمل والاتصال
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> متاح
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> مشغول
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> استراحة
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" /> غير متصل
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {agents.map((agt) => {
            const statusBg =
              agt.status === 'online'
                ? 'border-emerald-500/40 bg-emerald-950/20'
                : agt.status === 'busy'
                ? 'border-amber-500/40 bg-amber-950/20'
                : agt.status === 'break'
                ? 'border-blue-500/40 bg-blue-950/20'
                : 'border-slate-800 bg-slate-950/40';

            const dotColor =
              agt.status === 'online'
                ? 'bg-emerald-400'
                : agt.status === 'busy'
                ? 'bg-amber-400 animate-ping'
                : agt.status === 'break'
                ? 'bg-blue-400'
                : 'bg-slate-600';

            return (
              <div
                key={agt.id}
                className={`p-3.5 rounded-xl border ${statusBg} flex flex-col justify-between transition-all hover:border-slate-600`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-white truncate">{agt.fullName}</span>
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-300">
                      <span className={`w-2 h-2 rounded-full ${dotColor} inline-block`} />
                      {agt.status === 'online'
                        ? 'متاح'
                        : agt.status === 'busy'
                        ? 'مشغول'
                        : agt.status === 'break'
                        ? 'استراحة'
                        : 'غير متصل'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mb-2 truncate">
                    {agt.teamName || 'خدمة العملاء'}
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {agt.skills.slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>الحمل: {agt.currentActiveChats} / {agt.maxConcurrency}</span>
                  {userRole === 'Supervisor' && (
                    <button
                      onClick={onOpenSoftphone}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="مراقبة أو همس للموظف (Whisper/Listen)"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Section: SLA Alerts & Live High Priority Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA At Risk Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>تنبيهات اتفاقية مستوى الخدمة الحالية (SLA Breaches & Warnings)</span>
            </h3>
            <span className="text-xs font-mono text-rose-400">{atRiskTickets.length} حالات حرجة</span>
          </div>

          <div className="space-y-2.5">
            {atRiskTickets.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-rose-400 font-bold">#{t.ticketNumber}</span>
                    <span className="text-xs font-semibold text-white">{t.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    العميل: {t.customerName} | الموظف: {t.assignedAgentName || 'بانتظار الإسناد'}
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    متبقي 12 دقيقة
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Open Conversations Stream */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>أحدث المحادثات الواردة متعددة القنوات</span>
            </h3>
            <span className="text-xs text-slate-400">تحديث لحظي</span>
          </div>

          <div className="space-y-2.5">
            {conversations.slice(0, 4).map((c) => (
              <div
                key={c.id}
                onClick={() => onSelectConversation(c.id)}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                      {c.channel === 'whatsapp'
                        ? 'واتساب'
                        : c.channel === 'webchat'
                        ? 'محادثة ويب'
                        : c.channel === 'voice'
                        ? 'اتصال صوتي'
                        : c.channel === 'email'
                        ? 'بريد'
                        : 'رسالة SMS'}
                    </span>
                    <span className="text-xs font-semibold text-white">{c.customerName}</span>
                    {c.customerTier === 'vip' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                        VIP
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 truncate max-w-sm">
                    {c.latestMessageSnippet}
                  </p>
                </div>
                <div className="text-left">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                      c.priority === 'urgent'
                        ? 'bg-rose-500/20 text-rose-400'
                        : c.priority === 'high'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {c.priority === 'urgent'
                      ? 'حرجة'
                      : c.priority === 'high'
                      ? 'عالية'
                      : c.priority === 'medium'
                      ? 'متوسطة'
                      : 'عادية'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
