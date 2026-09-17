/**
 * @file src/components/AIAnalystBenchmark.tsx
 * AI Business Intelligence Analyst (Natural Language Queries) + Golden Benchmark Suite Runner
 */

import React, { useState } from 'react';
import {
  BrainCircuit,
  Search,
  CheckCircle2,
  AlertTriangle,
  Play,
  Clock,
  Sparkles,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';

interface BenchmarkResult {
  totalTests: number;
  passed: number;
  accuracyPercent: number;
  hallucinationRatePercent: number;
  avgLatencyMs: number;
  details: Array<{ id: string; status: 'pass' | 'fail'; latencyMs: number; notes: string }>;
}

export const AIAnalystBenchmark: React.FC = () => {
  const [query, setQuery] = useState('');
  const [analystResponse, setAnalystResponse] = useState<{
    answer: string;
    evidence: string[];
    timeframe: string;
    confidence: number;
  } | null>(null);
  const [loadingAnalyst, setLoadingAnalyst] = useState(false);

  const [benchmarkData, setBenchmarkData] = useState<BenchmarkResult | null>(null);
  const [runningBenchmark, setRunningBenchmark] = useState(false);

  const sampleQueries = [
    'ما هي أكثر أسباب الشكاوى وتأخر الخدمات هذا الأسبوع؟',
    'ما هو تقييم أداء وكلاء فريق كبار العملاء VIP؟',
    'هل توجد مخاطر وشيكة لتجاوز اتفاقية مستوى الخدمة SLA؟',
  ];

  const handleRunAnalyst = async (qText?: string) => {
    const text = qText || query;
    if (!text.trim()) return;
    setLoadingAnalyst(true);

    try {
      const res = await fetch('/api/v1/ai/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalystResponse(data.data);
      }
    } catch (e) {
      console.error('Analyst error:', e);
    } finally {
      setLoadingAnalyst(false);
    }
  };

  const handleRunBenchmark = async () => {
    setRunningBenchmark(true);
    try {
      const res = await fetch('/api/v1/ai/benchmark');
      const data = await res.json();
      if (data.success) {
        setBenchmarkData(data.data);
      }
    } catch (e) {
      console.error('Benchmark error:', e);
    } finally {
      setRunningBenchmark(false);
    }
  };

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-emerald-400" />
          <span>محلل الذكاء الاصطناعي للأعمال واختبارات الجودة المعيارية</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          استخراج الرؤى التشغيلية بلغة طبيعية مع التحقق الصارم من انعدام الهلوسة ودقة المعايير
        </p>
      </div>

      {/* 1. Natural Language AI Analyst Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 pb-2 border-b border-slate-800">
          <Sparkles className="w-4 h-4" />
          <span>المحلل الذكي (Natural Language BI Analyst)</span>
        </div>

        {/* Input Box */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunAnalyst()}
            placeholder="اطرح أي سؤال تشغيلي باللغة العربية (مثال: ما هي أكثر أسباب الشكاوى؟)..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => handleRunAnalyst()}
            disabled={loadingAnalyst}
            className="px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            <span>تحليل</span>
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-slate-400">أسئلة مقترحة:</span>
          {sampleQueries.map((sq, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(sq);
                handleRunAnalyst(sq);
              }}
              className="text-[11px] px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition"
            >
              {sq}
            </button>
          ))}
        </div>

        {/* Analyst Output Card */}
        {loadingAnalyst ? (
          <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
            جارٍ استقراء قواعد البيانات وتجميع الأدلة الرقمية...
          </div>
        ) : analystResponse ? (
          <div className="bg-slate-950 rounded-2xl p-5 border border-emerald-500/30 space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">النتيجة التحليلية الموثقة:</span>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                نسبة الموثوقية: {Math.round(analystResponse.confidence * 100)}%
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
              {analystResponse.answer}
            </p>

            {/* Evidence & Grounding Box */}
            <div className="pt-2">
              <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>الأدلة والبيانات الرقمية المستخدمة في الاستنتاج:</span>
              </div>
              <ul className="space-y-1.5">
                {analystResponse.evidence.map((ev, idx) => (
                  <li key={idx} className="text-xs text-slate-300 flex items-center gap-2 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {/* 2. Golden Benchmark Suite Evaluation Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>حزمة الاختبارات المعيارية الذهبية (Golden Benchmark Suite)</span>
          </div>

          <button
            onClick={handleRunBenchmark}
            disabled={runningBenchmark}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{runningBenchmark ? 'جارٍ تشغيل الاختبارات...' : 'تشغيل الاختبارات الذهبية الآن'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          تقوم هذه الأداة باختبار نماذج الذكاء الاصطناعي ضد حزمة اختبارات ذهبية محددة مسبقاً للتحقق من:
          1) الدقة الوظيفية 2) معدل الهلوسة والالتزام الصارم بالسياسات 3) سرعة الاستجابة الزمنية (Latency &lt; 500ms).
        </p>

        {benchmarkData && (
          <div className="space-y-4 pt-2">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">نسبة الدقة الكلية</div>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {benchmarkData.accuracyPercent}%
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">معدل الهلوسة (Hallucination)</div>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {benchmarkData.hallucinationRatePercent}%
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">متوسط زمن الاستجابة</div>
                <div className="text-xl font-bold text-cyan-400 font-mono mt-1">
                  {benchmarkData.avgLatencyMs} ms
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">الحالات الناجحة</div>
                <div className="text-xl font-bold text-white font-mono mt-1">
                  {benchmarkData.passed} / {benchmarkData.totalTests}
                </div>
              </div>
            </div>

            {/* Test Details Table */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">معرّف الاختبار</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">زمن المعالجة</th>
                    <th className="p-3">ملاحظات التحقق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {benchmarkData.details.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-900/40">
                      <td className="p-3 font-bold text-white">{d.id}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">
                          {d.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{d.latencyMs} ms</td>
                      <td className="p-3 text-slate-400 text-[11px]">{d.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
