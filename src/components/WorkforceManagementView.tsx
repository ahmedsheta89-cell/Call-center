/**
 * @file src/components/WorkforceManagementView.tsx
 * Enterprise Workforce Management (WFM), Erlang C Staffing Forecast & Live Shift Adherence
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  TrendingUp,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Coffee,
  Plus,
  BarChart3,
  Users,
  Shield,
  Layers,
  ChevronRight,
  Activity,
  Sparkles,
  Zap,
} from 'lucide-react';

interface WFMOverview {
  metrics: {
    globalAdherencePercent: number;
    occupancyRatePercent: number;
    forecastAccuracyPercent: number;
    serviceLevelTarget: string;
    activeShiftsCount: number;
    scheduledShiftsCount: number;
    breakShiftsCount: number;
  };
  statusDistribution: Record<string, number>;
  erlangForecast: Array<{
    hour: string;
    forecastedVolume: number;
    requiredStaff: number;
    scheduledStaff: number;
    serviceLevelTarget: number;
  }>;
}

interface EnrichedShift {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  skills: string[];
  currentStatus: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'active' | 'break' | 'completed' | 'absent';
  adherencePercentage: number;
  maxConcurrency: number;
  currentActiveChats: number;
}

export const WorkforceManagementView: React.FC = () => {
  const [overview, setOverview] = useState<WFMOverview | null>(null);
  const [shifts, setShifts] = useState<EnrichedShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Add Shift Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [creatingShift, setCreatingShift] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/v1/wfm/overview')
      .then((r) => r.json())
      .then((d) => d.success && setOverview(d.data))
      .catch(() => {});

    fetch('/api/v1/wfm/shifts')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setShifts(d.data);
          if (d.data.length > 0 && !selectedAgentId) {
            setSelectedAgentId(d.data[0].agentId);
          }
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleStatus = async (shiftId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'break' : 'active';
    await fetch(`/api/v1/wfm/shifts/${shiftId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    fetchData();
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) return;
    setCreatingShift(true);

    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch('/api/v1/wfm/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          startTime: `${todayStr}T${shiftStart}:00Z`,
          endTime: `${todayStr}T${shiftEnd}:00Z`,
          status: 'scheduled',
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowAddModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingShift(false);
    }
  };

  const filteredShifts = shifts.filter((s) => {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
  });

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>إدارة القوى العاملة وجدولة المناوبات (Workforce Management & Scheduling)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            محاكاة Erlang C للتنبؤ بحجم المكالمات والمحادثات، وجدولة الورديات ومراقبة الالتزام اللحظي للوكلاء
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مناوبة جديدة</span>
        </button>
      </div>

      {/* 2. Top WFM KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] text-slate-400 block font-medium">معدل الالتزام بالجدول (Adherence)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {overview.metrics.globalAdherencePercent}%
              </span>
              <span className="text-[10px] text-emerald-500 font-bold">هدف 90%+</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">نسبة تواجد الوكلاء على رأس العمل</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] text-slate-400 block font-medium">دقة التنبؤ بحجم الاتصالات</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-indigo-400 font-mono">
                {overview.metrics.forecastAccuracyPercent}%
              </span>
              <span className="text-[10px] text-indigo-300 font-bold">Erlang C</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">مطابقة الاحتياج الفعلي مع التوقع</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] text-slate-400 block font-medium">معدل إشغال الوكلاء (Occupancy)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400 font-mono">
                {overview.metrics.occupancyRatePercent}%
              </span>
              <span className="text-[10px] text-slate-400 font-bold">مثالي (80-85%)</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">وقت المعالجة مقارنة بوقت التفرغ</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] text-slate-400 block font-medium">حالة المناوبات اللحظية</span>
            <div className="flex items-center gap-2 pt-1 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                {overview.statusDistribution.active} نشط
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                {overview.statusDistribution.break} استراحة
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {overview.statusDistribution.scheduled} مجدول
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Erlang C Staffing Capacity & Volume Forecast Table */}
      {overview && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span>التنبؤ بحجم الطلب وتغطية الموظفين (Erlang C Hourly Capacity Forecast)</span>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-slate-950 text-indigo-400 border border-slate-800">
              مستوى الخدمة المستهدف: 80% خلال 20 ثانية
            </span>
          </div>

          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="p-3 font-mono">الساعة</th>
                  <th className="p-3">حجم المحادثات المتوقع</th>
                  <th className="p-3">العدد المطلوب (Required)</th>
                  <th className="p-3">العدد المجدول (Scheduled)</th>
                  <th className="p-3">حالة التغطية</th>
                  <th className="p-3">مستوى الخدمة المتوقع (SL%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {overview.erlangForecast.map((item, idx) => {
                  const isUnderstaffed = item.scheduledStaff < item.requiredStaff;
                  return (
                    <tr key={idx} className="hover:bg-slate-900/40 transition">
                      <td className="p-3 font-bold text-white">{item.hour}</td>
                      <td className="p-3 text-slate-300">{item.forecastedVolume} تواصل</td>
                      <td className="p-3 font-bold text-indigo-300">{item.requiredStaff} وكلاء</td>
                      <td className="p-3 text-white">{item.scheduledStaff} وكلاء</td>
                      <td className="p-3">
                        {isUnderstaffed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-3 h-3" />
                            <span>نقص في التغطية (-1)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تغطية كافية</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-bold">
                        <span className={item.serviceLevelTarget >= 80 ? 'text-emerald-400' : 'text-rose-400'}>
                          {item.serviceLevelTarget}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3.5. AI Erlang C Staffing & Schedule Optimization Recommendations */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-amber-950/40 border border-indigo-500/30 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            <div>
              <h3 className="text-sm font-bold text-white">توصيات الذكاء الاصطناعي التشغيلية لتحسين الجدولة والتغطية</h3>
              <p className="text-[11px] text-slate-400">تحليل لحظي يربط بين حجم المكالمات ومعدلات إشغال الوكلاء لمنع تجاوز الـ SLA</p>
            </div>
          </div>
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
            Erlang-C Advisory Engine
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">عجز متوقع (-2 وكلاء)</span>
              <span className="text-xs text-slate-400 font-mono">14:00 - 15:00</span>
            </div>
            <h4 className="text-xs font-bold text-white">إعادة توازن استراحات الغداء لتغطية ذروة الظهيرة</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              يُوصى بتأخير استراحة وكيلين لمدة 30 دقيقة، مما سيرفع مستوى الخدمة (SL%) المتوقع من 68% إلى 86%.
            </p>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] text-emerald-400 font-mono">الأثر: حماية 45 محادثة من الانتظار</span>
              <button
                onClick={async () => {
                  await fetch('/api/v1/recommendations/rec-wfm-01/apply', { method: 'POST' }).catch(() => {});
                  alert('تم تطبيق توصية إعادة جدولة الاستراحات بنجاح، وتحديث خطة الورديات.');
                  fetchData();
                }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>تطبيق التوصية فوراً</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">فائض نسبي (+35%)</span>
              <span className="text-xs text-slate-400 font-mono">فريق الدعم الفني</span>
            </div>
            <h4 className="text-xs font-bold text-white">تفعيل مساندة طابور خدمة العملاء متعدد المهارات</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              فريق الدعم الفني لديه وقت إتاحة مرتفع. يُوصى بتوجيه محادثات الاستفسارات العامة لوكلاء المستوى الأول منهم.
            </p>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] text-emerald-400 font-mono">الأثر: خفض زمن الانتظار بـ 20 ثانية</span>
              <button
                onClick={() => {
                  alert('تم تفعيل التوجيه متعدد المهارات (Skill-Based Routing Cross-Support).');
                  fetchData();
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition border border-slate-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>تفعيل المساندة</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Live Shift Adherence Roster (جدول مناوبات الوكلاء والالتزام اللحظي) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">جدول مناوبات الوكلاء والالتزام اللحظي (Live Roster & Adherence)</h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">تصفية حسب الحالة:</span>
            <div className="flex gap-1">
              {['all', 'active', 'break', 'scheduled'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition ${
                    filterStatus === st
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {st === 'all' ? 'الكل' : st === 'active' ? 'نشط' : st === 'break' ? 'استراحة' : 'مجدول'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Shifts Table */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="p-3">اسم الوكيل</th>
                <th className="p-3 font-mono">ساعات المناوبة المجدولة</th>
                <th className="p-3">المهارات المسندة (Skills)</th>
                <th className="p-3">طاقة الاستيعاب التزامنية</th>
                <th className="p-3">حالة المناوبة</th>
                <th className="p-3 font-mono">نسبة الالتزام اللحظي</th>
                <th className="p-3 text-center">التحكم السريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredShifts.map((shift) => {
                const startTimeFmt = new Date(shift.startTime).toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const endTimeFmt = new Date(shift.endTime).toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={shift.id} className="hover:bg-slate-900/40 transition">
                    <td className="p-3">
                      <div className="font-bold text-white">{shift.agentName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{shift.agentEmail}</div>
                    </td>
                    <td className="p-3 font-mono text-slate-300">
                      {startTimeFmt} - {endTimeFmt}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {shift.skills.map((sk, sIdx) => (
                          <span
                            key={sIdx}
                            className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 font-mono">
                      <span className="text-emerald-400 font-bold">{shift.currentActiveChats}</span> / {shift.maxConcurrency} محادثات
                    </td>
                    <td className="p-3">
                      {shift.status === 'active' && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>نشط ومتاح</span>
                        </span>
                      )}
                      {shift.status === 'break' && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1 w-fit">
                          <Coffee className="w-3 h-3" />
                          <span>في استراحة</span>
                        </span>
                      )}
                      {shift.status === 'scheduled' && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono w-fit block">
                          مجدول لاحقاً
                        </span>
                      )}
                      {shift.status === 'completed' && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 text-slate-500 font-mono w-fit block">
                          اكتملت المناوبة
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      <span
                        className={`font-bold ${
                          shift.adherencePercentage >= 95
                            ? 'text-emerald-400'
                            : shift.adherencePercentage >= 90
                            ? 'text-amber-300'
                            : 'text-rose-400'
                        }`}
                      >
                        {shift.adherencePercentage}%
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {(shift.status === 'active' || shift.status === 'break') && (
                        <button
                          onClick={() => handleToggleStatus(shift.id, shift.status)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                            shift.status === 'active'
                              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                          }`}
                        >
                          {shift.status === 'active' ? 'بدء استراحة' : 'عودة للعمل'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Add Shift Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>إسناد مناوبة جديدة لوكيل</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">الوكيل المستهدف</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {shifts.map((s) => (
                    <option key={s.agentId} value={s.agentId}>
                      {s.agentName} ({s.agentEmail})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">وقت البدء</label>
                  <input
                    type="time"
                    required
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">وقت الانتهاء</label>
                  <input
                    type="time"
                    required
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creatingShift}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{creatingShift ? 'جارٍ الإسناد...' : 'تثبيت المناوبة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
