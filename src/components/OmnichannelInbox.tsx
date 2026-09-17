/**
 * @file src/components/OmnichannelInbox.tsx
 * Omnichannel Unified Inbox with Integrated AI Copilot & Customer 360 Mini-View
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  User,
  Shield,
  Clock,
  CheckCheck,
  FileText,
  AlertCircle,
  Tag,
  Phone,
  Bookmark,
  ChevronLeft,
  Search,
  BookOpen,
  Zap,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { Conversation, Message, Customer, ChannelType } from '../types.ts';
import { DiagnosticsAndRegionalModal } from './DiagnosticsAndRegionalModal.tsx';

interface MacroItem {
  id: string;
  shortcut: string;
  title: string;
  category: string;
  text: string;
  actions?: {
    setStatus?: string;
    setPriority?: string;
    escalate?: boolean;
    assignTo?: string;
  };
}

interface OmnichannelInboxProps {
  conversations: Conversation[];
  selectedConvId?: string;
  onSelectConversation: (id: string) => void;
  onSendMessage: (convId: string, body: string, isInternalNote: boolean) => Promise<void>;
  zeroCostMode: boolean;
}

export const OmnichannelInbox: React.FC<OmnichannelInboxProps> = ({
  conversations,
  selectedConvId,
  onSelectConversation,
  onSendMessage,
  zeroCostMode,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Quick Macros & Canned Responses state
  const [macros, setMacros] = useState<MacroItem[]>([]);
  const [showMacrosModal, setShowMacrosModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [executingMacroId, setExecutingMacroId] = useState<string | null>(null);
  const [macroSuccess, setMacroSuccess] = useState<string | null>(null);

  // AI Copilot state
  const [copilotSuggestion, setCopilotSuggestion] = useState<{
    reply: string;
    confidence: number;
    citation?: string;
    nextAction?: string;
  } | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const activeConv = conversations.find((c) => c.id === selectedConvId) || conversations[0];

  // Fetch macros on mount
  useEffect(() => {
    fetch('/api/v1/macros')
      .then((r) => r.json())
      .then((d) => d.success && setMacros(d.data))
      .catch(() => {});
  }, []);

  const handleInsertMacro = (m: MacroItem) => {
    setInputMessage(m.text);
    setShowMacrosModal(false);
  };

  const handleExecuteMacro = async (m: MacroItem) => {
    if (!activeConv) return;
    setExecutingMacroId(m.id);
    try {
      const res = await fetch(`/api/v1/macros/${m.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id }),
      });
      const d = await res.json();
      if (d.success) {
        setMessages((prev) => [...prev, d.data.message]);
        setMacroSuccess(`تم تطبيق ماكرو (${m.title}) بنجاح وتحديث حالة المحادثة!`);
        setTimeout(() => {
          setMacroSuccess(null);
          setShowMacrosModal(false);
        }, 1200);
      }
    } catch {
      // ignore
    } finally {
      setExecutingMacroId(null);
    }
  };

  // Fetch messages and customer 360 when conversation changes
  useEffect(() => {
    if (!activeConv) return;
    setLoadingMessages(true);
    setCopilotSuggestion(null);

    // Fetch messages
    fetch(`/api/v1/conversations/${activeConv.id}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMessages(data.data);
          // Trigger Copilot on the latest inbound message
          const inbound = [...data.data].reverse().find((m: Message) => m.direction === 'inbound');
          if (inbound) {
            triggerCopilot(inbound.body);
          }
        }
      })
      .finally(() => setLoadingMessages(false));

    // Fetch customer profile
    fetch(`/api/v1/customers/${activeConv.customerId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setCustomer(data.data);
      });
  }, [activeConv?.id]);

  const triggerCopilot = (text: string) => {
    setCopilotLoading(true);
    fetch('/api/v1/ai/copilot/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerMessage: text,
        forceLocal: zeroCostMode,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          const structured = res.data.structuredOutput || {};
          const citation = res.data.citations?.[0]?.title;
          setCopilotSuggestion({
            reply: structured.suggestedReply || res.data.content,
            confidence: structured.confidence || 0.94,
            citation: citation || 'قواعد الخدمة المعتمدة',
            nextAction: structured.nextBestAction,
          });
        }
      })
      .catch((e) => console.error('Copilot fetch error:', e))
      .finally(() => setCopilotLoading(false));
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || !activeConv) return;
    const body = inputMessage;
    const isNote = isInternalNote;
    setInputMessage('');
    await onSendMessage(activeConv.id, body, isNote);

    // Optimistically push message
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        conversationId: activeConv.id,
        channel: activeConv.channel,
        direction: isNote ? 'internal_note' : 'outbound',
        type: 'text',
        body,
        sender: { id: 'usr-current', type: 'agent', name: 'سارة أحمد' },
        status: 'delivered',
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const filteredConversations = conversations.filter((c) => {
    if (channelFilter === 'all') return true;
    return c.channel === channelFilter;
  });

  return (
    <div className="h-[calc(100vh-65px)] flex overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. Left List: Conversations Index */}
      <div className="w-80 border-l border-slate-800 bg-slate-900/90 flex flex-col">
        {/* Channel Filter Pills */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>القنوات النشطة</span>
            <span className="font-mono">{filteredConversations.length} محادثة</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'whatsapp', label: 'واتساب' },
              { id: 'webchat', label: 'المحادثة' },
              { id: 'voice', label: 'الهاتف' },
              { id: 'instagram', label: 'إنستغرام' },
            ].map((chn) => (
              <button
                key={chn.id}
                onClick={() => setChannelFilter(chn.id)}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition ${
                  channelFilter === chn.id
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {chn.label}
              </button>
            ))}
          </div>
        </div>

        {/* List of Conversations */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredConversations.map((c) => {
            const isSelected = c.id === activeConv?.id;
            const channelNames: Record<string, string> = {
              whatsapp: 'واتساب',
              webchat: 'دردشة الويب',
              voice: 'هاتف صوتي',
              instagram: 'إنستغرام',
              email: 'بريد',
            };
            const priorityNames: Record<string, string> = {
              urgent: 'عاجل جداً',
              high: 'أولوية عالية',
              medium: 'متوسطة',
              low: 'عادية',
            };
            return (
              <div
                key={c.id}
                onClick={() => onSelectConversation(c.id)}
                className={`p-3.5 cursor-pointer transition ${
                  isSelected ? 'bg-slate-800 border-r-2 border-r-emerald-500' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate">{c.customerName}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700/50">
                    {channelNames[c.channel] || c.channel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mb-1.5">{c.subject || c.latestMessageSnippet}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span
                    className={`px-1.5 py-0.5 rounded font-sans text-[10px] ${
                      c.priority === 'urgent' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {priorityNames[c.priority] || c.priority}
                  </span>
                  <span>{new Date(c.lastMessageAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Center Column: Active Conversation Messages & Reply Box */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {activeConv ? (
          <>
            {/* Conversation Header */}
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">{activeConv.customerName}</h2>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {activeConv.channel === 'whatsapp'
                      ? 'واتساب للأعمال'
                      : activeConv.channel === 'webchat'
                      ? 'محادثة الويب الفورية'
                      : activeConv.channel === 'voice'
                      ? 'مكالمة هاتفية'
                      : activeConv.channel}
                  </span>
                  {activeConv.customerTier === 'vip' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                      حساب عميل مميز (VIP)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-slate-300">
                    استحقاق الـ SLA: {new Date(activeConv.slaDueAt || '').toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span>•</span>
                  <span>الموضوع: {activeConv.subject}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  الحالة:{' '}
                  {activeConv.status === 'open'
                    ? 'مفتوحة'
                    : activeConv.status === 'pending'
                    ? 'قيد المعالجة'
                    : activeConv.status === 'resolved'
                    ? 'تم الحل'
                    : 'مغلقة'}
                </span>
              </div>
            </div>

            {/* AI Next-Best-Action (NBA) Live Recommendation Banner */}
            <div className="px-4 py-2.5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-300">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <span className="font-bold whitespace-nowrap">توصية الإجراء التالي الأفضل (Next-Best-Action):</span>
                <span className="text-slate-200">
                  {customer?.customerTier === 'vip'
                    ? 'عميل VIP: أولوية ترقية راوتر Wi-Fi 6 مع خصم استبقاء 20% لتفادي الإلغاء.'
                    : 'يُوصى بالتحقق من جودة الإشارة وإرسال كود الفحص الذاتي لتسريع الحل.'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setInputMessage(
                      customer?.customerTier === 'vip'
                        ? 'سعادة العميل المميز، تقديراً لولائكم يسعدنا تقديم فحص فني فوري مع ترقية مجانية للراوتر وخصم 20% على اشتراككم القادم.'
                        : 'عزيزي العميل، تم إرسال رابط الفحص الفوري لجهازكم عبر رسالة نصية لتسريع استعادة جودة الخدمة مباشرة.'
                    );
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition shadow-sm"
                >
                  إدراج التوصية في الرد
                </button>
              </div>
            </div>

            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingMessages ? (
                <div className="text-center text-xs text-slate-500 py-10">جارٍ تحميل سجل الرسائل...</div>
              ) : (
                messages.map((m) => {
                  if (m.direction === 'internal_note') {
                    return (
                      <div
                        key={m.id}
                        className="mx-auto max-w-xl p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs"
                      >
                        <div className="flex items-center justify-between font-bold mb-1 text-[11px]">
                          <span className="flex items-center gap-1 text-amber-400">
                            <Bookmark className="w-3.5 h-3.5" /> ملاحظة داخلية (فريق العمل فقط)
                          </span>
                          <span className="font-mono text-[10px] text-amber-400/80">
                            {new Date(m.createdAt).toLocaleTimeString('ar-SA')}
                          </span>
                        </div>
                        <p className="leading-relaxed">{m.body}</p>
                      </div>
                    );
                  }

                  const isOutbound = m.direction === 'outbound';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isOutbound ? 'items-start' : 'items-end'}`}
                    >
                      <div className="text-[10px] text-slate-500 mb-1 font-mono">
                        {isOutbound ? m.sender.name || 'وكيل الخدمة' : activeConv.customerName}
                      </div>
                      <div
                        className={`max-w-lg p-3 rounded-2xl text-xs leading-relaxed ${
                          isOutbound
                            ? 'bg-emerald-600 text-white rounded-br-sm'
                            : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700/60'
                        }`}
                      >
                        {m.body}
                        <div
                          className={`text-[9px] mt-1 font-mono text-left flex items-center justify-end gap-1 ${
                            isOutbound ? 'text-emerald-200' : 'text-slate-400'
                          }`}
                        >
                          <span>{new Date(m.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                          {isOutbound && <CheckCheck className="w-3 h-3 text-emerald-200" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Reply Box */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/70 space-y-2">
              <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsInternalNote(false)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      !isInternalNote
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    رد للعميل ({activeConv.channel})
                  </button>
                  <button
                    onClick={() => setIsInternalNote(true)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      isInternalNote
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ملاحظة داخلية خاصة
                  </button>
                </div>

                {/* Canned Responses & Quick Macros Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                  <button
                    onClick={() => setShowDiagnosticsModal(true)}
                    className="px-2.5 py-1 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 border border-teal-500/40 flex items-center gap-1 transition font-bold shrink-0"
                    title="فحص جودة خط العميل (VDSL/FTTH)، تفعيل شريحة eSIM، أو إنشاء كود سداد إنستاباي/كاش"
                  >
                    <Activity className="w-3 h-3 text-teal-400" />
                    <span>فحص فني / eSIM / دفع (⚡)</span>
                  </button>

                  <button
                    onClick={() => setShowMacrosModal(true)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 flex items-center gap-1 transition font-bold shrink-0"
                    title="فتح مكتبة قوالب الماكرو والأتمتة السريعة للوكلاء"
                  >
                    <Zap className="w-3 h-3 text-indigo-400" />
                    <span>قوالب الماكرو (⚡)</span>
                  </button>

                  <span className="text-slate-500 font-medium">ردود سريعة:</span>
                  <button
                    onClick={() => setInputMessage('أهلاً بك، يسعدني خدمتك اليوم في مدار. كيف يمكنني مساعدتك؟')}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    ترحيب (/welcome)
                  </button>
                  <button
                    onClick={() => setInputMessage('نعتذر بشدة عن الإزعاج، سيتم تفعيل التعويض الفوري بقيمة الفاتورة وإعادة ضبط الخدمة.')}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    اعتذار وتعويض (/apology)
                  </button>
                  <button
                    onClick={() => setInputMessage('تم التحقق من بيانات طلبكم، وجارٍ متابعة التحديثات مع الفريق المختص فوراً.')}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    متابعة الطلب
                  </button>
                  <button
                    onClick={() => setInputMessage('شكراً لتواصلك معنا، يسعدنا دائماً تقديم أفضل تجربة لكم ونتمنى لك يوماً سعيداً!')}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    إنهاء المحادثة (/close)
                  </button>
                </div>
              </div>

              {/* Macro Success Notification */}
              {macroSuccess && (
                <div className="mb-2 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{macroSuccess}</span>
                </div>
              )}

              {/* Macros & Canned Responses Modal */}
              {showMacrosModal && (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
                          <Zap className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">مكتبة قوالب الماكرو والردود الجاهزة</h3>
                          <p className="text-[11px] text-slate-400">
                            تطبيق ردود معتمدة مع أتمتة تصعيد الأولوية وتحديث حالة المحادثة
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowMacrosModal(false)}
                        className="text-slate-400 hover:text-white text-xs p-1"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                      {macros.length > 0 ? (
                        macros.map((m) => (
                          <div
                            key={m.id}
                            className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2 hover:border-slate-700 transition"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-white">{m.title}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                                  {m.shortcut}
                                </span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                {m.category}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 font-sans">
                              {m.text}
                            </p>

                            {m.actions && (
                              <div className="flex items-center gap-2 text-[10px] text-amber-400/90 font-medium">
                                <span>الإجراء الآلي:</span>
                                {m.actions.setStatus && (
                                  <span className="bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                    تغيير الحالة: {m.actions.setStatus}
                                  </span>
                                )}
                                {m.actions.setPriority && (
                                  <span className="bg-rose-950/40 border border-rose-500/30 text-rose-300 px-1.5 py-0.5 rounded">
                                    الأولوية: {m.actions.setPriority}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                onClick={() => handleInsertMacro(m)}
                                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                              >
                                إدراج في حقل الكتابة
                              </button>
                              <button
                                onClick={() => handleExecuteMacro(m)}
                                disabled={executingMacroId === m.id}
                                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                              >
                                <Zap className="w-3 h-3" />
                                <span>{executingMacroId === m.id ? 'جارٍ التنفيذ...' : 'تطبيق الماكرو والإرسال الآن'}</span>
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-xs text-slate-500">
                          لا توجد قوالب ماكرو مسجلة حالياً
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    isInternalNote
                      ? 'اكتب ملاحظة استشارية يراها زملاؤك والمشرف فقط...'
                      : `اكتب ردك المباشر للعميل عبر ${activeConv.channel}...`
                  }
                  className={`flex-1 rounded-xl p-3 text-xs text-white placeholder-slate-500 border focus:outline-none resize-none h-20 ${
                    isInternalNote
                      ? 'bg-amber-950/20 border-amber-500/40 focus:border-amber-400'
                      : 'bg-slate-950 border-slate-800 focus:border-emerald-500'
                  }`}
                />
                <button
                  onClick={handleSend}
                  className={`h-20 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition ${
                    isInternalNote
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>إرسال</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
            اختر محادثة من القائمة للبدء
          </div>
        )}
      </div>

      {/* 3. Right Column: AI Copilot & Customer 360 Mini-View */}
      <div className="w-80 border-r border-slate-800 bg-slate-900/90 flex flex-col p-4 space-y-4 overflow-y-auto">
        {/* AI Copilot Card */}
        <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white">AI Copilot الذكي</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
              {zeroCostMode ? 'Local NLP' : 'Gemini 2.5 Flash'}
            </span>
          </div>

          {copilotLoading ? (
            <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
              جارٍ تحليل المحادثة واستخراج التوصية...
            </div>
          ) : copilotSuggestion ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 leading-relaxed bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                {copilotSuggestion.reply}
              </div>

              {copilotSuggestion.citation && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>المرجع المعتمد: {copilotSuggestion.citation}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400 font-mono">
                  نسبة الثقة: {Math.round(copilotSuggestion.confidence * 100)}%
                </span>
                <button
                  onClick={() => setInputMessage(copilotSuggestion.reply)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition"
                >
                  استخدام الرد
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-3 text-center">
              بانتظار وصول رسائل جديدة لاقتراح الردود
            </div>
          )}
        </div>

        {/* Customer 360 Mini-View */}
        {customer && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-xs font-bold text-white">
              <User className="w-4 h-4 text-indigo-400" />
              <span>ملف العميل الموحد (Customer 360)</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>الاسم الكامل:</span>
                <span className="text-white font-bold">{customer.name}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>رقم الهاتف:</span>
                <span className="text-white font-mono">{customer.phone}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>فئة العميل:</span>
                <span
                  className={`font-bold font-sans text-xs ${
                    customer.customerTier === 'vip'
                      ? 'text-amber-400'
                      : customer.customerTier === 'priority'
                      ? 'text-cyan-400'
                      : 'text-slate-300'
                  }`}
                >
                  {customer.customerTier === 'vip'
                    ? 'عميل VIP مميز'
                    : customer.customerTier === 'priority'
                    ? 'أولوية خاصة'
                    : 'عميل قياسي'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>القيمة التاريخية (LTV):</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {customer.lifetimeValue.toLocaleString('ar-SA')} ريال
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>المدينة:</span>
                <span className="text-slate-200">
                  {((customer.customFields as any)?.city as string) || 'الرياض'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1">
              {customer.tags.map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Autonomous Diagnostics & Instant Wallets Modal */}
      <DiagnosticsAndRegionalModal
        isOpen={showDiagnosticsModal}
        onClose={() => setShowDiagnosticsModal(false)}
        customerPhone={customer?.phone || '01012345678'}
        onInsertMessage={(msg) => setInputMessage(msg)}
      />
    </div>
  );
};
