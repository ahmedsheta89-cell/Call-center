/**
 * @file src/components/VisualIVRFlowBuilder.tsx
 * Visual Interactive IVR & Bot Flow Designer for Enterprise Contact Centers
 * Allows supervisors to design, test, simulate, and export call trees and chatbot flows
 */

import React, { useState } from 'react';
import {
  PhoneCall,
  GitFork,
  Bot,
  Zap,
  Play,
  RotateCcw,
  Volume2,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  Shield,
  Layers,
  Sparkles,
  Download,
  AlertTriangle,
  ArrowRight,
  Headphones,
  Sliders,
  Settings2,
} from 'lucide-react';

interface IVRNode {
  id: string;
  type: 'trigger' | 'dtmf_menu' | 'ai_intent' | 'diagnostic' | 'routing' | 'escalation';
  title: string;
  subtitle: string;
  audioPrompt: string;
  options?: Array<{ key: string; label: string; targetNodeId: string; color: string }>;
  config: Record<string, string | number | boolean>;
}

export const VisualIVRFlowBuilder: React.FC = () => {
  const [nodes, setNodes] = useState<IVRNode[]>([
    {
      id: 'node-start',
      type: 'trigger',
      title: '1. بوابة الاستقبال والترحيب الصوتي (Inbound Gate)',
      subtitle: 'استقبال المكالمة الواردة وتشغيل الرسالة الترحيبية وتحديد اللغة',
      audioPrompt: 'مرحباً بكم في خدمة عملاء أومني فلو. مكالمتك مسجلة لضمان جودة الخدمة. للغة العربية اضغط 1، for English press 2.',
      options: [
        { key: '1', label: 'العربية (Arabic)', targetNodeId: 'node-line-check', color: 'border-emerald-500 text-emerald-400' },
        { key: '2', label: 'English', targetNodeId: 'node-line-check', color: 'border-blue-500 text-blue-400' },
      ],
      config: { timeoutSec: 5, maxRetries: 2, recordAudio: true },
    },
    {
      id: 'node-line-check',
      type: 'diagnostic',
      title: '2. فحص الهوية والخط التلقائي (Auto-Diagnostics)',
      subtitle: 'الاستعلام عن رقم المتصل في Cloud SQL وفحص حالة كابينة الفايبر والراوتر',
      audioPrompt: 'جاري فحص كفاءة خطك الأرضي ومؤشرات جودة الخدمة لحظياً...',
      options: [
        { key: 'healthy', label: 'الخط سليم (Normal)', targetNodeId: 'node-menu', color: 'border-emerald-500 text-emerald-400' },
        { key: 'fault_detected', label: 'عطل كابينة / هبوط SNR', targetNodeId: 'node-escalation', color: 'border-rose-500 text-rose-400' },
      ],
      config: { queryCloudSql: true, checkFiberCabinet: true, checkPaymentDue: true },
    },
    {
      id: 'node-menu',
      type: 'dtmf_menu',
      title: '3. شجرة الخيارات والقائمة التفاعلية (IVR Menu Tree)',
      subtitle: 'توجيه العميل حسب نوع الخدمة المطلوبة بأزرار الهاتف أو نطق الصوت',
      audioPrompt: 'للدعم الفني ومشاكل الإنترنت اضغط 1. للمدفوعات والشحن ومحافظ إنستاباي اضغط 2. لكبار العملاء VIP اضغط 3.',
      options: [
        { key: '1', label: '[1] دعم فني وإنترنت VDSL', targetNodeId: 'node-ai-intent', color: 'border-indigo-500 text-indigo-400' },
        { key: '2', label: '[2] فواتير وإنستاباي ومحافظ', targetNodeId: 'node-routing-billing', color: 'border-teal-500 text-teal-400' },
        { key: '3', label: '[3] كبار العملاء VIP المباشر', targetNodeId: 'node-routing-vip', color: 'border-amber-500 text-amber-400' },
      ],
      config: { enableASR: true, bargeInAllowed: true },
    },
    {
      id: 'node-ai-intent',
      type: 'ai_intent',
      title: '4. محرك تحليل المشاعر واللهجة (AI NLU & Sentiment)',
      subtitle: 'كشف الغضب، اللهجة (مصرية / خليجية)، واستخراج الكلمات المفتاحية الحساسة',
      audioPrompt: 'من فضلك اشرح مشكلتك باختصار لنقوم بتوجيهك إلى أفضل مهندس متخصص.',
      options: [
        { key: 'angry', label: 'غاضب أو متوتر (High Urgency)', targetNodeId: 'node-escalation', color: 'border-rose-500 text-rose-400' },
        { key: 'standard', label: 'استفسار اعتيادي (Normal)', targetNodeId: 'node-routing-tech', color: 'border-indigo-500 text-indigo-400' },
      ],
      config: { model: 'Gemini-Flash-NLU', detectDialect: true, fallbackToDTMF: true },
    },
    {
      id: 'node-routing-tech',
      type: 'routing',
      title: '5. التوجيه القائم على المهارات (Skill-Based Routing)',
      subtitle: 'تحويل العميل إلى طابور الدعم الفني وتعيين الوكيل الأكثر كفاءة في شبكات الفايبر',
      audioPrompt: 'جاري تحويلك الآن لأحد مهندسي الدعم الفني المتاحين. متوسط وقت الانتظار أقل من دقيقة.',
      config: { targetQueue: 'Tier-2 Technical Support', minAgentSkillLevel: 4, enableWhisperNotes: true },
    },
    {
      id: 'node-routing-billing',
      type: 'routing',
      title: '5ب. التوجيه المالي ومحافظ الدفع (FinTech Routing)',
      subtitle: 'توجيه العميل لفريق الفواتير واسترجاع المبالغ وبوابات إنستاباي وفودافون كاش',
      audioPrompt: 'جاري تحويلك إلى مسؤولي المدفوعات والعمليات المالية.',
      config: { targetQueue: 'Billing & Fintech Ops', priorityScore: 85 },
    },
    {
      id: 'node-routing-vip',
      type: 'routing',
      title: '5ج. مسار كبار العملاء المباشر (VIP Fast-Lane)',
      subtitle: 'تخطي قوائم الانتظار كلياً وتوجيه المكالمة فوراً لمدير الحساب المخصص',
      audioPrompt: 'أهلاً بحضرتك في الخدمة الماسية، جاري ربطك بمدير حسابك الشخصي فوراً.',
      config: { targetQueue: 'VIP Dedicated Desk', zeroQueueWait: true, smsAlertToSupervisor: true },
    },
    {
      id: 'node-escalation',
      type: 'escalation',
      title: '6. حارس اتفاقيات الخدمة والتصعيد (SLA Fallback & Barge)',
      subtitle: 'إشعار المشرف الفوري بالتدخل أو جدولة إعادة الاتصال التلقائي (Callback)',
      audioPrompt: 'نعتذر عن أي تأخير، تم إرسال إشعار فوري لمدير المناوبة للمتابعة معك.',
      config: { maxWaitSeconds: 30, enableAutoCallback: true, alertSupervisor: true },
    },
  ]);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-start');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simActiveNodeId, setSimActiveNodeId] = useState<string>('node-start');
  const [simStepHistory, setSimStepHistory] = useState<string[]>(['node-start']);
  const [simLog, setSimLog] = useState<string[]>(['بدء جلسة اختبار المسار الصوتي IVR...']);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const simActiveNode = nodes.find((n) => n.id === simActiveNodeId) || nodes[0];

  // Play synthetic tone / Speech preview
  const playAudioPreview = (text: string) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Audio context tone fallback
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch {}
    }
  };

  const startSimulation = () => {
    setIsSimulating(true);
    setSimActiveNodeId('node-start');
    setSimStepHistory(['node-start']);
    setSimLog(['[00:01] اتصال جديد وارد من العميل +201001234567...', `[00:02] تشغيل الرسالة: "${nodes[0].audioPrompt}"`]);
    playAudioPreview(nodes[0].audioPrompt);
  };

  const handleSimOptionSelect = (opt: { key: string; label: string; targetNodeId: string }) => {
    const nextNode = nodes.find((n) => n.id === opt.targetNodeId);
    if (!nextNode) return;

    setSimActiveNodeId(opt.targetNodeId);
    setSimStepHistory((prev) => [...prev, opt.targetNodeId]);
    setSimLog((prev) => [
      ...prev,
      `[العميل] اختار: ${opt.label}`,
      `[النظام] انتقال إلى العقدة: ${nextNode.title}`,
      `[الصوت]: "${nextNode.audioPrompt}"`,
    ]);
    playAudioPreview(nextNode.audioPrompt);
  };

  const resetSimulation = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSimulating(false);
    setSimActiveNodeId('node-start');
    setSimStepHistory(['node-start']);
    setSimLog([]);
  };

  const exportFlowJson = () => {
    const data = {
      flowName: 'Enterprise Omnichannel IVR & Bot Flow',
      version: '2.4.0',
      exportedAt: new Date().toISOString(),
      nodes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ivr-flow-blueprint-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 select-none" dir="rtl">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <GitFork className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>مصمم مسارات الرد الصوتي والشات بوت التفاعلي (Interactive IVR Flow Builder)</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                Visual Flow Active
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              تصميم وتخصيص مسار الاتصال الصوتي والدردشة الآلية، وقواعد فحص الخطوط والتحويل الذكي لكبار العملاء
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportFlowJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>تصدير المخطط (JSON)</span>
          </button>

          {!isSimulating ? (
            <button
              onClick={startSimulation}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>تشغيل محاكي المسار الصوتي (Simulate)</span>
            </button>
          ) : (
            <button
              onClick={resetSimulation}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إنهاء المحاكاة (Reset)</span>
            </button>
          )}
        </div>
      </div>

      {/* Simulator Active Bar */}
      {isSimulating && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <PhoneCall className="w-4 h-4 animate-pulse text-emerald-400" />
              <span>جلسة محاكاة تفاعلية نشطة: العقدة الحالية {simActiveNode.title}</span>
            </div>
            <p className="text-xs text-slate-300 italic">
              الرسالة الصوتية الحالية: &quot;{simActiveNode.audioPrompt}&quot;
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => playAudioPreview(simActiveNode.audioPrompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 rounded-lg text-xs border border-emerald-500/30 font-medium"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>إعادة الاستماع</span>
            </button>

            {simActiveNode.options?.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSimOptionSelect(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition bg-slate-900 hover:bg-slate-800 ${opt.color}`}
              >
                اضغط {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Builder Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Visual Node Flow Pipeline */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>مخطط مسار العمليات والعقد التفاعلية (Interactive Nodes Pipeline)</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                {nodes.length} عقد مبرمجة
              </span>
            </div>

            <div className="space-y-3">
              {nodes.map((node, index) => {
                const isSelected = selectedNodeId === node.id;
                const isSimActive = isSimulating && simActiveNodeId === node.id;
                const isSimPassed = isSimulating && simStepHistory.includes(node.id);

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                      isSimActive
                        ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-500'
                        : isSelected
                        ? 'bg-slate-800/80 border-amber-500/60 shadow-md ring-1 ring-amber-500/30'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                            isSimActive
                              ? 'bg-emerald-500 text-white animate-bounce'
                              : isSimPassed
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {index + 1}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{node.title}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                              {node.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{node.subtitle}</p>
                          <p className="text-[11px] text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800/60 mt-2 font-serif">
                            &quot;{node.audioPrompt}&quot;
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudioPreview(node.audioPrompt);
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="استماع للرسالة الصوتية"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      </button>
                    </div>

                    {/* Options / Branches */}
                    {node.options && node.options.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-semibold">المسارات المتفرعة:</span>
                        {node.options.map((opt) => (
                          <span
                            key={opt.key}
                            className={`text-[10px] px-2 py-0.5 rounded-full border bg-slate-900 ${opt.color} font-mono`}
                          >
                            {opt.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Col: Node Configuration & Simulation Logs */}
        <div className="space-y-4">
          {/* Selected Node Properties */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-amber-400" />
                <span>خصائص العقدة المحددة (Properties)</span>
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {selectedNode.id}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-semibold block mb-1">عنوان العقدة</label>
                <input
                  type="text"
                  value={selectedNode.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? { ...n, title: val } : n)));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold block mb-1">الرسالة الصوتية / نص الشات بوت</label>
                <textarea
                  rows={3}
                  value={selectedNode.audioPrompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? { ...n, audioPrompt: val } : n)));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 text-xs leading-relaxed"
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">إعدادات الأمان والتوجيه</span>
                <div className="space-y-1.5 text-[11px] text-slate-400 font-mono">
                  {Object.entries(selectedNode.config).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-slate-400">{k}:</span>
                      <span className="text-emerald-400">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Simulation Event Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span>سجل المحاكاة التفاعلي (Simulation Stream)</span>
              </h4>
              <span className="text-[10px] font-mono text-slate-400">Live</span>
            </div>

            <div className="h-44 overflow-y-auto space-y-1.5 bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-[11px]">
              {simLog.length === 0 ? (
                <p className="text-slate-500 italic">اضغط &quot;تشغيل محاكي المسار الصوتي&quot; لمتابعة حركة المكالمة خطوة بخطوة...</p>
              ) : (
                simLog.map((log, i) => (
                  <p key={i} className="text-slate-300 leading-snug">
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
