/**
 * Comprehensive System Operations & Integration Test Suite
 * Tests all contact center operations, modules, and API endpoints
 */

async function runTests() {
  const baseUrl = 'http://127.0.0.1:3000/api/v1';
  const healthUrl = 'http://127.0.0.1:3000/api/health';

  console.log('--- STARTING CC OS END-TO-END OPERATIONS TEST ---');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message || err);
      failed++;
    }
  }

  // 1. Health check
  await test('GET /api/health', async () => {
    const res = await fetch(healthUrl);
    const data = await res.json();
    if (data.status !== 'healthy') throw new Error(`Unexpected status: ${data.status}`);
  });

  // 2. Auth / Identity
  await test('GET /api/v1/auth/me', async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    const data = await res.json();
    if (!data.success || !data.data.user) throw new Error('Failed to fetch auth me');
  });

  await test('POST /api/v1/auth/switch-role to Supervisor', async () => {
    const res = await fetch(`${baseUrl}/auth/switch-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Supervisor' }),
    });
    const data = await res.json();
    if (!data.success || data.data.currentActor.role !== 'Supervisor') throw new Error('Role switch failed');
  });

  // 3. Agents & Teams
  await test('GET /api/v1/agents', async () => {
    const res = await fetch(`${baseUrl}/agents`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) throw new Error('Failed agents list');
  });

  await test('GET /api/v1/teams', async () => {
    const res = await fetch(`${baseUrl}/teams`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed teams list');
  });

  // 4. Customers & Customer 360
  let customerId = '';
  await test('GET /api/v1/customers', async () => {
    const res = await fetch(`${baseUrl}/customers`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) throw new Error('Failed customers list');
    customerId = data.data[0].id;
  });

  await test(`GET /api/v1/customers/${customerId} (360 profile)`, async () => {
    const res = await fetch(`${baseUrl}/customers/${customerId}`);
    const data = await res.json();
    if (!data.success || !data.data.name) throw new Error('Failed customer 360');
  });

  await test(`GET /api/v1/customers/${customerId}/timeline`, async () => {
    const res = await fetch(`${baseUrl}/customers/${customerId}/timeline`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed customer timeline');
  });

  // 5. Conversations & Inbox
  let convId = '';
  await test('GET /api/v1/conversations', async () => {
    const res = await fetch(`${baseUrl}/conversations`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) throw new Error('Failed convs list');
    convId = data.data[0].id;
  });

  await test(`GET /api/v1/conversations/${convId}/messages`, async () => {
    const res = await fetch(`${baseUrl}/conversations/${convId}/messages`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed conv messages');
  });

  await test(`POST /api/v1/conversations/${convId}/reply`, async () => {
    const res = await fetch(`${baseUrl}/conversations/${convId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'مرحباً، تم استلام طلبكم وجارٍ متابعته فوراً.', isInternalNote: false }),
    });
    const data = await res.json();
    if (!data.success || !data.data.id) throw new Error('Failed to post reply');
  });

  // 6. Calls & Telephony
  let callId = '';
  await test('GET /api/v1/calls', async () => {
    const res = await fetch(`${baseUrl}/calls`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed calls list');
    if (data.data.length > 0) callId = data.data[0].id;
  });

  if (callId) {
    await test(`POST /api/v1/calls/${callId}/control (hold & unhold)`, async () => {
      const res = await fetch(`${baseUrl}/calls/${callId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hold' }),
      });
      const data = await res.json();
      if (!data.success || data.data.status !== 'hold') throw new Error('Failed call hold');

      const res2 = await fetch(`${baseUrl}/calls/${callId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unhold' }),
      });
      const data2 = await res2.json();
      if (!data2.success || data2.data.status !== 'in_progress') throw new Error('Failed call unhold');
    });
  }

  // 7. Tickets & SLA
  let ticketId = '';
  await test('POST /api/v1/tickets (create)', async () => {
    const res = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        title: 'استفسار عن الفاتورة الإلكترونية',
        description: 'العميل يطلب توضيح رسوم التجوال الدولي لشهر مارس',
        priority: 'high',
        category: 'الفواتير والمدفوعات',
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data.id) throw new Error('Failed ticket create');
    ticketId = data.data.id;
  });

  await test(`POST /api/v1/tickets/${ticketId}/escalate`, async () => {
    const res = await fetch(`${baseUrl}/tickets/${ticketId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'طلب تصعيد فوري من الإدارة العليا' }),
    });
    const data = await res.json();
    if (!data.success || data.data.priority !== 'urgent') throw new Error('Failed ticket escalate');
  });

  // 8. AI Copilot & Analyst
  await test('POST /api/v1/ai/copilot/suggest', async () => {
    const res = await fetch(`${baseUrl}/ai/copilot/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerMessage: 'أريد ترقية باقة الفايبر الخاصة بي إلى 500 ميجا',
        forceLocal: true,
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data.content) throw new Error('Failed copilot suggest');
  });

  await test('POST /api/v1/ai/analyst', async () => {
    const res = await fetch(`${baseUrl}/ai/analyst`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'ما هي أهم أسباب الشكاوى؟' }),
    });
    const data = await res.json();
    if (!data.success || !data.data.answer) throw new Error('Failed AI analyst');
  });

  // 9. Operations Live Dashboard
  await test('GET /api/v1/operations/live', async () => {
    const res = await fetch(`${baseUrl}/operations/live`);
    const data = await res.json();
    if (!data.success || typeof data.data.liveMetrics.activeCalls !== 'number') throw new Error('Failed live ops');
  });

  // 10. QA & Coaching Plans
  let createdPlanId = '';
  await test('GET /api/v1/qa/evaluations', async () => {
    const res = await fetch(`${baseUrl}/qa/evaluations`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed QA evaluations');
  });

  await test('POST /api/v1/qa/coaching-plans', async () => {
    const res = await fetch(`${baseUrl}/qa/coaching-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agt-sarah',
        agentName: 'سارة أحمد',
        title: 'خطة تقوية التعامل مع العملاء الغاضبين',
        focusArea: 'تهدئة الاعتراضات de-escalation',
        targetMetric: '95% رضا العملاء',
        recommendationText: 'استخدام أسلوب التعاطف الفوري وتجنب المجادلة.',
        recommendedActions: ['مراجعة سيناريو التهدئة', 'جلسة تدريب عملية'],
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data.id) throw new Error('Failed coaching plan create');
    createdPlanId = data.data.id;
  });

  await test(`POST /api/v1/qa/coaching-plans/${createdPlanId}/progress`, async () => {
    const res = await fetch(`${baseUrl}/qa/coaching-plans/${createdPlanId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progressPercent: 50, status: 'in_progress' }),
    });
    const data = await res.json();
    if (!data.success || data.data.progressPercent !== 50) throw new Error('Failed coaching progress');
  });

  // 11. Smart Recommendations Hub
  let targetRecId = '';
  await test('GET /api/v1/recommendations', async () => {
    const res = await fetch(`${baseUrl}/recommendations`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) throw new Error('Failed recommendations');
    targetRecId = data.data[0].id;
  });

  await test(`POST /api/v1/recommendations/${targetRecId}/apply`, async () => {
    const res = await fetch(`${baseUrl}/recommendations/${targetRecId}/apply`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!data.success || !data.data.applied) throw new Error('Failed recommendation apply');
  });

  // 12. Knowledge Base & RAG Search
  await test('GET /api/v1/kb/articles', async () => {
    const res = await fetch(`${baseUrl}/kb/articles`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed KB articles');
  });

  await test('POST /api/v1/kb/test-rag', async () => {
    const res = await fetch(`${baseUrl}/kb/test-rag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'ما هي شروط استرجاع الأجهزة التالفة؟' }),
    });
    const data = await res.json();
    if (!data.success || !data.data.answer) throw new Error('Failed RAG test');
  });

  // 13. Channel Integrations & Simulation
  await test('GET /api/v1/integrations/channels', async () => {
    const res = await fetch(`${baseUrl}/integrations/channels`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed integrations channels');
  });

  await test('POST /api/v1/integrations/simulate-inbound', async () => {
    const res = await fetch(`${baseUrl}/integrations/simulate-inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'whatsapp',
        senderName: 'عبدالرحمن الشهري',
        senderPhone: '+966551234567',
        messageText: 'أرغب بالاستفسار عن موعد تفعيل الشريحة الإلكترونية eSIM',
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data.conversation || !data.data.message) throw new Error('Failed simulate inbound');
  });

  // 14. WFM & Shift Scheduling
  await test('GET /api/v1/wfm/overview', async () => {
    const res = await fetch(`${baseUrl}/wfm/overview`);
    const data = await res.json();
    if (!data.success || !data.data.erlangForecast) throw new Error('Failed WFM overview');
  });

  await test('POST /api/v1/wfm/shifts (create shift)', async () => {
    const res = await fetch(`${baseUrl}/wfm/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agt-sarah',
        startTime: '10:00',
        endTime: '18:00',
        status: 'scheduled',
      }),
    });
    const data = await res.json();
    if (!data.success || !data.data.id) throw new Error('Failed create shift');
  });

  // 15. Workflow Automation Engine
  await test('GET /api/v1/automation/rules', async () => {
    const res = await fetch(`${baseUrl}/automation/rules`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error('Failed automation rules');
  });

  await test('POST /api/v1/automation/simulate', async () => {
    const res = await fetch(`${baseUrl}/automation/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'ticket_created',
        payload: {
          priority: 'urgent',
          category: 'فواتير',
        },
      }),
    });
    const data = await res.json();
    if (!data.success || typeof data.data.rulesEvaluated !== 'number') throw new Error('Failed automation simulate');
  });

  // 16. Audit Logs
  await test('GET /api/v1/audit/logs', async () => {
    const res = await fetch(`${baseUrl}/audit/logs`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) throw new Error('Failed audit logs');
  });

  console.log('----------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
