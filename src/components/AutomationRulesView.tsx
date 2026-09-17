/**
 * @file src/components/AutomationRulesView.tsx
 * Workflow Automation & Intelligent AI Routing Engine Management Console
 */

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  Plus,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Sparkles,
  ArrowRight,
  Filter,
  Layers,
  Activity,
  ShieldAlert,
  GitFork,
} from 'lucide-react';
import { VisualIVRFlowBuilder } from './VisualIVRFlowBuilder.tsx';

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; payload: Record<string, unknown> }>;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string;
}

export const AutomationRulesView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'rules' | 'ivr_flow' | 'simulator'>('rules');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(false);

  // New Rule Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [trigger, setTrigger] = useState('conversation_created');
  const [conditionField, setConditionField] = useState('customer.tier');
  const [conditionOperator, setConditionOperator] = useState('equals');
  const [conditionValue, setConditionValue] = useState('vip');
  const [actionType, setActionType] = useState('assign_team');
  const [actionPayloadKey, setActionPayloadKey] = useState('teamName');
  const [actionPayloadVal, setActionPayloadVal] = useState('فريق كبار العملاء VIP');
  const [creating, setCreating] = useState(false);

  // Simulator State
  const [simEventType, setSimEventType] = useState('conversation_created');
  const [simCustomerTier, setSimCustomerTier] = useState('vip');
  const [simChannel, setSimChannel] = useState('whatsapp');
  const [simSentiment, setSimSentiment] = useState('negative');
  const [simIntent, setSimIntent] = useState('complaint_delay');
  const [simSlaStatus, setSimSlaStatus] = useState('healthy');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  const fetchRules = () => {
    setLoading(true);
    fetch('/api/v1/automation/rules')
      .then((r) => r.json())
      .then((d) => d.success && setRules(d.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggleRule = async (id: string) => {
    await fetch(`/api/v1/automation/rules/${id}/toggle`, { method: 'PUT' });
    fetchRules();
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف قاعدة الأتمتة هذه؟')) return;
    await fetch(`/api/v1/automation/rules/${id}`, { method: 'DELETE' });
    fetchRules();
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch('/api/v1/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleName,
          trigger,
          conditions: [{ field: conditionField, operator: conditionOperator, value: conditionValue }],
          actions: [{ type: actionType, payload: { [actionPayloadKey]: actionPayloadVal } }],
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowAddModal(false);
        setRuleName('');
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleSimulateEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    const payload = {
      customer: { tier: simCustomerTier },
      conversation: { channel: simChannel, intent: simIntent },
      message: { sentiment: simSentiment },
      ticket: { slaStatus: simSlaStatus },
    };

    try {
      const res = await fetch('/api/v1/automation/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: simEventType, payload }),
      });
      const d = await res.json();
      if (d.success) {
        setSimResult(d.data);
        fetchRules(); // update execution counts
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  const triggerTranslations: Record<string, string> = {
    conversation_created: 'عند بدء محادثة جديدة',
    message_received: 'عند استلام رسالة واردة من العميل',
    sla_warning: 'عند اقتراب اختراق الـ SLA',
    ticket_created: 'عند إنشاء تذكرة دعم فني',
  };

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <span>محرك الأتمتة وقواعد التوجيه الذكي (Workflow Automation & AI Routing)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            بناء قواعد التوجيه القائمة على المهارات والشروط المعقدة والمشاعر، والأتمتة الفورية للتصعيد والردود
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء قاعدة أتمتة جديدة</span>
        </button>
      </div>

      {/* View Switcher Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'rules'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>قواعد الأتمتة والتوجيه المعتمدة ({rules.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('ivr_flow')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'ivr_flow'
              ? 'bg-gradient-to-r from-teal-500/20 to-indigo-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <GitFork className="w-4 h-4 text-teal-400" />
          <span>مصمم مسارات الرد الصوتي وشجرة IVR التفاعلية (Visual Flow Designer)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'simulator'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>محاكي تقييم قواعد الأتمتة (Rule Sandbox)</span>
        </button>
      </div>

      {/* View 1: Visual IVR Flow Builder */}
      {activeSubTab === 'ivr_flow' && <VisualIVRFlowBuilder />}

      {/* View 2: Rule Engine Interactive Simulator */}
      {activeSubTab === 'simulator' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Play className="w-4 h-4 text-emerald-400" />
            <span>محاكي تقييم قواعد الأتمتة اللحظي (Rule Engine Simulator)</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
            Realtime Rule Testing Sandbox
          </span>
        </div>

        <form onSubmit={handleSimulateEngine} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="text-slate-400 font-bold block mb-1">نوع الحدث (Event Trigger)</label>
              <select
                value={simEventType}
                onChange={(e) => setSimEventType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="conversation_created">بدء محادثة جديدة</option>
                <option value="message_received">استلام رسالة عميل</option>
                <option value="sla_warning">تحذير اقتراب اختراق SLA</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">فئة العميل (Customer Tier)</label>
              <select
                value={simCustomerTier}
                onChange={(e) => setSimCustomerTier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="vip">كبار العملاء (VIP)</option>
                <option value="priority">أولوية (Priority)</option>
                <option value="standard">عادي (Standard)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">القناة (Channel)</label>
              <select
                value={simChannel}
                onChange={(e) => setSimChannel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="webchat">Web Chat</option>
                <option value="voice">Voice Call</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">مشاعر الرسالة (AI Sentiment)</label>
              <select
                value={simSentiment}
                onChange={(e) => setSimSentiment(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="negative">سلبي / غاضب (Negative)</option>
                <option value="neutral">محايد (Neutral)</option>
                <option value="positive">إيجابي (Positive)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">حالة الـ SLA</label>
              <select
                value={simSlaStatus}
                onChange={(e) => setSimSlaStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="healthy">سليم (Healthy)</option>
                <option value="at_risk">معرض للخطر (At Risk)</option>
                <option value="breached">مخترق (Breached)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={simulating}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{simulating ? 'جارٍ اختبار القواعد...' : 'تشغيل محاكاة تقييم القواعد'}</span>
          </button>
        </form>

        {/* Simulator Results */}
        {simResult && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>نتائج محاكاة المحرك: تم فحص {simResult.rulesEvaluated} قاعدة أتمتة نشطة</span>
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                القواعد المتطابقة والمُنفذة: {simResult.rulesTriggeredCount}
              </span>
            </div>

            {simResult.matchedRules.length > 0 ? (
              <div className="space-y-2 pt-1">
                {simResult.matchedRules.map((mr: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>{mr.ruleName}</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">Matched & Dispatched</span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div>
                        الشروط المطابقة: <span className="font-mono text-indigo-300">{mr.matchedConditions.join(' AND ')}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="font-bold text-slate-300">الإجراءات المنفذة:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {mr.executedActions.map((act: any, aIdx: number) => (
                            <span
                              key={aIdx}
                              className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] border border-emerald-500/30"
                            >
                              {act.type} ({JSON.stringify(act.payload)})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">لم تتطابق أي من قواعد الأتمتة مع معطيات هذا الحدث التجريبي.</p>
            )}
          </div>
        )}
      </div>
      )}

      {/* 3. Automation Rules List Cards */}
      {activeSubTab === 'rules' && (
        <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">قواعد الأتمتة المعتمدة ({rules.length})</h3>
          <span className="text-xs text-slate-500 font-mono">
            {rules.filter((r) => r.isActive).length} قواعد مفعلة حالياً
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">جارٍ تحميل قواعد الأتمتة...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-slate-900 border rounded-2xl p-5 space-y-3 transition ${
                  rule.isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className={`w-4 h-4 ${rule.isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold text-white">{rule.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      المُشغّل (Trigger): {triggerTranslations[rule.trigger] || rule.trigger}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className="p-1 rounded-lg hover:bg-slate-800 transition"
                      title={rule.isActive ? 'تعطيل القاعدة' : 'تفعيل القاعدة'}
                    >
                      {rule.isActive ? (
                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-600" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                      title="حذف القاعدة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Conditions Block */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1 text-xs">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">الشروط (When):</div>
                  <div className="space-y-1 font-mono text-[11px] text-indigo-300">
                    {rule.conditions.map((cond, cIdx) => (
                      <div key={cIdx} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        <span>{cond.field} {cond.operator} "{cond.value}"</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions Block */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1 text-xs">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">الإجراءات الفورية (Then):</div>
                  <div className="space-y-1 font-mono text-[11px] text-emerald-400">
                    {rule.actions.map((act, aIdx) => (
                      <div key={aIdx} className="flex items-center gap-1.5 truncate">
                        <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{act.type} ➔ {JSON.stringify(act.payload)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Metrics */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>تم التنفيذ {rule.executionCount} مرة</span>
                  {rule.lastExecutedAt && (
                    <span>آخر تنفيذ: {new Date(rule.lastExecutedAt).toLocaleTimeString('ar-SA')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* 4. Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>إنشاء قاعدة أتمتة وتوجيه ذكي جديدة</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">اسم القاعدة</label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="مثال: تصعيد فوري لتذاكر انقطاع الخدمة..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">الحدث المُشغّل (Trigger Event)</label>
                <select
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="conversation_created">بدء محادثة جديدة</option>
                  <option value="message_received">استلام رسالة عميل</option>
                  <option value="sla_warning">اقتراب انتهاء وقت الـ SLA</option>
                  <option value="ticket_created">إنشاء تذكرة جديدة</option>
                </select>
              </div>

              {/* Condition Group */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">الشرط (Condition):</span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    value={conditionField}
                    onChange={(e) => setConditionField(e.target.value)}
                    placeholder="الحقل (مثال: customer.tier)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <select
                    value={conditionOperator}
                    onChange={(e) => setConditionOperator(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white"
                  >
                    <option value="equals">يساوي (equals)</option>
                    <option value="contains">يحتوي (contains)</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder="القيمة (مثال: vip)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Action Group */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">الإجراء الفوري (Action):</span>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white"
                  >
                    <option value="assign_team">تعيين فريق</option>
                    <option value="set_priority">تعديل الأولوية</option>
                    <option value="tag_conversation">إضافة وسم</option>
                    <option value="send_webhook">إرسال Webhook</option>
                  </select>
                  <input
                    type="text"
                    value={actionPayloadKey}
                    onChange={(e) => setActionPayloadKey(e.target.value)}
                    placeholder="المفتاح (key)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <input
                    type="text"
                    value={actionPayloadVal}
                    onChange={(e) => setActionPayloadVal(e.target.value)}
                    placeholder="القيمة (val)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
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
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{creating ? 'جارٍ الحفظ...' : 'حفظ وتفعيل القاعدة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
