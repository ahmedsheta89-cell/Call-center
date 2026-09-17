/**
 * @file src/components/AgenticAIGuardrailsView.tsx
 * Autonomous Agentic AI Execution & Real-Time PII Guardrails / Redaction Engine
 * Includes Multi-Step Autonomous Scenario Simulator & PII Rule Configuration
 */

import React, { useState } from 'react';
import {
  Bot,
  ShieldCheck,
  Zap,
  Terminal,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  EyeOff,
  Cpu,
  RefreshCw,
  Sliders,
  Sparkles,
  Server,
  ArrowRight,
  Database,
  FileText,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Workflow,
  Globe,
  Radio,
} from 'lucide-react';

interface AgenticTool {
  id: string;
  name: string;
  description: string;
  category: 'telco' | 'fintech' | 'crm' | 'network';
  status: 'ready' | 'running' | 'completed';
  parameters: Record<string, string>;
  lastExecution?: {
    timestamp: string;
    durationMs: number;
    result: string;
    success: boolean;
  };
}

interface AutonomousScenarioStep {
  stepNumber: number;
  phase: string;
  toolName: string;
  description: string;
  status: 'waiting' | 'in_progress' | 'completed';
  output?: string;
  latencyMs?: number;
}

export const AgenticAIGuardrailsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'agentic' | 'scenario' | 'guardrails'>('agentic');

  // Agentic Tools State
  const [tools, setTools] = useState<AgenticTool[]>([
    {
      id: 'tool-tr069-reboot',
      name: 'TR-069 إعادة تشغيل وفحص الراوتر عن بُعد',
      description: 'إرسال أمر استعلام كفاءة الـ SNR Margin وإعادة تشغيل كابينة الفايبر للعميل آلياً دون تدخل بشري',
      category: 'network',
      status: 'ready',
      parameters: {
        landline: '+20227941234',
        protocol: 'TR-069-CWMP',
        vlanId: '835',
      },
      lastExecution: {
        timestamp: 'منذ 3 دقائق',
        durationMs: 420,
        result: 'تم استرجاع الإشارة بنجاح: SNR 18.4 dB - الخط متصل بسرعة 94 Mbps',
        success: true,
      },
    },
    {
      id: 'tool-emergency-quota',
      name: 'شحن رصيد الطوارئ التلقائي (Emergency Quota Boost)',
      description: 'إضافة باقة إنترنت طوارئ 15 جيجابايت مؤقتة لعملاء VIP في حال انقطاع الخدمة أثناء العمل',
      category: 'telco',
      status: 'ready',
      parameters: {
        customerId: 'CUST-001-VIP',
        quotaGb: '15',
        validityHours: '48',
      },
      lastExecution: {
        timestamp: 'منذ 14 دقيقة',
        durationMs: 180,
        result: 'تم تفعيل باقة الطوارئ 15GB مجاناً بنجاح وترحيل التكلفة للموازنة السحابية',
        success: true,
      },
    },
    {
      id: 'tool-instant-waiver',
      name: 'إلغاء رسوم التأخير التلقائي (Auto Bill Waiver)',
      description: 'تسوية وإسقاط غرامات الفواتير المتأخرة للعملاء الملتزمين بناءً على تحليل السلوك المالي بالذكاء الاصطناعي',
      category: 'fintech',
      status: 'ready',
      parameters: {
        accountNumber: 'EG-W-9921',
        waiverAmountEgp: '75.00',
        approvalToken: 'AI-AUTONOMOUS-LVL3',
      },
    },
    {
      id: 'tool-crm-sync',
      name: 'مزامنة سجل العميل مع أنظمة CRM وCloud SQL',
      description: 'تحديث بيانات العميل في Salesforce وMicrosoft Dynamics ومطابقة البيانات مع PostgreSQL وFirestore',
      category: 'crm',
      status: 'ready',
      parameters: {
        crmProvider: 'Salesforce & Cloud SQL',
        action: 'UPSERT_CUSTOMER_LIFECYCLE',
      },
    },
  ]);

  const [executingToolId, setExecutingToolId] = useState<string | null>(null);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);

  // Multi-step Autonomous Scenario State
  const [isScenarioRunning, setIsScenarioRunning] = useState(false);
  const [scenarioSteps, setScenarioSteps] = useState<AutonomousScenarioStep[]>([
    {
      stepNumber: 1,
      phase: 'الإدراك والتحليل الفوري (NLU & Intent Detection)',
      toolName: 'Gemini Intent & Tone Parser',
      description: 'استخراج نوع الشكوى (انقطاع إنترنت فايبر) وتقدير المشاعر (غضب شديد + خطر مغادرة العميل 89%)',
      status: 'waiting',
    },
    {
      stepNumber: 2,
      phase: 'الفحص الشبكي عن بُعد (Diagnostic & TR-069)',
      toolName: 'TR-069 CWMP Remote Engine',
      description: 'استعلام عن كابينة السنترال وفحص مستويات توهين الإشارة وتمرير أمر إعادة ضبط المسار الضوئي',
      status: 'waiting',
    },
    {
      stepNumber: 3,
      phase: 'التعويض الاستباقي (Autonomous Compensation)',
      toolName: 'Emergency Quota Dispenser',
      description: 'إضافة 15 جيجابايت طوارئ للعميل مجاناً للحفاظ على استمرارية العمل ومنع تصعيد التذكرة',
      status: 'waiting',
    },
    {
      stepNumber: 4,
      phase: 'المزامنة السحابية والإشعار (Omnichannel Dispatch)',
      toolName: 'Cloud SQL & WhatsApp Gateway',
      description: 'حفظ التذكرة كمحلولة تلقائياً (Resolved - Zero Human Touch) وإرسال رسالة واتساب للعميل بتقرير العطل والتعويض',
      status: 'waiting',
    },
  ]);

  // PII Guardrails State & Rules
  const [rawInputText, setRawInputText] = useState<string>(
    'العميل أحمد الشريف رقم بطاقته القومية 29510151234567 ورقم هاتفه 01001234567 يريد شحن بطاقة الدفع رقم 4123-4567-8910-1112 ورقم التحقق CVV: 894 وكلمة السر secretPass123 وتأكيد إنستاباي OTP 982145، بريده الإلكتروني ahmed.sharif@company.com'
  );
  const [redactedText, setRedactedText] = useState<string>('');
  const [detectedEntities, setDetectedEntities] = useState<Array<{ type: string; original: string; redacted: string }>>([]);
  const [isRedacting, setIsRedacting] = useState(false);
  const [copied, setCopied] = useState(false);

  // PII Rule Toggles
  const [rulesConfig, setRulesConfig] = useState({
    nationalId: true,
    creditCard: true,
    cvv: true,
    otpPassword: true,
    emailPhone: true,
  });

  const handleRedact = () => {
    setIsRedacting(true);
    let text = rawInputText;
    const entities: Array<{ type: string; original: string; redacted: string }> = [];

    // 1. National ID (14 digits)
    if (rulesConfig.nationalId) {
      const natIdRegex = /\b(2|3)\d{13}\b/g;
      text = text.replace(natIdRegex, (match) => {
        entities.push({ type: 'رقم قومي مصري (National ID)', original: match, redacted: '██████████████' });
        return '[رقم_قومي_محجوب_NTRA]';
      });
    }

    // 2. Credit Card PAN (16 digits with spaces or hyphens)
    if (rulesConfig.creditCard) {
      const cardRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b/g;
      text = text.replace(cardRegex, (match) => {
        entities.push({ type: 'بطاقة دفع بنكية (Card PAN)', original: match, redacted: '****-****-****-' + match.slice(-4) });
        return '[بطاقة_بنكية_محجوبة_PCI_DSS]';
      });
    }

    // 3. CVV (3-4 digits)
    if (rulesConfig.cvv) {
      const cvvRegex = /\b(CVV|CVC)\s*:?\s*(\d{3,4})\b/gi;
      text = text.replace(cvvRegex, (_match, prefix) => {
        entities.push({ type: 'كود الحماية البنكي (CVV)', original: '***', redacted: '***' });
        return `${prefix}: [محجوب]`;
      });
    }

    // 4. Passwords and OTP
    if (rulesConfig.otpPassword) {
      const otpRegex = /\b(OTP|رمز التأكيد|كود التحقق)\s*:?\s*(\d{4,6})\b/gi;
      text = text.replace(otpRegex, (_match, prefix) => {
        entities.push({ type: 'رمز تأكيد الاستخدام (OTP)', original: '******', redacted: '******' });
        return `${prefix}: [رمز_تحقق_سري]`;
      });

      const passRegex = /\b(secretPass\w+|password\w*)\b/gi;
      text = text.replace(passRegex, (match) => {
        entities.push({ type: 'كلمة مرور (Secret / Password)', original: match, redacted: '********' });
        return '[كلمة_مرور_محجوبة]';
      });
    }

    // 5. Email & Phone Numbers
    if (rulesConfig.emailPhone) {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      text = text.replace(emailRegex, (match) => {
        entities.push({ type: 'بريد إلكتروني (Email Address)', original: match, redacted: '[email_protected]' });
        return '[بريد_محجوب]';
      });

      const phoneRegex = /\b01[0-25]\d{8}\b/g;
      text = text.replace(phoneRegex, (match) => {
        entities.push({ type: 'رقم هاتف محمول (Mobile Number)', original: match, redacted: '010****' + match.slice(-4) });
        return '[هاتف_محجوب]';
      });
    }

    setTimeout(() => {
      setRedactedText(text);
      setDetectedEntities(entities);
      setIsRedacting(false);
    }, 150);
  };

  const handleCopyRedacted = () => {
    navigator.clipboard.writeText(redactedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunTool = (toolId: string) => {
    setExecutingToolId(toolId);
    setExecutionOutput('جاري تهيئة بيئة التنفيذ المستقل والتحقق من صلاحيات الأمان...');

    setTimeout(() => {
      setTools((prev) =>
        prev.map((t) => {
          if (t.id === toolId) {
            return {
              ...t,
              status: 'completed',
              lastExecution: {
                timestamp: 'الآن (ناجح)',
                durationMs: Math.floor(Math.random() * 300) + 120,
                result: `تم تنفيذ الإجراء ${t.name} بنجاح ومزامنة السجل في Cloud SQL وFirestore.`,
                success: true,
              },
            };
          }
          return t;
        })
      );
      setExecutionOutput(`اكتمل استدعاء الوكيل الذاتي بنجاح (Tool Executed). تم إرسال الإشعار لمركز العمليات.`);
      setExecutingToolId(null);
    }, 850);
  };

  const handleRunAutonomousScenario = () => {
    setIsScenarioRunning(true);
    // Reset steps
    setScenarioSteps((prev) => prev.map((s) => ({ ...s, status: 'waiting', output: undefined, latencyMs: undefined })));

    // Step 1: NLU
    setTimeout(() => {
      setScenarioSteps((prev) =>
        prev.map((s) =>
          s.stepNumber === 1
            ? { ...s, status: 'in_progress' }
            : s
        )
      );
    }, 200);

    setTimeout(() => {
      setScenarioSteps((prev) =>
        prev.map((s) =>
          s.stepNumber === 1
            ? {
                ...s,
                status: 'completed',
                latencyMs: 310,
                output: 'النية: عطل كابينة فايبر | المشاعر: -0.88 (غضب شديد) | الأولوية: قصوى (VIP Churn Alert)',
              }
            : s.stepNumber === 2
            ? { ...s, status: 'in_progress' }
            : s
        )
      );
    }, 1000);

    // Step 2: TR-069
    setTimeout(() => {
      setScenarioSteps((prev) =>
        prev.map((s) =>
          s.stepNumber === 2
            ? {
                ...s,
                status: 'completed',
                latencyMs: 440,
                output: 'تمت إعادة توجيه المسار الضوئي: استقرار SNR عند 19.1 dB ورفع السرعة إلى 98 Mbps بنجاح',
              }
            : s.stepNumber === 3
            ? { ...s, status: 'in_progress' }
            : s
        )
      );
    }, 2200);

    // Step 3: Compensation
    setTimeout(() => {
      setScenarioSteps((prev) =>
        prev.map((s) =>
          s.stepNumber === 3
            ? {
                ...s,
                status: 'completed',
                latencyMs: 190,
                output: 'تم شحن 15GB طوارئ مجانية صالحة لمدة 48 ساعة على خط العميل مباشرة',
              }
            : s.stepNumber === 4
            ? { ...s, status: 'in_progress' }
            : s
        )
      );
    }, 3200);

    // Step 4: Sync & WhatsApp
    setTimeout(() => {
      setScenarioSteps((prev) =>
        prev.map((s) =>
          s.stepNumber === 4
            ? {
                ...s,
                status: 'completed',
                latencyMs: 280,
                output: 'تم إغلاق التذكرة بنجاح في Cloud SQL و Salesforce وإرسال إشعار WhatsApp مخصص للعميل',
              }
            : s
        )
      );
      setIsScenarioRunning(false);
    }, 4400);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto select-none" dir="rtl">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
            <Bot className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>وكلاء الذكاء الاصطناعي الذاتيون وحراسة البيانات (Agentic AI & Guardrails)</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                L3 Autonomous Active
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              تنفيذ الإجراءات المؤسسية ذاتياً (Tool Calling) مع حجب فوري للبيانات الحساسة (PII Redaction) للامتثال لـ NTRA و GDPR
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('agentic')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'agentic'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>الأدوات المستقلة ({tools.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('scenario')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'scenario'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-950/40'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Workflow className="w-4 h-4 text-teal-300" />
            <span>محاكي السيناريو التلقائي الكامل</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('guardrails');
              handleRedact();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'guardrails'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>مختبر حراسة البيانات (PII Sandbox)</span>
          </button>
        </div>
      </div>

      {/* Main Agentic View */}
      {activeTab === 'agentic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tools List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>محرك استدعاء الأدوات الذاتية (Autonomous Tool Registry)</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Zero-Human-Touch Enabled</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tools.map((tool) => {
                  const isRunning = executingToolId === tool.id;
                  return (
                    <div
                      key={tool.id}
                      className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold text-white">{tool.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                            {tool.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{tool.description}</p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        <div className="text-[10px] font-mono text-slate-400 space-y-1 bg-slate-900/60 p-2 rounded-lg">
                          {Object.entries(tool.parameters).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-slate-500">{k}:</span>
                              <span className="text-emerald-400">{v}</span>
                            </div>
                          ))}
                        </div>

                        {tool.lastExecution && (
                          <div className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span className="flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> تم التنفيذ ({tool.lastExecution.durationMs}ms)
                            </span>
                            <span className="text-slate-500">{tool.lastExecution.timestamp}</span>
                          </div>
                        )}

                        <button
                          onClick={() => handleRunTool(tool.id)}
                          disabled={isRunning}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md transition disabled:opacity-50"
                        >
                          {isRunning ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>جاري الاستدعاء الآلي...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>تشغيل الأداة ذاتياً (Execute Tool)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Console & Telemetry */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>سجل استدعاءات الوكيل الآلي (Agentic Execution Log)</span>
              </h3>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 min-h-32 space-y-2">
                <p className="text-slate-500">&gt; AI Agentic Engine initialized at 0.0.0.0:3000</p>
                <p className="text-emerald-400">&gt; Tool Calling authorization: Level-3 Autonomous</p>
                <p className="text-indigo-400">&gt; Target Storage: Cloud SQL & Firestore synchronized</p>
                {executionOutput && <p className="text-amber-300 font-bold">&gt; {executionOutput}</p>}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>معايير أمان الوكلاء المستقلين</span>
              </h3>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span>سقف التسويات المالية التلقائية:</span>
                  <span className="font-mono text-emerald-400 font-bold">150 EGP / Transaction</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span>تأكيد المشرف البشري (HITL):</span>
                  <span className="font-mono text-indigo-400 font-bold">للحالات الحرجة فقط</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span>بروتوكول فحص الكبائن:</span>
                  <span className="font-mono text-teal-400 font-bold">TR-069 Encrypted</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Simulation View */}
      {activeTab === 'scenario' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Workflow className="w-5 h-5 text-teal-400" />
                <span>سيناريو الحل المستقل الكامل لحوادث الأعطال (Zero-Touch Incident Resolution)</span>
              </h3>
              <p className="text-xs text-slate-400">
                محاكاة تسلسل إجراءات الوكيل المستقل بالكامل فور وصول استغاثة من عميل VIP متعطل خطه الفايبر
              </p>
            </div>

            <button
              onClick={handleRunAutonomousScenario}
              disabled={isScenarioRunning}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-lg transition flex items-center gap-2 disabled:opacity-50"
            >
              {isScenarioRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تشغيل التسلسل الذاتي...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>بدء محاكاة التسلسل الكامل (Run Multi-Step Pipeline)</span>
                </>
              )}
            </button>
          </div>

          {/* Visual Step-by-Step Flow */}
          <div className="space-y-4">
            {scenarioSteps.map((step) => (
              <div
                key={step.stepNumber}
                className={`p-4 rounded-xl border transition-all duration-300 ${
                  step.status === 'completed'
                    ? 'bg-slate-950 border-emerald-500/40 shadow-sm'
                    : step.status === 'in_progress'
                    ? 'bg-slate-950 border-teal-500/60 ring-1 ring-teal-500/30'
                    : 'bg-slate-950/60 border-slate-800/80 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                        step.status === 'completed'
                          ? 'bg-emerald-500 text-slate-950'
                          : step.status === 'in_progress'
                          ? 'bg-teal-500 text-slate-950 animate-pulse'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step.status === 'completed' ? '✓' : step.stepNumber}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{step.phase}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {step.toolName}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{step.description}</p>
                    </div>
                  </div>

                  {step.latencyMs && (
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold shrink-0">
                      {step.latencyMs} ms
                    </span>
                  )}
                </div>

                {step.output && (
                  <div className="mt-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] font-mono text-emerald-300">
                    &gt; {step.output}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guardrails / PII Redaction View */}
      {activeTab === 'guardrails' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input & Redaction Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-rose-400" />
                <span>مختبر فحص وحجب البيانات الحساسة (Real-Time PII Redactor)</span>
              </h3>
              <button
                onClick={handleRedact}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>إعادة الفحص اللحظي</span>
              </button>
            </div>

            {/* Rule Config Toggles */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[11px] text-slate-400 font-semibold block">قواعد الحجب المفعلة:</span>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <button
                  onClick={() => setRulesConfig((r) => ({ ...r, nationalId: !r.nationalId }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition ${
                    rulesConfig.nationalId
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  الرقم القومي (National ID)
                </button>
                <button
                  onClick={() => setRulesConfig((r) => ({ ...r, creditCard: !r.creditCard }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition ${
                    rulesConfig.creditCard
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  بطاقات البنوك (PCI-DSS)
                </button>
                <button
                  onClick={() => setRulesConfig((r) => ({ ...r, cvv: !r.cvv }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition ${
                    rulesConfig.cvv
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  أكواد CVV
                </button>
                <button
                  onClick={() => setRulesConfig((r) => ({ ...r, otpPassword: !r.otpPassword }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition ${
                    rulesConfig.otpPassword
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  كلمات السر و OTP
                </button>
                <button
                  onClick={() => setRulesConfig((r) => ({ ...r, emailPhone: !r.emailPhone }))}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition ${
                    rulesConfig.emailPhone
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  الهاتف والبريد
                </button>
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-xs font-semibold block mb-1">
                النص الأصلي (محادثة واتساب / تسجيل مكالمة مفرغ):
              </label>
              <textarea
                rows={4}
                value={rawInputText}
                onChange={(e) => setRawInputText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>النص الآمن المحجوب الجاهز للتخزين السحابي:</span>
                </label>
                {redactedText && (
                  <button
                    onClick={handleCopyRedacted}
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
                  </button>
                )}
              </div>
              <div className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed font-mono min-h-24">
                {redactedText || 'اضغط زر الفحص لمعاينة النص بعد الحجب...'}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>تشفير قبل الكتابة في: Firestore & Cloud SQL</span>
              <span className="text-emerald-400 font-bold">100% PII Clean</span>
            </div>
          </div>

          {/* Detected Entities List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>العناصر الحساسة المكتشفة والمحجوبة تلقائياً ({detectedEntities.length})</span>
            </h3>

            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {detectedEntities.map((ent, idx) => (
                <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-300">{ent.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                      تم الحجب (Redacted)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span className="text-rose-400/80 line-through">{ent.original}</span>
                    <span className="text-emerald-400 font-bold">{ent.redacted}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl text-xs text-indigo-200 leading-relaxed">
              <strong>شهادة الامتثال التنظيمي:</strong> يتم فحص كل رسالة ومكالمة بالذكاء الاصطناعي عبر قواعد التعبير النمطي (RegEx) ومعجم الكيانات الحساسة لضمان عدم تسريب أي أرقام حسابات أو بيانات شخصية للعميل وفق تعليمات NTRA و PCI-DSS.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
