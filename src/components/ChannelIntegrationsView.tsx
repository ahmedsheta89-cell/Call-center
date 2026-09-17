/**
 * @file src/components/ChannelIntegrationsView.tsx
 * Omnichannel Integrations Hub & Official WhatsApp Cloud API Operations Console
 */

import React, { useState, useEffect } from 'react';
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  Phone,
  MessageSquare,
  Mail,
  Send,
  Sparkles,
  Zap,
  ShieldCheck,
  Globe,
  Radio,
  ExternalLink,
  Layers,
  Settings,
  Copy,
  Check,
  Key,
  RefreshCw,
} from 'lucide-react';

interface ChannelIntegration {
  id: string;
  type: string;
  name: string;
  badge: string;
  status: 'online' | 'degraded' | 'offline';
  accountInfo: Record<string, any>;
  metrics: Record<string, any>;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  header: string;
  body: string;
  footer: string;
  variables: string[];
}

export const ChannelIntegrationsView: React.FC = () => {
  const [channels, setChannels] = useState<ChannelIntegration[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Channel Configuration & Credential Modal State
  const [configChannel, setConfigChannel] = useState<ChannelIntegration | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  // Live Connection Testing State
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [connectionTestResults, setConnectionTestResults] = useState<Record<string, any>>({});
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);

  // Send Template Modal State
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [recipientPhone, setRecipientPhone] = useState('+966500123456');
  const [templateParams, setTemplateParams] = useState<string[]>(['أحمد الشهري', 'ORD-9820', 'قيد التوصيل']);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Inbound Webhook Simulator State
  const [simChannel, setSimChannel] = useState<'whatsapp' | 'webchat' | 'voice'>('whatsapp');
  const [simSenderName, setSimSenderName] = useState('فيصل العتيبي');
  const [simSenderPhone, setSimSenderPhone] = useState('+966551122334');
  const [simMessageText, setSimMessageText] = useState('السلام عليكم، واجهت مشكلة في تجديد الاشتراك وخصم المبلغ مرتين');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  const fetchChannels = () => {
    setLoading(true);
    fetch('/api/v1/integrations/channels')
      .then((r) => r.json())
      .then((d) => d.success && setChannels(d.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchChannels();

    fetch('/api/v1/integrations/whatsapp/templates')
      .then((r) => r.json())
      .then((d) => d.success && setTemplates(d.data));
  }, []);

  const handleOpenConfig = (channel: ChannelIntegration) => {
    setConfigChannel(channel);
    setConfigFeedback(null);
    const initial: Record<string, string> = {};
    Object.entries(channel.accountInfo || {}).forEach(([k, v]) => {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        initial[k] = String(v);
      }
    });
    setConfigForm(initial);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configChannel) return;
    setSavingConfig(true);
    setConfigFeedback(null);

    try {
      const res = await fetch(`/api/v1/integrations/channels/${configChannel.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      const d = await res.json();
      if (d.success) {
        setConfigFeedback('تم حفظ بيانات الاعتماد والربط بنجاح!');
        fetchChannels();
        setTimeout(() => {
          setConfigChannel(null);
          setConfigFeedback(null);
        }, 1200);
      }
    } catch {
      setConfigFeedback('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async (channelId: string) => {
    setTestingChannelId(channelId);
    try {
      const res = await fetch(`/api/v1/integrations/channels/${channelId}/test-connection`, {
        method: 'POST',
      });
      const d = await res.json();
      if (d.success) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [channelId]: d.data,
        }));
      }
    } catch {
      // test failed
    } finally {
      setTestingChannelId(null);
    }
  };

  const handleCopyWebhook = (channelId: string, url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedWebhookId(channelId);
    setTimeout(() => setCopiedWebhookId(null), 2500);
  };

  const handleSendTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSendingTemplate(true);
    setSendSuccess(null);

    try {
      const res = await fetch('/api/v1/integrations/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          recipientPhone,
          parameters: templateParams,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setSendSuccess(`تم إرسال النموذج بنجاح عبر Meta Cloud API بمعرّف رسالة: ${d.data.messageId}`);
        setTimeout(() => {
          setSelectedTemplate(null);
          setSendSuccess(null);
        }, 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingTemplate(false);
    }
  };

  const handleSimulateInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    try {
      const res = await fetch('/api/v1/integrations/simulate-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: simChannel,
          senderName: simSenderName,
          senderPhone: simSenderPhone,
          messageText: simMessageText,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setSimResult(d.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* 1. Header */}
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Share2 className="w-5 h-5 text-emerald-400" />
          <span>تكامل القنوات الرسمية وبوابة Meta WhatsApp Cloud API</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          مراقبة حالة القنوات المتعددة، وإدارة قوالب رسائل واتساب المعتمدة ومحاكي استقبال الرسائل اللحظي
        </p>
      </div>

      {/* 2. Channel Health Matrix Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {channels.map((chan) => {
          const testRes = connectionTestResults[chan.id];
          const isTesting = testingChannelId === chan.id;
          const webhookUrl = chan.metrics.webhookUrl || `/api/v1/integrations/${chan.type}/webhook`;
          const isCopied = copiedWebhookId === chan.id;

          return (
            <div
              key={chan.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white truncate">{chan.type.toUpperCase()}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                    {chan.status === 'online'
                      ? 'متصل ونشط'
                      : chan.status === 'degraded'
                      ? 'أداء متذبذب'
                      : 'غير متصل'}
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-medium truncate">{chan.name}</div>
                <div className="text-[11px] text-emerald-400 mt-0.5">{chan.badge}</div>
              </div>

              {/* Webhook endpoint copy */}
              <div className="bg-slate-950/80 rounded-lg p-1.5 border border-slate-800/80 flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-400 truncate dir-ltr">{webhookUrl}</span>
                <button
                  onClick={() => handleCopyWebhook(chan.id, webhookUrl)}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition shrink-0"
                  title="نسخ رابط الـ Webhook الكامل للاستخدام في بوابة المزود"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              {/* Actions: Configure & Test */}
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => handleOpenConfig(chan)}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1 transition"
                  title="تعديل مفاتيح الربط والاعتماد"
                >
                  <Settings className="w-3 h-3 text-indigo-400" />
                  <span>تهيئة</span>
                </button>

                <button
                  onClick={() => handleTestConnection(chan.id)}
                  disabled={isTesting}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1 transition disabled:opacity-50"
                  title="اختبار الاتصال الفعلي وفحص الـ Latency"
                >
                  <RefreshCw className={`w-3 h-3 text-emerald-400 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'فحص...' : 'فحص'}</span>
                </button>
              </div>

              <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                <span>الاستجابة: {testRes ? `${testRes.latencyMs}ms` : `${chan.metrics.latencyMs}ms`}</span>
                {chan.metrics.deliveryRatePercent && (
                  <span className="text-emerald-400">{chan.metrics.deliveryRatePercent}% تسليم</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. WhatsApp Business Cloud API Dossier */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">منصة واتساب للأعمال (Official Meta Cloud API)</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  توثيق العلامة الخضراء المعتمدة
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                رقم الهاتف الرسمي: <span className="font-mono text-slate-300">+966 55 012 3456</span> • معرّف الحساب: <span className="font-mono text-slate-300">WABA-902184920194</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
              سقف الإرسال: Tier 2 (10,000 محادثة / يوم)
            </span>
          </div>
        </div>

        {/* WhatsApp Approved Message Templates Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>نماذج رسائل واتساب المعتمدة من Meta (Approved Templates for 24h Window Bypass):</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{templates.length} نماذج معتمدة</span>
          </div>

          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="p-3">اسم النموذج (Template Name)</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">نص الرسالة والوسائط</th>
                  <th className="p-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {templates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-slate-900/40 transition">
                    <td className="p-3 font-bold text-white">{tpl.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                        {tpl.category}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">
                        {tpl.status}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-xs text-slate-300 max-w-md truncate">
                      {tpl.header && <span className="font-bold block text-white">{tpl.header}</span>}
                      {tpl.body}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setSelectedTemplate(tpl)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 mx-auto transition"
                      >
                        <Send className="w-3 h-3" />
                        <span>إرسال تجريبي</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Inbound Webhook & Channel Simulator */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>محاكي استقبال رسائل القنوات اللحظي (Inbound Omnichannel Webhook Simulator)</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
            Realtime AI Ingestion Pipeline
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          يمكّنك هذا المحاكي من محاكاة إرسال رسالة من عميل حقيقي عبر WhatsApp أو الويب شات أو الهاتف، لمشاهدة دورة المعالجة
          الكاملة: التعرف على هوية العميل، تصنيف النوايا والمشاعر بالذكاء الاصطناعي، احتساب وقت الـ SLA، والتوزيع اللحظي.
        </p>

        <form onSubmit={handleSimulateInbound} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">القناة الواردة</label>
              <select
                value={simChannel}
                onChange={(e) => setSimChannel(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="whatsapp">WhatsApp Business API</option>
                <option value="webchat">Live Web Chat</option>
                <option value="voice">Inbound Voice Call</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">اسم العميل المرسل</label>
              <input
                type="text"
                required
                value={simSenderName}
                onChange={(e) => setSimSenderName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">رقم هاتف العميل</label>
              <input
                type="text"
                required
                value={simSenderPhone}
                onChange={(e) => setSimSenderPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">نص الرسالة الواردة</label>
            <textarea
              required
              rows={2}
              value={simMessageText}
              onChange={(e) => setSimMessageText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={simulating}
            className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{simulating ? 'جارٍ استقبال ومعالجة الرسالة...' : 'محاكاة إرسال الرسالة الآن'}</span>
          </button>
        </form>

        {/* Simulation Output */}
        {simResult && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم استقبال الرسالة وتمريرها بنجاح عبر الـ Ingestion Engine:</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                الحالة: Delivered & Processed
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">العميل المستهدف:</span>
                <span className="font-bold text-white">{simResult.customer.name}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">المشاعر المكتشفة (AI):</span>
                <span className="font-bold text-rose-400">{simResult.conversation.sentiment}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">النية التشغيلية (Intent):</span>
                <span className="font-bold text-amber-300">{simResult.conversation.intent}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">استحقاق الـ SLA:</span>
                <span className="font-bold text-emerald-400">15 دقيقة (Healthy)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Send Template Interactive Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>إرسال نموذج واتساب رسمي ({selectedTemplate.name})</span>
              </h3>
              <button onClick={() => setSelectedTemplate(null)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTemplate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">رقم هاتف المستلم (مع رمز الدولة)</label>
                <input
                  type="text"
                  required
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Template Preview */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] text-emerald-400 font-bold mb-1">معاينة نص الرسالة:</div>
                {selectedTemplate.header && <p className="text-xs font-bold text-white">{selectedTemplate.header}</p>}
                <p className="text-xs text-slate-200">{selectedTemplate.body}</p>
                {selectedTemplate.footer && <p className="text-[10px] text-slate-500 mt-1">{selectedTemplate.footer}</p>}
              </div>

              {/* Template Dynamic Variables */}
              {selectedTemplate.variables.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300">المتغيرات الديناميكية (Dynamic Placeholders):</div>
                  {selectedTemplate.variables.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono w-24">({`{{${idx + 1}}}`}) {v}:</span>
                      <input
                        type="text"
                        value={templateParams[idx] || ''}
                        onChange={(e) => {
                          const updated = [...templateParams];
                          updated[idx] = e.target.value;
                          setTemplateParams(updated);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {sendSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30">
                  {sendSuccess}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={sendingTemplate}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingTemplate ? 'جارٍ الإرسال عبر Meta...' : 'إرسال الرسالة الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Channel Configuration & Credentials Modal */}
      {configChannel && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">إعدادات وبيانات اعتماد {configChannel.name}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    القناة: {configChannel.type.toUpperCase()} • {configChannel.badge}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setConfigChannel(null)}
                className="text-slate-400 hover:text-white text-xs p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3.5">
              <p className="text-xs text-slate-400 leading-relaxed">
                قم بتحديث معرّفات المزود ومفاتيح الـ Webhook ورموز الـ API الخاصة بهذه القناة. يتم التحقق والتخزين المشفر
                مباشرة على الخادم.
              </p>

              <div className="space-y-3 max-h-[50vh] overflow-y-auto px-1 py-1">
                {Object.keys(configForm).map((fieldKey) => (
                  <div key={fieldKey}>
                    <label className="text-xs font-mono font-medium text-slate-300 block mb-1">
                      {fieldKey}
                    </label>
                    <input
                      type={fieldKey.toLowerCase().includes('token') || fieldKey.toLowerCase().includes('secret') ? 'password' : 'text'}
                      value={configForm[fieldKey] || ''}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          [fieldKey]: e.target.value,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                ))}
              </div>

              {configFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{configFeedback}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setConfigChannel(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{savingConfig ? 'جارٍ الحفظ والتحقق...' : 'حفظ الاعتمادات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
