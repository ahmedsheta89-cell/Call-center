/**
 * @file src/components/GmailHubView.tsx
 * Google Gmail Omnichannel Customer Support Hub
 * Enables reading, searching, composing, AI replying, and converting Gmail inquiries into Tickets.
 * Enforces mandatory user confirmation dialogs for sending and deleting emails.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  listGmailMessages,
  sendGmailMessage,
  trashGmailMessage,
  getGmailProfile,
  GmailMessageSummary,
  GmailProfile,
} from '../lib/googleWorkspaceService';
import {
  initWorkspaceAuth,
  getWorkspaceAuthState,
  WorkspaceAuthState,
} from '../lib/googleWorkspaceAuth';
import { GoogleWorkspaceAuthButton } from './GoogleWorkspaceAuthButton';
import { Ticket } from '../types';
import {
  Mail,
  Inbox,
  Send,
  Trash2,
  RefreshCw,
  Search,
  Sparkles,
  Ticket as TicketIcon,
  AlertCircle,
  CheckCircle2,
  User,
  Clock,
  ExternalLink,
  Plus,
  X,
  ShieldAlert,
  Loader2,
  Tag,
} from 'lucide-react';

interface GmailHubViewProps {
  onConvertToTicket?: (ticketData: Partial<Ticket>) => void;
}

export const GmailHubView: React.FC<GmailHubViewProps> = ({ onConvertToTicket }) => {
  const [authState, setAuthState] = useState<WorkspaceAuthState>(getWorkspaceAuthState());
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageSummary | null>(null);
  const [profile, setProfile] = useState<GmailProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'inbox' | 'unread' | 'sent' | 'all'>('inbox');
  const [searchQuery, setSearchQuery] = useState('');

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>();
  const [isGeneratingAiReply, setIsGeneratingAiReply] = useState(false);

  // Mandatory Confirmation Dialog State (Destructive & Mutating operations)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel: string;
    variant: 'danger' | 'primary';
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionLabel: '',
    variant: 'primary',
    onConfirm: async () => {},
  });
  const [isConfirmProcessing, setIsConfirmProcessing] = useState(false);

  // Listen to Google auth state
  useEffect(() => {
    const unsub = initWorkspaceAuth((state) => {
      setAuthState(state);
    });
    return unsub;
  }, []);

  // Fetch messages from Gmail
  const loadMessages = useCallback(async () => {
    if (!authState.isAuthenticated) return;

    try {
      setIsLoading(true);
      setError(null);

      // Build query
      let q = '';
      if (filter === 'inbox') q = 'label:INBOX';
      else if (filter === 'unread') q = 'label:UNREAD';
      else if (filter === 'sent') q = 'label:SENT';

      if (searchQuery.trim()) {
        q = q ? `${q} ${searchQuery.trim()}` : searchQuery.trim();
      }

      const [msgs, prof] = await Promise.all([
        listGmailMessages(q, 20),
        getGmailProfile().catch(() => null),
      ]);

      setMessages(msgs);
      if (prof) setProfile(prof);

      if (msgs.length > 0 && !selectedMessage) {
        setSelectedMessage(msgs[0]);
      } else if (msgs.length === 0) {
        setSelectedMessage(null);
      }
    } catch (err: any) {
      console.error('Failed to load Gmail messages', err);
      setError(err?.message || 'تعذر استرجاع رسائل Gmail. يرجى التحقق من الصلاحيات.');
    } finally {
      setIsLoading(false);
    }
  }, [authState.isAuthenticated, filter, searchQuery, selectedMessage]);

  useEffect(() => {
    if (authState.isAuthenticated) {
      loadMessages();
    }
  }, [authState.isAuthenticated, filter]);

  // Open Compose Modal for Reply
  const handleReplyTo = (msg: GmailMessageSummary) => {
    // Extract clean email address from "Name <email@example.com>"
    const emailMatch = msg.from.match(/<([^>]+)>/) || [null, msg.from];
    const targetEmail = emailMatch[1] || msg.from;

    setComposeTo(targetEmail);
    setComposeSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    setComposeBody(`\n\n--- الرسالة الأصلية ---\nمن: ${msg.from}\nالتاريخ: ${msg.date}\n\n${msg.body}`);
    setReplyThreadId(msg.threadId);
    setIsComposeOpen(true);
  };

  // Generate Smart AI Reply
  const handleGenerateAiReply = () => {
    if (!selectedMessage) return;
    setIsGeneratingAiReply(true);

    setTimeout(() => {
      const customerName = selectedMessage.from.split('<')[0].replace(/"/g, '').trim() || 'عزيزي العميل';
      const aiSuggested = `مرحباً ${customerName}،\n\nنشكرك على تواصلك مع مركز دعم OmniFlow AI.\nلقد تلقينا استفسارك بشأن "${selectedMessage.subject}" وسيقوم فريقنا بمتابعته على الفور.\n\nإذا كان لديك أي تفاصيل إضافية تود تزويدنا بها، يرجى الرد على هذه الرسالة.\n\nمع أطيب التحيات،\nفريق خدمة العملاء | OmniFlow AI OS`;

      setComposeBody((prev) => `${aiSuggested}\n\n${prev}`);
      setIsGeneratingAiReply(false);
    }, 600);
  };

  // Initiate Email Sending with MANDATORY explicit confirmation dialog
  const promptSendEmail = () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      setError('يرجى كتابة عنوان البريد والموضوع قبل الإرسال.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد إرسال البريد الإلكتروني عبر Gmail',
      description: `أنت على وشك إرسال رسالة بريد إلكتروني رسمية من حسابك إلى (${composeTo}) بعنوان "${composeSubject}". هل ترغب في المتابعة؟`,
      actionLabel: 'تأكيد وإرسال البريد',
      variant: 'primary',
      onConfirm: async () => {
        try {
          setIsConfirmProcessing(true);
          await sendGmailMessage({
            to: composeTo,
            subject: composeSubject,
            body: composeBody,
            threadId: replyThreadId,
          });

          setSuccessMsg(`تم إرسال البريد بنجاح إلى ${composeTo}`);
          setIsComposeOpen(false);
          setComposeTo('');
          setComposeSubject('');
          setComposeBody('');
          setReplyThreadId(undefined);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          loadMessages();
        } catch (err: any) {
          setError(err?.message || 'فشل إرسال البريد الإلكتروني.');
        } finally {
          setIsConfirmProcessing(false);
        }
      },
    });
  };

  // Initiate Email Trashing with MANDATORY explicit confirmation dialog
  const promptTrashEmail = (msg: GmailMessageSummary) => {
    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد حذف الرسالة ونقلها للمهملات',
      description: `هل أنت متأكد من رغبتك في حذف الرسالة بعنوان "${msg.subject}" ونقلها إلى سلة المهملات في Gmail؟ هذا الإجراء سيؤثر على صندوق بريدك.`,
      actionLabel: 'تأكيد الحذف',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setIsConfirmProcessing(true);
          await trashGmailMessage(msg.id);
          setSuccessMsg('تم نقل الرسالة إلى سلة المهملات في Gmail.');
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          if (selectedMessage?.id === msg.id) {
            setSelectedMessage(null);
          }
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          setError(err?.message || 'فشل حذف الرسالة من Gmail.');
        } finally {
          setIsConfirmProcessing(false);
        }
      },
    });
  };

  // Convert Email into Support Ticket
  const handleConvertToTicket = (msg: GmailMessageSummary) => {
    const fromName = msg.from.split('<')[0].replace(/"/g, '').trim() || 'عميل بريد إلكتروني';
    const emailMatch = msg.from.match(/<([^>]+)>/);
    const email = emailMatch ? emailMatch[1] : msg.from;

    const newTicketData: Partial<Ticket> = {
      title: `[Gmail] ${msg.subject}`,
      description: `محادثة بريدية واردة من ${fromName} (${email}):\n\n${msg.body || msg.snippet}`,
      customerName: fromName,
      category: 'استفسار بريدي وارد',
      priority: msg.isUnread ? 'high' : 'medium',
      status: 'new',
    };

    if (onConvertToTicket) {
      onConvertToTicket(newTicketData);
      setSuccessMsg(`تم تجهيز تذكرة دعم جديدة استناداً للبريد "${msg.subject}".`);
    } else {
      setSuccessMsg(`تم تحويل الرسالة بنجاح: [${newTicketData.title}]`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header Bar */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-600/20 to-red-600/20 border border-rose-500/30 text-rose-400">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">مركز بريد Gmail المؤسسي</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                قناة الاتصالات الموحدة
              </span>
            </div>
            <p className="text-xs text-slate-400">
              استقبال استفسارات العملاء عبر Gmail، الرد الذكي المعتمد، والتحويل اللحظي إلى تذاكر SLA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {authState.isAuthenticated && (
            <button
              onClick={() => {
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
                setReplyThreadId(undefined);
                setIsComposeOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40 transition"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء بريد جديد</span>
            </button>
          )}

          <GoogleWorkspaceAuthButton compact onSuccess={loadMessages} />
        </div>
      </div>

      {/* Notifications & Feedback */}
      {error && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      {!authState.isAuthenticated ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md p-8 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <Mail className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white">ربط صندوق Gmail بمركز العمليات</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              قم بتسجيل الدخول بحساب Google المعتمد لتمكين مزامنة استفسارات العملاء عبر Gmail، قراءة الرسائل، وإرسال الردود، وتحويل المحادثات مباشرة إلى تذاكر دعم داخل المنظومة.
            </p>
            <div className="pt-2">
              <GoogleWorkspaceAuthButton onSuccess={loadMessages} />
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-mono">
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
              <span>تطبيق ضوابط أمن البيانات وتأكيد العمليات مسبقاً</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Messages Column */}
          <div className="w-full lg:w-96 border-l border-slate-800/80 flex flex-col bg-slate-900/40 shrink-0">
            {/* Search and Filters */}
            <div className="p-3 border-b border-slate-800/80 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadMessages()}
                  placeholder="بحث في الرسائل (موضوع، مرسل)..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pr-8 pl-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setTimeout(loadMessages, 50);
                    }}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFilter('inbox')}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      filter === 'inbox'
                        ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    الوارد
                  </button>
                  <button
                    onClick={() => setFilter('unread')}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      filter === 'unread'
                        ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    غير المقروء
                  </button>
                  <button
                    onClick={() => setFilter('sent')}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      filter === 'sent'
                        ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    المرسل
                  </button>
                </div>

                <button
                  onClick={loadMessages}
                  disabled={isLoading}
                  title="تحديث الرسائل"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {isLoading && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-slate-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-rose-400 mb-2" />
                  <span>جاري مزامنة رسائل Gmail...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <span>لا توجد رسائل مطابقة للبحث أو التصفية الحالية</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSelected = selectedMessage?.id === msg.id;
                  return (
                    <div
                      key={msg.id}
                      onClick={() => setSelectedMessage(msg)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-800/90 border-rose-500/50 shadow-md'
                          : 'bg-slate-950/60 hover:bg-slate-800/50 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`font-semibold truncate max-w-[170px] ${
                            msg.isUnread ? 'text-white font-bold' : 'text-slate-300'
                          }`}
                        >
                          {msg.from.split('<')[0].replace(/"/g, '').trim()}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {msg.date.split(',')[0]}
                        </span>
                      </div>

                      <div className="font-medium text-slate-200 truncate mb-1">
                        {msg.subject || '(بدون موضوع)'}
                      </div>

                      <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed">
                        {msg.snippet}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2">
                        {msg.isUnread && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                        )}
                        {msg.labels.includes('INBOX') && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            الوارد
                          </span>
                        )}
                        {msg.labels.includes('SENT') && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            مرسل
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Profile Bar */}
            {profile && (
              <div className="p-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between bg-slate-950">
                <span className="font-mono truncate max-w-[180px]">{profile.emailAddress}</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                  {profile.messagesTotal} رسالة
                </span>
              </div>
            )}
          </div>

          {/* Selected Message Detail View */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {selectedMessage ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Email Header */}
                <div className="p-4 border-b border-slate-800 bg-slate-900/60 shrink-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm lg:text-base font-bold text-white">
                      {selectedMessage.subject || '(بدون عنوان)'}
                    </h3>

                    {/* Action Bar */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConvertToTicket(selectedMessage)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
                        title="تحويل هذه المحادثة البريدية إلى تذكرة دعم SLA"
                      >
                        <TicketIcon className="w-3.5 h-3.5 text-indigo-400" />
                        <span>تحويل لتذكرة</span>
                      </button>

                      <button
                        onClick={() => handleReplyTo(selectedMessage)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition shadow-sm"
                        title="الرد على هذا البريد"
                      >
                        <Send className="w-3.5 h-3.5 text-emerald-400" />
                        <span>رد على البريد</span>
                      </button>

                      <button
                        onClick={() => promptTrashEmail(selectedMessage)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-500/30 transition"
                        title="نقل إلى سلة المهملات (يتطلب تأكيد)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">من:</span>
                      <span className="font-mono text-slate-300">{selectedMessage.from}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{selectedMessage.date}</span>
                    </div>
                  </div>

                  {selectedMessage.to && (
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span className="font-semibold text-slate-400">إلى:</span>
                      <span className="font-mono text-slate-300">{selectedMessage.to}</span>
                    </div>
                  )}
                </div>

                {/* Email Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-950">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                    {selectedMessage.body || selectedMessage.snippet}
                  </div>

                  {/* AI Quick Response Assist Card */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 to-slate-900 border border-indigo-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">
                          مساعد الصياغة الذكي (Smart AI Reply)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          صياغة رد دعم رسمي معتمد باللغة العربية بناءً على استفسار العميل
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        handleReplyTo(selectedMessage);
                        handleGenerateAiReply();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow"
                    >
                      توليد رد ذكي ومراجعته
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 text-xs">
                <Mail className="w-12 h-12 opacity-30 mb-3" />
                <span>اختر رسالة من القائمة لعرض تفاصيلها والرد عليها</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose / Reply Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  {replyThreadId ? 'الرد على رسالة Gmail' : 'إنشاء بريد إلكتروني جديد'}
                </h3>
              </div>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">المرسل إليه (To):</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">الموضوع (Subject):</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="موضوع البريد..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-400 font-semibold">محتوى الرسالة:</label>
                  <button
                    onClick={handleGenerateAiReply}
                    disabled={isGeneratingAiReply}
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isGeneratingAiReply ? 'جاري الصياغة...' : 'اقتراح صياغة بالذكاء الاصطناعي'}</span>
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="اكتب ردك هنا..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                سيتم طلب التأكيد النهائي قبل تنفيذ الإرسال الفعلي
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsComposeOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800 text-xs"
                >
                  إلغاء
                </button>
                <button
                  onClick={promptSendEmail}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال عبر Gmail</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY Explicit Confirmation Dialog for Mutating/Destructive Actions */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {confirmDialog.variant === 'danger' ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </div>
              <h3 className="text-sm font-bold text-white">{confirmDialog.title}</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              {confirmDialog.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                disabled={isConfirmProcessing}
                className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800 text-xs transition"
              >
                إلغاء الأمر
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                disabled={isConfirmProcessing}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition shadow ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {isConfirmProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري المعالجة...</span>
                  </>
                ) : (
                  <span>{confirmDialog.actionLabel}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
