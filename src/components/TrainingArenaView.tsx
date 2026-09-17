/**
 * @file src/components/TrainingArenaView.tsx
 * Interactive AI Agent Coaching Arena & Roleplay Simulator
 * Supports Egyptian Market (Customer Retention & Egyptian Dialect),
 * Global BPO (English Tech Support & SLA), and Gulf VIP Enterprise.
 */

import React, { useState, useEffect } from 'react';
import {
  Award,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  RefreshCw,
  Trophy,
  Target,
  ShieldCheck,
  Globe,
  Bot,
  User,
  RotateCcw,
  Star,
  Flame,
} from 'lucide-react';

interface Scenario {
  id: string;
  title: string;
  persona: string;
  region: 'Egypt' | 'Gulf' | 'Global BPO';
  difficulty: 'مبتدئ' | 'متوسط' | 'متقدم / VIP';
  customerTone: string;
  objective: string;
  dialogue: { role: 'customer' | 'agent'; text: string }[];
}

interface EvaluationResult {
  scenarioTitle: string;
  overallScore: number;
  passed: boolean;
  metrics: {
    empathyScore: number;
    complianceScore: number;
    resolutionSpeedIndex: string;
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export const TrainingArenaView: React.FC = () => {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [agentInput, setAgentInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [history, setHistory] = useState<
    Array<{ scenarioTitle: string; score: number; passed: boolean; timestamp: string }>
  >([]);

  useEffect(() => {
    fetch('/api/v1/training/scenarios')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data.length > 0) {
          setScenarios(d.data);
          setSelectedScenarioId(d.data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const activeScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];

  const handleEvaluate = async () => {
    if (!agentInput.trim() || !activeScenario) return;
    setLoading(true);
    setEvaluation(null);

    try {
      const res = await fetch('/api/v1/training/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: activeScenario.id,
          agentReply: agentInput,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setEvaluation(d.data);
        setHistory((prev) => [
          {
            scenarioTitle: activeScenario.title,
            score: d.data.overallScore,
            passed: d.data.passed,
            timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          },
          ...prev,
        ]);
      }
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTemplate = (text: string) => {
    setAgentInput(text);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-emerald-950/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>أكاديمية التدريب والمحاكاة الذكية (AI Roleplay Arena)</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white">
              محاكي تدريب وتأهيل وكلاء خدمة العملاء والتعهيد (BPO)
            </h1>
            <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
              تدريب تفاعلي مجاني بالكامل يحاكي عملاء حقيقيين من السوق المصري (لهجة محلية واعتراضات على الفواتير)،
              والتعهيد الدولي (Global BPO باللغة الإنجليزية وفق معايير ITIL)، وكبار عملاء الخليج (VIP).
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl text-center">
              <div className="text-[10px] text-slate-400">الجلسات المكتملة</div>
              <div className="text-lg font-black text-emerald-400 font-mono">{history.length}</div>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl text-center">
              <div className="text-[10px] text-slate-400">متوسط الدرجات</div>
              <div className="text-lg font-black text-indigo-400 font-mono">
                {history.length > 0
                  ? Math.round(history.reduce((a, b) => a + b.score, 0) / history.length)
                  : '--'}
                %
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Scenario Selector & Interactive Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scenarios List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              <span>السيناريوهات التدريبية المتاحة</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">{scenarios.length} حالات</span>
          </div>

          <div className="space-y-3">
            {scenarios.map((sc) => {
              const isSelected = sc.id === activeScenario?.id;
              return (
                <div
                  key={sc.id}
                  onClick={() => {
                    setSelectedScenarioId(sc.id);
                    setEvaluation(null);
                    setAgentInput('');
                  }}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-850 border-indigo-500/80 shadow-lg shadow-indigo-950/40'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        sc.region === 'Egypt'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : sc.region === 'Global BPO'
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {sc.region === 'Egypt' ? '🇪🇬 مصر (Retail/Telco)' : sc.region === 'Global BPO' ? '🌐 Global BPO (UK/US)' : '🇸🇦 الخليج (VIP Enterprise)'}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      {sc.difficulty}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-white mb-1.5 leading-snug">{sc.title}</h3>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-500" />
                    <span>{sc.persona}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Past Attempts History */}
          {history.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>سجل المحاولات الأخيرة</span>
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[11px] p-2 rounded-xl bg-slate-950 border border-slate-800/80"
                  >
                    <span className="text-slate-300 truncate max-w-[180px]">{h.scenarioTitle}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className={h.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {h.score}%
                      </span>
                      <span className="text-slate-500 text-[10px]">{h.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Live Interaction & Instant Evaluation */}
        <div className="lg:col-span-2 space-y-5">
          {activeScenario && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-xl">
              {/* Scenario Context Header */}
              <div className="border-b border-slate-800 pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">{activeScenario.title}</h3>
                      <p className="text-xs text-slate-400">{activeScenario.persona}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    نبرة العميل: {activeScenario.customerTone}
                  </span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-xs leading-relaxed text-slate-300 flex items-start gap-2">
                  <Target className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-emerald-400 font-bold ml-1">الهدف التشغيلي المطلوب:</span>
                    <span>{activeScenario.objective}</span>
                  </div>
                </div>
              </div>

              {/* Customer Prompt Simulation Box */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-rose-400" />
                  <span>رسالة العميل الافتراضي (صوت/شات حي):</span>
                </label>
                <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 text-xs leading-loose text-rose-200 font-mono shadow-inner border-r-4 border-r-rose-500">
                  {activeScenario.dialogue[0]?.text}
                </div>
              </div>

              {/* Agent Response Area */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                    <span>صياغة رد الوكيل المتدرب (المحاكاة الحية):</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {agentInput.length} حرفاً
                  </span>
                </div>

                <textarea
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  placeholder="اكتب ردك المهني هنا متضمناً الترحيب، امتصاص الغضب، وخطوات الحل والامتثال بالسياسة..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
                />

                {/* Quick Canned Suggestions for Training */}
                <div className="flex items-center gap-2 overflow-x-auto text-[11px] pt-1">
                  <span className="text-slate-500 shrink-0">مقترحات تدريبية:</span>
                  {activeScenario.region === 'Egypt' ? (
                    <>
                      <button
                        onClick={() =>
                          handleQuickTemplate(
                            'مساء الخير يا فندم، حقك علينا تماماً وأنا مقدر جداً استياءك. أنا هفحص استهلاك باقة حضرتك دلوقتي وهنعمل إعادة ضبط للراوتر، ومعانا خصم ولاء 20% تقديراً لاشتراكك معانا.'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition shrink-0"
                      >
                        قالب امتصاص الغضب والخصم (مصر)
                      </button>
                      <button
                        onClick={() =>
                          handleQuickTemplate(
                            'أهلاً بك يا فندم، بعتذر جداً لحضرتك عن الإزعاج. حالياً تم التأكد من جودة كابينة الـ VDSL وسيتم تعويضك بـ 50 جيجا إضافية مجاناً لحين فحص الاستهلاك.'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition shrink-0"
                      >
                        قالب تعويض الجيجات الفوري
                      </button>
                    </>
                  ) : activeScenario.region === 'Global BPO' ? (
                    <button
                      onClick={() =>
                        handleQuickTemplate(
                          'Hello David, I understand the critical urgency with your trading peak hours. I have immediately triggered our London secondary failover SIP gateway and opened P1 incident #UK-9921 to ensure complete SLA protection.'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition shrink-0"
                    >
                      UK Fintech P1 Escalation
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        handleQuickTemplate(
                          'أهلاً وسهلاً أستاذ عبد العزيز، يسعدنا جداً خدمتك في المقر الجديد. تم تعيين فريق مهندسي شبكات ميداني مخصص لجدولة النقل يوم الأحد وضمان استمرارية الـ 50 دائرة فايبر بدون أي دقيقة انقطاع.'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition shrink-0"
                    >
                      بروتوكول ترحيل فايبر VIP (الرياض)
                    </button>
                  )}
                </div>

                {/* Submit Evaluation Button */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setAgentInput('');
                      setEvaluation(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة الضبط</span>
                  </button>

                  <button
                    onClick={handleEvaluate}
                    disabled={loading || !agentInput.trim()}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-950/50 disabled:opacity-50 transition"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>جارٍ تحليل الرد عبر محرك الذكاء الاصطناعي...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>تقييم الرد ومنح الدرجة الآن</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Evaluation Results Card */}
              {evaluation && (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-3 rounded-2xl border text-center ${
                          evaluation.passed
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        <div className="text-2xl font-black font-mono">{evaluation.overallScore}%</div>
                        <div className="text-[10px] font-bold">
                          {evaluation.passed ? 'ناجح ومعتمد' : 'يحتاج تحسين'}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">نتائج التدريب والتقييم الآلي</h4>
                        <p className="text-xs text-slate-400">{evaluation.feedback}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                      <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                        <span className="text-slate-400 block text-[10px]">مؤشر التعاطف</span>
                        <span className="text-emerald-400 font-bold">{evaluation.metrics.empathyScore}%</span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                        <span className="text-slate-400 block text-[10px]">الالتزام بالسياسة</span>
                        <span className="text-indigo-400 font-bold">{evaluation.metrics.complianceScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Strengths & Improvements List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 space-y-1.5">
                      <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>نقاط القوة المرصودة:</span>
                      </div>
                      <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                        {evaluation.strengths.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                      <div className="font-bold text-amber-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>توصيات التطوير المقترحة:</span>
                      </div>
                      <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                        {evaluation.improvements.map((imp, idx) => (
                          <li key={idx}>{imp}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
