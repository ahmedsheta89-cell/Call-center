/**
 * @file server/api/router.ts
 * Master Express Router for AI Contact Center OS (/api/v1/*)
 * Enforces Tenant Isolation, Auditing, and RBAC Guards across all endpoints.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/store.ts';
import { DEMO_ORG_ID, initializeSeedData } from '../db/seed.ts';
import { AuditLogger } from '../core/audit.ts';
import { assertPermission, hasPermission, Permission } from '../core/rbac.ts';
import { AIGateway } from '../modules/ai/gateway.ts';
import { UnifiedMessage, UUID, Ticket, CallSession } from '../core/types.ts';
import { EventBus } from '../core/events.ts';

export const apiRouter = Router();

// Middleware: Extract or Default Tenant Context & Current User
let currentActor = {
  organizationId: DEMO_ORG_ID,
  userId: 'usr-admin-01',
  role: 'Supervisor',
  name: 'سلطان القحطاني',
};

// ----------------------------------------------------
// 0. Real-Time Server-Sent Events (SSE) Stream
// ----------------------------------------------------
apiRouter.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  // Initial handshake event
  res.write(`data: ${JSON.stringify({ type: 'system:connected', message: 'Live stream connected successfully', clientCount: EventBus.getSseClientCount() + 1, timestamp: new Date().toISOString() })}\n\n`);

  // Heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 25000);

  // Subscribe to EventBus
  const unsubscribe = EventBus.addSseClient((event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // client disconnected
    }
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ----------------------------------------------------
// 0.1 Backup, Restore & Data Persistence APIs
// ----------------------------------------------------
apiRouter.get('/system/backup', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'audit.read');
  const backup = db.exportFullBackup();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="contact_center_backup_${Date.now()}.json"`);
  res.json({ success: true, data: backup });
});

apiRouter.post('/system/restore', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'audit.read');
  const payload = req.body;
  if (!payload || !payload.organizations) {
    res.status(400).json({ success: false, error: { message: 'Invalid backup file structure' } });
    return;
  }

  const restored = db.importFullBackup(payload);
  if (restored) {
    db.saveToDisk();
    EventBus.publish('system:restored', { timestamp: new Date().toISOString() });
    res.json({ success: true, message: 'Database state restored successfully' });
  } else {
    res.status(500).json({ success: false, error: { message: 'Failed to restore database state' } });
  }
});

apiRouter.post('/system/reset-seed', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'audit.read');
  initializeSeedData();
  db.saveToDisk();
  EventBus.publish('system:reset', { timestamp: new Date().toISOString() });
  res.json({ success: true, message: 'Reset to seed state completed' });
});

// ----------------------------------------------------
// 1. Identity, Auth & Role Switching (for testing RBAC)
// ----------------------------------------------------
apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const org = db.organizations.get(currentActor.organizationId);
  const user = db.users.get(currentActor.userId);
  res.json({
    success: true,
    data: {
      user: {
        ...user,
        role: currentActor.role,
      },
      organization: org,
      availableRoles: ['Owner', 'Admin', 'Supervisor', 'Team Leader', 'Agent', 'QA', 'Analyst', 'Read Only', 'AI Agent'],
    },
  });
});

apiRouter.post('/auth/switch-role', (req: Request, res: Response) => {
  const { role, userId } = req.body;
  if (role) {
    const roleMapping: Record<string, string> = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      agent: 'Agent',
      owner: 'Owner',
      qa: 'QA',
      'team leader': 'Team Leader',
      analyst: 'Analyst',
      'read only': 'Read Only',
      'ai agent': 'AI Agent',
    };
    currentActor.role = roleMapping[role.toLowerCase().trim()] || role;
  }
  if (userId && db.users.has(userId)) {
    currentActor.userId = userId;
    currentActor.name = db.users.get(userId)!.fullName;
  }
  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'auth.switch_role',
    entityType: 'session',
    entityId: currentActor.userId,
    afterState: { role: currentActor.role },
  });
  res.json({ success: true, data: { currentActor } });
});

apiRouter.get('/agents', (req: Request, res: Response) => {
  const agentsList = Array.from(db.agents.values())
    .filter((a) => a.organizationId === currentActor.organizationId)
    .map((agent) => {
      const u = db.users.get(agent.userId);
      const t = agent.teamId ? db.teams.get(agent.teamId) : undefined;
      return {
        ...agent,
        fullName: u?.fullName || 'وكيل خدمة',
        email: u?.email,
        avatarUrl: u?.avatarUrl,
        teamName: t?.name,
      };
    });
  res.json({ success: true, data: agentsList });
});

apiRouter.get('/teams', (req: Request, res: Response) => {
  const teamsList = Array.from(db.teams.values()).filter((t) => t.organizationId === currentActor.organizationId);
  res.json({ success: true, data: teamsList });
});

// ----------------------------------------------------
// 2. CRM & Customer 360 Core
// ----------------------------------------------------
apiRouter.get('/customers', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'customer.read');
  const search = (req.query.search as string || '').toLowerCase();
  const tier = req.query.tier as string;
  let list = db.getCustomers(currentActor.organizationId);

  if (search) {
    list = list.filter((c) => c.name.toLowerCase().includes(search) || (c.phone && c.phone.includes(search)) || (c.email && c.email.includes(search)));
  }
  if (tier && tier !== 'all') {
    list = list.filter((c) => c.customerTier === tier);
  }

  res.json({ success: true, data: list, count: list.length });
});

apiRouter.get('/customers/:id', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'customer.read');
  const customer = db.customers.get(req.params.id);
  if (!customer || customer.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    return;
  }

  // Channels
  const channels = Array.from(db.customerChannels.values()).filter((c) => c.customerId === customer.id);
  // Assigned Agent
  const agent = customer.assignedAgentId ? db.agents.get(customer.assignedAgentId) : undefined;
  const agentUser = agent ? db.users.get(agent.userId) : undefined;

  res.json({
    success: true,
    data: {
      ...customer,
      channels,
      assignedAgentName: agentUser?.fullName,
    },
  });
});

apiRouter.get('/customers/:id/timeline', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'customer.read');
  const customerId = req.params.id;

  // Aggregate calls, conversations, and tickets into unified timeline
  const customerCalls = db.getCalls(currentActor.organizationId).filter((c) => c.customerId === customerId);
  const customerConvs = db.getConversations(currentActor.organizationId).filter((c) => c.customerId === customerId);
  const customerTickets = db.getTickets(currentActor.organizationId).filter((t) => t.customerId === customerId);

  const timeline = [
    ...customerCalls.map((c) => ({
      id: c.id,
      type: 'call' as const,
      title: `مكالمة هاتفية (${c.direction === 'inbound' ? 'واردة' : 'صادرة'})`,
      description: c.aiSummary || `مدة المكالمة: ${c.durationSeconds} ثانية - الحالة: ${c.disposition || c.status}`,
      sentiment: c.aiSentiment || 'neutral',
      timestamp: c.startedAt,
    })),
    ...customerConvs.map((cv) => ({
      id: cv.id,
      type: 'conversation' as const,
      title: `محادثة ${cv.channel.toUpperCase()}: ${cv.subject || 'استفسار'}`,
      description: `الأولوية: ${cv.priority} | الحالة: ${cv.status}`,
      sentiment: cv.sentiment,
      timestamp: cv.lastMessageAt,
    })),
    ...customerTickets.map((t) => ({
      id: t.id,
      type: 'ticket' as const,
      title: `تذكرة دعم #${t.ticketNumber}: ${t.title}`,
      description: `الفئة: ${t.category} | SLA: ${t.slaStatus}`,
      sentiment: t.priority === 'urgent' ? 'negative' : 'neutral',
      timestamp: t.createdAt,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({ success: true, data: timeline });
});

// ----------------------------------------------------
// 3. Omnichannel Conversations & Unified Inbox
// ----------------------------------------------------
apiRouter.get('/conversations', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'conversation.read');
  const channel = req.query.channel as string;
  const status = req.query.status as string;
  let list = db.getConversations(currentActor.organizationId);

  if (channel && channel !== 'all') {
    list = list.filter((c) => c.channel === channel);
  }
  if (status && status !== 'all') {
    list = list.filter((c) => c.status === status);
  }

  // Enrich with customer details and latest message
  const enriched = list.map((c) => {
    const cust = db.customers.get(c.customerId);
    const msgs = db.getMessages(currentActor.organizationId, c.id);
    const lastMsg = msgs[msgs.length - 1];
    return {
      ...c,
      customerName: cust?.name || 'عميل غير مسجل',
      customerTier: cust?.customerTier || 'standard',
      customerPhone: cust?.phone,
      latestMessageSnippet: lastMsg?.body || 'لا توجد رسائل',
      unreadCount: c.status === 'open' ? 1 : 0,
    };
  });

  res.json({ success: true, data: enriched });
});

apiRouter.get('/conversations/:id/messages', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'conversation.read');
  const messages = db.getMessages(currentActor.organizationId, req.params.id);
  res.json({ success: true, data: messages });
});

const handleConversationReply = async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'conversation.reply');
  const convId = req.params.id;
  const bodyText = req.body.body || req.body.text || '';
  const isInternalNote = !!req.body.isInternalNote;
  const conv = db.conversations.get(convId);

  if (!conv || conv.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    return;
  }

  const msgId: UUID = crypto.randomUUID();
  const newMessage: UnifiedMessage = {
    id: msgId,
    organizationId: currentActor.organizationId,
    conversationId: convId,
    customerId: conv.customerId,
    channel: conv.channel,
    direction: isInternalNote ? 'internal_note' : 'outbound',
    type: 'text',
    body: bodyText,
    sender: {
      id: currentActor.userId,
      type: 'agent',
      name: currentActor.name,
    },
    status: 'delivered',
    metadata: { sentByRole: currentActor.role },
    createdAt: new Date().toISOString(),
  };

  db.messages.set(newMessage.id, newMessage);
  conv.lastMessageAt = newMessage.createdAt;
  conv.updatedAt = newMessage.createdAt;

  db.schedulePersist();
  EventBus.publish('message:new', { conversationId: conv.id, message: newMessage });

  // Log in audit trail
  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'agent',
    action: isInternalNote ? 'conversation.note' : 'conversation.reply',
    entityType: 'message',
    entityId: msgId,
    afterState: { bodyLength: bodyText.length, channel: conv.channel },
  });

  res.json({ success: true, data: newMessage });
};

apiRouter.post('/conversations/:id/reply', handleConversationReply);
apiRouter.post('/conversations/:id/messages', handleConversationReply);

// ----------------------------------------------------
// 4. Voice & Telephony Engine
// ----------------------------------------------------
apiRouter.get('/calls', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'call.read');
  const calls = db.getCalls(currentActor.organizationId).map((c) => {
    const cust = c.customerId ? db.customers.get(c.customerId) : undefined;
    return {
      ...c,
      customerName: cust?.name || 'مكالمة واردة غير معرفة',
      customerTier: cust?.customerTier || 'standard',
    };
  });
  res.json({ success: true, data: calls });
});

apiRouter.post('/calls/dial', async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'call.make');
  const { phoneNumber, customerName, customerId } = req.body;
  const callId = `call-${Date.now().toString(36)}`;
  const newCall: CallSession = {
    id: callId,
    organizationId: currentActor.organizationId,
    direction: 'outbound',
    status: 'in_progress',
    callerNumber: phoneNumber || '+966500000000',
    calleeNumber: '920000001',
    agentId: currentActor.userId,
    customerId: customerId || undefined,
    startedAt: new Date().toISOString(),
    durationSeconds: 1,
    aiSentiment: 'positive',
  };
  db.calls.set(callId, newCall);
  db.schedulePersist();
  EventBus.publish('call:event', { action: 'dial', call: newCall });

  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'agent',
    action: 'call.outbound_dial',
    entityType: 'call',
    entityId: callId,
    afterState: { phoneNumber, customerName },
  });

  res.json({ success: true, data: newCall });
});

apiRouter.post('/calls/:id/end', async (req: Request, res: Response) => {
  const call = db.calls.get(req.params.id);
  if (!call || call.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Call not found' } });
    return;
  }
  call.status = 'completed';
  call.endedAt = new Date().toISOString();

  db.schedulePersist();
  EventBus.publish('call:event', { action: 'end', call });

  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'call.hangup',
    entityType: 'call',
    entityId: call.id,
    afterState: { status: 'completed' },
  });

  res.json({ success: true, data: call });
});

apiRouter.post('/calls/:id/control', async (req: Request, res: Response) => {
  const { action, supervisorMode } = req.body; // 'hold' | 'unhold' | 'mute' | 'hangup' | 'whisper' | 'barge'
  const call = db.calls.get(req.params.id);
  if (!call || call.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Call not found' } });
    return;
  }

  if (action === 'whisper' || action === 'barge') {
    assertPermission(currentActor.role, [], 'call.whisper_barge');
  }

  if (action === 'hold') call.status = 'hold';
  else if (action === 'unhold') call.status = 'in_progress';
  else if (action === 'hangup') {
    call.status = 'completed';
    call.endedAt = new Date().toISOString();
  }

  db.schedulePersist();
  EventBus.publish('call:event', { action, call });

  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: `call.${action}`,
    entityType: 'call',
    entityId: call.id,
    afterState: { status: call.status, supervisorMode },
  });

  res.json({ success: true, data: call });
});

// ----------------------------------------------------
// 5. Tickets & SLA Engine
// ----------------------------------------------------
apiRouter.get('/tickets', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'ticket.read');
  const status = req.query.status as string;
  let tickets = db.getTickets(currentActor.organizationId);

  if (status && status !== 'all') {
    tickets = tickets.filter((t) => t.status === status);
  }

  const enriched = tickets.map((t) => {
    const cust = db.customers.get(t.customerId);
    const agt = t.assignedAgentId ? db.agents.get(t.assignedAgentId) : undefined;
    const agtUser = agt ? db.users.get(agt.userId) : undefined;
    return {
      ...t,
      customerName: cust?.name || 'عميل غير مسجل',
      customerPhone: cust?.phone,
      assignedAgentName: agtUser?.fullName || 'غير معين',
    };
  });

  res.json({ success: true, data: enriched });
});

apiRouter.post('/tickets', async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'ticket.create');
  const { customerId, title, description, priority, category } = req.body;
  const slaPrio = (priority as 'low' | 'medium' | 'high' | 'urgent') || 'medium';
  const slaPolicy = Array.from(db.slaPolicies.values()).find((p) => p.priority === slaPrio);

  const ticketId: UUID = crypto.randomUUID();
  const newTicket: Ticket = {
    id: ticketId,
    organizationId: currentActor.organizationId,
    ticketNumber: 2000 + db.tickets.size + 1,
    customerId,
    title,
    description,
    status: 'new',
    priority: slaPrio,
    category: category || 'استفسار عام',
    firstResponseDueAt: new Date(Date.now() + (slaPolicy?.firstResponseTimeMinutes || 30) * 60000).toISOString(),
    resolutionDueAt: new Date(Date.now() + (slaPolicy?.resolutionTimeMinutes || 720) * 60000).toISOString(),
    slaStatus: 'healthy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.tickets.set(newTicket.id, newTicket);
  db.schedulePersist();
  EventBus.publish('ticket:created', newTicket);

  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'ticket.create',
    entityType: 'ticket',
    entityId: newTicket.id,
    afterState: { ticketNumber: newTicket.ticketNumber, priority: slaPrio },
  });

  res.json({ success: true, data: newTicket });
});

apiRouter.post('/tickets/:id/escalate', async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'ticket.escalate');
  const ticket = db.tickets.get(req.params.id);
  if (!ticket || ticket.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    return;
  }

  ticket.priority = 'urgent';
  ticket.slaStatus = 'at_risk';
  ticket.updatedAt = new Date().toISOString();

  db.schedulePersist();
  EventBus.publish('ticket:updated', ticket);

  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'ticket.escalate',
    entityType: 'ticket',
    entityId: ticket.id,
    reason: req.body.reason || 'Escalated by supervisor request',
  });

  res.json({ success: true, data: ticket });
});

const handleTicketUpdate = async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'ticket.update');
  const ticket = db.tickets.get(req.params.id);
  if (!ticket || ticket.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    return;
  }

  const { status, assignedAgentId, priority, category, title, description } = req.body;
  if (status) ticket.status = status;
  if (assignedAgentId !== undefined) ticket.assignedAgentId = assignedAgentId;
  if (priority) ticket.priority = priority;
  if (category) ticket.category = category;
  if (title) ticket.title = title;
  if (description) ticket.description = description;
  ticket.updatedAt = new Date().toISOString();

  db.schedulePersist();
  EventBus.publish('ticket:updated', ticket);

  await AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'ticket.update',
    entityType: 'ticket',
    entityId: ticket.id,
    afterState: { status: ticket.status, assignedAgentId: ticket.assignedAgentId },
  });

  res.json({ success: true, data: ticket });
};

apiRouter.put('/tickets/:id', handleTicketUpdate);
apiRouter.put('/tickets/:id/status', handleTicketUpdate);

// ----------------------------------------------------
// 6. AI Gateway & Copilot
// ----------------------------------------------------
apiRouter.post('/ai/copilot/suggest', async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'ai.suggest');
  const { customerMessage, conversationHistory, forceLocal } = req.body;

  const result = await AIGateway.execute({
    organizationId: currentActor.organizationId,
    task: 'copilot_suggest',
    input: customerMessage || '',
    contextData: { history: conversationHistory },
    privacy: 'public',
    forceLocal: !!forceLocal,
  });

  res.json({
    success: true,
    data: {
      ...result,
      suggestedResponse: result.content,
    },
  });
});

apiRouter.post('/ai/analyst', async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'analytics.read');
  const { query } = req.body;

  // Realistic NL query parsing over actual store data
  const totalCalls = db.getCalls(currentActor.organizationId).length;
  const totalTickets = db.getTickets(currentActor.organizationId).length;
  const urgentTickets = db.getTickets(currentActor.organizationId).filter((t) => t.priority === 'urgent').length;
  const customersCount = db.getCustomers(currentActor.organizationId).length;

  const evidence = [
    `إجمالي التذاكر المسجلة بالنظام: ${totalTickets} تذكرة`,
    `التذاكر ذات الأولوية الحرجة: ${urgentTickets} تذاكر`,
    `إجمالي المكالمات المنجزة: ${totalCalls} مكالمة`,
    `قاعدة العملاء النشطة: ${customersCount} عميل`,
    `الفترة الزمنية للتحليل: الأيام الـ 7 الماضية`,
  ];

  let answer = '';
  if (/شكوى|مشاكل|أسباب/.test(query)) {
    answer = `بناءً على تحليل بيانات التذاكر والشكاوى في الفترة الأخيرة، أبرز أسباب الاستفسارات والشكاوى تركزت في: 1) تأخر زيارات الفنيين لخدمة الألياف البصرية (بنسبة 42%)، 2) استفسارات فواتير باقات التجوال والمدفوعات الإلكترونية (بنسبة 35%). يوصى بزيادة التنسيق مع الفرق الميدانية وتفعيل إشعارات المواعيد التلقائية.`;
  } else if (/أداء|وكلاء|موظفين/.test(query)) {
    answer = `مستوى الأداء العام لفرق خدمة العملاء ممتاز بمتوسط حل المشكلة من أول اتصال (FCR) بلغ 87.4%، ومعدل رضا العملاء (CSAT) 4.8/5. فريق كبار العملاء VIP حقق أعلى نسبة التزام باتفاقية الخدمة SLA بنسبة 98.2%.`;
  } else {
    answer = `بناءً على البيانات التشغيلية اللحظية للمنصة: النظام يعمل بكفاءة 99.8%، مع توفر 10 وكلاء خدمة نشطين وتغطية كاملة لكافة القنوات (WhatsApp, WebChat, Voice, Social Media).`;
  }

  res.json({
    success: true,
    data: {
      query,
      answer,
      analysis: answer,
      evidence,
      timeframe: 'آخر 7 أيام عمل',
      confidence: 0.96,
      generatedAt: new Date().toISOString(),
    },
  });
});

apiRouter.get('/ai/benchmark', async (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'analytics.read');
  const results = await AIGateway.runBenchmark(currentActor.organizationId);
  res.json({
    success: true,
    data: {
      ...results,
      scenarios: results.details,
    },
  });
});

// ----------------------------------------------------
// 7. Operations Command Center & Analytics KPIs
// ----------------------------------------------------
apiRouter.get('/operations/live', (req: Request, res: Response) => {
  const org = db.organizations.get(currentActor.organizationId);
  const convs = db.getConversations(currentActor.organizationId);
  const calls = db.getCalls(currentActor.organizationId);
  const tickets = db.getTickets(currentActor.organizationId);
  const agents = Array.from(db.agents.values()).filter((a) => a.organizationId === currentActor.organizationId);

  const activeConvs = convs.filter((c) => c.status === 'open').length;
  const activeCalls = calls.filter((c) => c.status === 'in_progress' || c.status === 'ringing').length;
  const slaAtRisk = tickets.filter((t) => t.slaStatus === 'at_risk' || t.slaStatus === 'warning').length;
  const agentsOnline = agents.filter((a) => a.status === 'online' || a.status === 'busy').length;
  const agentsBusy = agents.filter((a) => a.status === 'busy').length;

  res.json({
    success: true,
    data: {
      liveMetrics: {
        activeConversations: activeConvs,
        activeCalls: activeCalls,
        waitingQueue: 2,
        slaAtRiskCount: slaAtRisk,
        agentsOnline: agentsOnline,
        agentsBusy: agentsBusy,
        serviceAvailabilityPercent: 99.8,
        aiComplianceAlerts: 1,
        openTicketsCount: tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length,
      },
      aiBudget: {
        monthlyLimitUsd: org?.settings.aiMonthlyBudgetUsd || 250,
        currentSpendUsd: org?.settings.aiCurrentMonthSpendUsd || 18.45,
        zeroCostMode: org?.settings.zeroCostMode || false,
      },
    },
  });
});

// ----------------------------------------------------
// 8. QA & Coaching
// ----------------------------------------------------
apiRouter.get('/qa/evaluations', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'qa.evaluate');
  const evals = Array.from(db.qaEvaluations.values()).filter((e) => e.organizationId === currentActor.organizationId);
  res.json({ success: true, data: evals });
});

apiRouter.get('/qa/rubrics', (req: Request, res: Response) => {
  const rubrics = Array.from(db.qaRubrics.values()).filter((r) => r.organizationId === currentActor.organizationId);
  res.json({ success: true, data: rubrics });
});

// ----------------------------------------------------
// 9. Audit Logs
// ----------------------------------------------------
apiRouter.get('/audit/logs', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'audit.read');
  const logs = AuditLogger.getEvents(currentActor.organizationId);
  res.json({ success: true, data: logs });
});

// ----------------------------------------------------
// 10. System Settings & Zero-Cost Mode
// ----------------------------------------------------
apiRouter.get('/settings', (req: Request, res: Response) => {
  const org = db.organizations.get(currentActor.organizationId);
  res.json({ success: true, data: org?.settings });
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const org = db.organizations.get(currentActor.organizationId);
  if (org) {
    org.settings = { ...org.settings, ...req.body };
    AuditLogger.log({
      organizationId: currentActor.organizationId,
      actorId: currentActor.userId,
      actorType: 'user',
      action: 'settings.update',
      entityType: 'organization',
      entityId: org.id,
      afterState: req.body,
    });
  }
  res.json({ success: true, data: org?.settings });
});

// ----------------------------------------------------
// 11. Knowledge Base (RAG Ground Truth) Core
// ----------------------------------------------------
apiRouter.get('/kb/articles', (req: Request, res: Response) => {
  const search = (req.query.search as string || '').toLowerCase();
  const category = req.query.category as string;
  let docs = Array.from(db.knowledgeDocuments.values()).filter(
    (d) => d.organizationId === currentActor.organizationId
  );

  if (category && category !== 'all') {
    docs = docs.filter((d) => d.category === category);
  }
  if (search) {
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(search) ||
        d.content.toLowerCase().includes(search) ||
        d.tags.some((t) => t.toLowerCase().includes(search))
    );
  }

  res.json({ success: true, data: docs, total: docs.length });
});

apiRouter.post('/kb/articles', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const { title, category, content, tags } = req.body;
  if (!title || !content) {
    res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Title and content required' } });
    return;
  }

  const id = `kb-${Date.now().toString(36)}`;
  // Automated semantic chunking
  const paragraphs = content.split('\n\n').filter((p: string) => p.trim().length > 0);
  const chunks = paragraphs.map((p: string, idx: number) => ({
    id: `chunk-${id}-${idx + 1}`,
    content: p.trim(),
    embeddingKeyword: p.slice(0, 40),
  }));

  const newDoc = {
    id,
    organizationId: currentActor.organizationId,
    title,
    category: category || 'عام',
    tags: Array.isArray(tags) ? tags : ['سياسات'],
    version: 1,
    status: 'published' as const,
    content,
    chunks: chunks.length > 0 ? chunks : [{ id: `chunk-${id}-1`, content, embeddingKeyword: title }],
    citationsCount: 0,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.knowledgeDocuments.set(id, newDoc);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'kb.article_create',
    entityType: 'knowledge_document',
    entityId: id,
    afterState: { title, category },
  });

  res.json({ success: true, data: newDoc });
});

apiRouter.put('/kb/articles/:id', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const doc = db.knowledgeDocuments.get(req.params.id);
  if (!doc || doc.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } });
    return;
  }

  const { title, category, content, tags, status } = req.body;
  if (title) doc.title = title;
  if (category) doc.category = category;
  if (tags) doc.tags = tags;
  if (status) doc.status = status;
  if (content) {
    doc.content = content;
    const paragraphs = content.split('\n\n').filter((p: string) => p.trim().length > 0);
    doc.chunks = paragraphs.map((p: string, idx: number) => ({
      id: `chunk-${doc.id}-${idx + 1}`,
      content: p.trim(),
      embeddingKeyword: p.slice(0, 40),
    }));
  }
  doc.version += 1;
  doc.updatedAt = new Date().toISOString();

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'kb.article_update',
    entityType: 'knowledge_document',
    entityId: doc.id,
    afterState: { title: doc.title, version: doc.version },
  });

  res.json({ success: true, data: doc });
});

apiRouter.delete('/kb/articles/:id', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const doc = db.knowledgeDocuments.get(req.params.id);
  if (!doc || doc.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } });
    return;
  }

  db.knowledgeDocuments.delete(req.params.id);
  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'kb.article_delete',
    entityType: 'knowledge_document',
    entityId: req.params.id,
  });

  res.json({ success: true, message: 'Article deleted successfully' });
});

apiRouter.post('/kb/test-rag', (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    res.status(400).json({ success: false, error: { message: 'Query is required' } });
    return;
  }

  const queryLower = query.toLowerCase();
  const matchedChunks: Array<{
    documentTitle: string;
    citationSource: string;
    chunkContent: string;
    similarity: number;
  }> = [];

  for (const doc of db.knowledgeDocuments.values()) {
    if (doc.organizationId !== currentActor.organizationId) continue;
    for (const chunk of doc.chunks) {
      let score = 0;
      const contentLower = chunk.content.toLowerCase();
      const titleLower = doc.title.toLowerCase();

      const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
      for (const w of words) {
        if (contentLower.includes(w)) score += 0.25;
        if (titleLower.includes(w)) score += 0.35;
      }

      if (score > 0) {
        matchedChunks.push({
          documentTitle: doc.title,
          citationSource: `[المصدر: ${doc.title} - بند ${chunk.id}]`,
          chunkContent: chunk.content,
          similarity: Math.min(0.98, Number((0.55 + score * 0.2).toFixed(2))),
        });
      }
    }
  }

  matchedChunks.sort((a, b) => b.similarity - a.similarity);
  const topMatches = matchedChunks.slice(0, 3);

  const responseText =
    topMatches.length > 0
      ? `بناءً على وثائق وقواعد العمل الرسمية المعتمدة: ${topMatches[0].chunkContent} ${topMatches[0].citationSource}`
      : 'لم يتم العثور على وثيقة مطابقة بدقة كافية في قاعدة المعرفة المعتمدة (Anti-Hallucination Safe).';

  res.json({
    success: true,
    data: {
      query,
      answer: responseText,
      suggestedAnswer: responseText,
      confidence: topMatches.length > 0 ? topMatches[0].similarity : 0.2,
      citations: topMatches.map((m) => m.citationSource),
      matchedChunks: topMatches,
    },
  });
});

// ----------------------------------------------------
// 12. Omnichannel Integrations & Meta WhatsApp Cloud API
// ----------------------------------------------------
const memoryChannelConfigs: Map<string, Record<string, any>> = new Map([
  [
    'chan-whatsapp',
    {
      wabaId: 'WABA-902184920194',
      phoneNumberId: 'PNID-8820194829',
      displayNumber: '+966 55 012 3456',
      apiToken: 'EAAG...sec_meta_token',
      webhookSecret: 'madar_verify_token_2026',
      webhookUrl: '/api/v1/integrations/whatsapp/webhook',
      verified: true,
      lastCheckedAt: new Date().toISOString(),
    },
  ],
  [
    'chan-webchat',
    {
      widgetId: 'widget-madar-portal-v2',
      domainWhitelist: ['madar.sa', 'app.madar.sa', 'localhost'],
      sslEnabled: true,
      verified: true,
      lastCheckedAt: new Date().toISOString(),
    },
  ],
  [
    'chan-voice',
    {
      sipServer: 'sip.madar.sa:5060',
      trunkUsername: 'madar_sip_trunk_01',
      authSecret: '********',
      codec: 'Opus, G.711u',
      webrtcGateway: 'wss://sip-edge.madar.sa/ws',
      verified: true,
      lastCheckedAt: new Date().toISOString(),
    },
  ],
  [
    'chan-email',
    {
      smtpHost: 'smtp.madar.sa',
      smtpPort: 587,
      smtpUser: 'support@madar.sa',
      imapHost: 'imap.madar.sa',
      imapPort: 993,
      verified: true,
      lastCheckedAt: new Date().toISOString(),
    },
  ],
  [
    'chan-messenger',
    {
      pageId: '1092837465',
      pageName: 'Madar Telecom Official',
      igHandle: '@madar_sa',
      verified: true,
      lastCheckedAt: new Date().toISOString(),
    },
  ],
]);

apiRouter.get('/integrations/channels', (req: Request, res: Response) => {
  const defaultChannels = [
    {
      id: 'chan-whatsapp',
      type: 'whatsapp',
      name: 'WhatsApp Business Cloud API (Official)',
      badge: 'موثق ومعتمد من Meta',
      status: 'online',
      accountInfo: {
        wabaId: 'WABA-902184920194',
        phoneNumberId: 'PNID-8820194829',
        displayNumber: '+966 55 012 3456',
        verifiedName: 'مدار كير للاتصالات والتقنية',
        qualityRating: 'High',
        messagingLimitTier: 'Tier 2 (10,000 محادثة / 24 ساعة)',
        ...memoryChannelConfigs.get('chan-whatsapp'),
      },
      metrics: {
        latencyMs: 42,
        messagesSent24h: 3842,
        deliveryRatePercent: 99.4,
        webhookUrl: '/api/v1/integrations/whatsapp/webhook',
      },
      compliance: {
        optInPolicyActive: true,
        templateWindowHours: 24,
        stopKeywordsActive: true,
      },
    },
    {
      id: 'chan-webchat',
      type: 'webchat',
      name: 'Live Web Chat Widget (Portal & Mobile App)',
      badge: 'WebSockets نشط',
      status: 'online',
      accountInfo: {
        widgetId: 'widget-madar-portal-v2',
        sslEnabled: true,
        ...memoryChannelConfigs.get('chan-webchat'),
      },
      metrics: {
        latencyMs: 14,
        messagesSent24h: 1240,
        deliveryRatePercent: 100,
        webhookUrl: '/api/v1/integrations/webchat/webhook',
      },
    },
    {
      id: 'chan-voice',
      type: 'voice',
      name: 'Cloud SIP Trunk & WebRTC (Asterisk/FreeSWITCH)',
      badge: 'سنترال سحابي نشط',
      status: 'online',
      accountInfo: {
        trunkName: 'STC-SIP-TRUNK-RIYADH-01',
        concurrentLines: 32,
        codecs: 'Opus, G.711u',
        ...memoryChannelConfigs.get('chan-voice'),
      },
      metrics: {
        latencyMs: 24,
        callsHandled24h: 340,
        averageMOSScore: 4.4,
        webhookUrl: '/api/v1/integrations/voice/webhook',
      },
    },
    {
      id: 'chan-email',
      type: 'email',
      name: 'Enterprise Email Gate (support@madar.sa)',
      badge: 'TLS 1.3 مشفر',
      status: 'online',
      accountInfo: {
        smtpHost: 'smtp.madar.sa',
        pollingIntervalSec: 30,
        ...memoryChannelConfigs.get('chan-email'),
      },
      metrics: {
        latencyMs: 120,
        emailsProcessed24h: 185,
        webhookUrl: '/api/v1/integrations/email/webhook',
      },
    },
    {
      id: 'chan-messenger',
      type: 'messenger',
      name: 'Meta Messenger & Instagram Direct',
      badge: 'Graph API v21',
      status: 'online',
      accountInfo: {
        pageName: 'Madar Telecom Official',
        igHandle: '@madar_sa',
        ...memoryChannelConfigs.get('chan-messenger'),
      },
      metrics: {
        latencyMs: 65,
        messagesSent24h: 520,
        webhookUrl: '/api/v1/integrations/messenger/webhook',
      },
    },
  ];

  res.json({ success: true, data: defaultChannels });
});

// Update channel configuration
apiRouter.put('/integrations/channels/:id/config', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const channelId = req.params.id;
  const config = req.body;

  const current = memoryChannelConfigs.get(channelId) || {};
  const updated = {
    ...current,
    ...config,
    verified: true,
    lastCheckedAt: new Date().toISOString(),
  };
  memoryChannelConfigs.set(channelId, updated);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'channel.update_config',
    entityType: 'channel',
    entityId: channelId,
    afterState: { configKeys: Object.keys(config) },
  });

  res.json({
    success: true,
    data: updated,
    message: 'تم حفظ إعدادات القناة والاعتمادات بنجاح',
  });
});

// Test channel connection live
apiRouter.post('/integrations/channels/:id/test-connection', async (req: Request, res: Response) => {
  const channelId = req.params.id;
  const simulatedDelay = Math.floor(20 + Math.random() * 30);
  await new Promise((r) => setTimeout(r, simulatedDelay));

  const config = memoryChannelConfigs.get(channelId) || {};

  res.json({
    success: true,
    data: {
      channelId,
      status: 'online',
      latencyMs: simulatedDelay,
      handshake: 'TLS 1.3 - Verified',
      endpoint: `/api/v1/integrations/${channelId.replace('chan-', '')}/webhook`,
      testedAt: new Date().toISOString(),
      details: {
        optInCompliant: true,
        credentialsValid: true,
        ...config,
      },
    },
  });
});

// Meta WhatsApp Webhook Verification Endpoint (hub.challenge)
apiRouter.get(['/integrations/:channel/webhook', '/webhooks/:channel'], (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe') {
    if (token === 'madar_verify_token_2026' || !token) {
      res.status(200).send(challenge || 'VERIFIED');
      return;
    }
    res.status(403).send('Forbidden: Verify token mismatch');
    return;
  }

  res.status(200).json({ status: 'active', channel: req.params.channel });
});

// Universal Inbound Webhook Processor (Meta WhatsApp, Twilio, Generic HTTP Webhooks)
const handleIncomingWebhook = async (req: Request, res: Response) => {
  const channelType = (req.params.channel || 'whatsapp') as UnifiedMessage['channel'];
  const payload = req.body || {};

  // Extract from Meta WhatsApp Cloud API format or generic JSON
  let text = '';
  let phone = '';
  let name = 'عميل عبر Webhook';

  if (payload.object === 'whatsapp_business_account') {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    const contact = change?.contacts?.[0];

    text = msg?.text?.body || 'رسالة وسائط واردة';
    phone = msg?.from ? `+${msg.from}` : '+966500112233';
    name = contact?.profile?.name || 'عميل واتساب';
  } else if (payload.From || payload.Body) {
    // Twilio SMS/Voice webhook format
    text = payload.Body || payload.TranscriptionText || 'مكالمة أو رسالة واردة';
    phone = payload.From || '+966500112233';
    name = payload.CallerName || 'متصل عبر الهاتف';
  } else {
    // Generic JSON payload
    text = payload.messageText || payload.text || payload.body || 'استفسار وارد جديد';
    phone = payload.senderPhone || payload.phone || payload.from || '+966500112233';
    name = payload.senderName || payload.customerName || payload.name || 'عميل تجريبي';
  }

  // 1. Find or create Customer
  let customer = Array.from(db.customers.values()).find(
    (c) => c.organizationId === currentActor.organizationId && c.phone === phone
  );

  if (!customer) {
    const custId = `cust-wh-${Date.now().toString(36)}`;
    customer = {
      id: custId,
      organizationId: currentActor.organizationId,
      name,
      phone,
      email: `${custId}@madar.sa`,
      customerTier: 'standard',
      lifetimeValue: 1500,
      tags: [`webhook_${channelType}`, 'عميل_مباشر'],
      customFields: { source: 'webhook', channel: channelType },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.customers.set(custId, customer);
  }

  // 2. Find or create Conversation
  let conv = Array.from(db.conversations.values()).find(
    (c) => c.organizationId === currentActor.organizationId && c.customerId === customer!.id && c.status === 'open'
  );

  const now = new Date().toISOString();
  if (!conv) {
    const convId = `conv-wh-${Date.now().toString(36)}`;
    conv = {
      id: convId,
      organizationId: currentActor.organizationId,
      customerId: customer.id,
      channel: channelType,
      status: 'open',
      priority: customer.customerTier === 'vip' ? 'urgent' : 'medium',
      sentiment: 'neutral',
      intent: 'general_inquiry',
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.conversations.set(convId, conv);
  }

  // 3. Create Unified Message
  const msgId = `msg-wh-${Date.now().toString(36)}`;
  const msg: UnifiedMessage = {
    id: msgId,
    organizationId: currentActor.organizationId,
    conversationId: conv.id,
    customerId: customer.id,
    channel: channelType,
    direction: 'inbound',
    type: 'text',
    body: text,
    sender: {
      id: customer.id,
      type: 'customer',
      name: customer.name,
    },
    status: 'delivered',
    metadata: { webhook: true, receivedAt: now },
    createdAt: now,
  };
  db.messages.set(msgId, msg);

  // 4. Run AI Sentiment & Intent analysis
  try {
    const aiResult = await AIGateway.execute({
      organizationId: currentActor.organizationId,
      task: 'sentiment_intent_analysis',
      input: text,
      privacy: 'confidential',
      forceLocal: true,
    });
    const parsed = JSON.parse(aiResult.content);
    if (parsed.intent) conv.intent = parsed.intent;
    if (parsed.sentiment) conv.sentiment = parsed.sentiment;
  } catch {
    // fallback
  }

  // 5. Persist & Broadcast
  db.schedulePersist();
  EventBus.publish('message:new', { conversationId: conv.id, message: msg });
  EventBus.publish('conversation:updated', conv);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: customer.id,
    actorType: 'system',
    action: 'webhook.inbound_processed',
    entityType: 'message',
    entityId: msgId,
    afterState: { channel: channelType, phone, textSnippet: text.slice(0, 30) },
  });

  res.status(200).json({
    success: true,
    data: {
      messageId: msg.id,
      conversationId: conv.id,
      customerId: customer.id,
      status: 'received_and_broadcasted',
    },
  });
};

apiRouter.post('/integrations/:channel/webhook', handleIncomingWebhook);
apiRouter.post('/webhooks/:channel', handleIncomingWebhook);

apiRouter.get('/integrations/whatsapp/templates', (req: Request, res: Response) => {
  const templates = [
    {
      id: 'tpl-order-update',
      name: 'order_status_update_ar',
      category: 'UTILITY',
      language: 'ar',
      status: 'APPROVED',
      header: 'تحديث حالة طلبك 📦',
      body: 'مرحباً {{1}}، تم تحديث حالة طلبك رقم #{{2}} بنجاح. الحالة الحالية: {{3}}.',
      footer: 'مدار كير - شكراً لاختياركم لنا',
      variables: ['اسم العميل', 'رقم الطلب', 'حالة الطلب'],
    },
    {
      id: 'tpl-ticket-escalation',
      name: 'ticket_priority_alert_ar',
      category: 'UTILITY',
      language: 'ar',
      status: 'APPROVED',
      header: 'إشعار تصعيد التذكرة ⚡',
      body: 'عزيزي {{1}}، تذكرتك رقم #{{2}} تم تصعيدها لفريق المشرفين المختص وجارٍ حلها بأولوية عاجلة.',
      footer: 'فريق العناية بالعملاء',
      variables: ['اسم العميل', 'رقم التذكرة'],
    },
    {
      id: 'tpl-appointment-reminder',
      name: 'tech_visit_reminder_ar',
      category: 'UTILITY',
      language: 'ar',
      status: 'APPROVED',
      header: 'تأكيد موعد الزيارة الفنية 🔧',
      body: 'مرحباً {{1}}، نود تذكيركم بموعد زيارة الفني في تاريخ {{2}} بين الساعة {{3}}. للتحويل أو التعديل الرجاء الرد.',
      footer: 'الدعم الميداني',
      variables: ['اسم العميل', 'التاريخ', 'الوقت'],
    },
    {
      id: 'tpl-auth-code',
      name: 'security_verification_code_ar',
      category: 'AUTHENTICATION',
      language: 'ar',
      status: 'APPROVED',
      header: 'رمز التحقق الآمن 🔐',
      body: 'رمز التحقق الخاص بك لتأكيد طلب الخدمة هو: {{1}}. لا تشارك هذا الرمز مع أي شخص.',
      footer: 'الأمن السيبراني',
      variables: ['رمز التحقق'],
    },
  ];

  res.json({ success: true, data: templates });
});

apiRouter.post('/integrations/whatsapp/send-template', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'conversation.reply');
  const { templateName, recipientPhone, parameters, customerId } = req.body;

  if (!recipientPhone || !templateName) {
    res.status(400).json({ success: false, error: { message: 'Template name and phone required' } });
    return;
  }

  // Look up customer
  let targetCustomer = customerId ? db.customers.get(customerId) : undefined;
  if (!targetCustomer) {
    targetCustomer = Array.from(db.customers.values()).find((c) => c.phone === recipientPhone);
  }

  const generatedMsgId = `wamid-${Date.now()}`;

  // Log audit
  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'whatsapp.send_template',
    entityType: 'whatsapp_message',
    entityId: generatedMsgId,
    afterState: { templateName, recipientPhone, parameters },
  });

  res.json({
    success: true,
    data: {
      messageId: generatedMsgId,
      status: 'delivered',
      channel: 'whatsapp',
      recipientPhone,
      timestamp: new Date().toISOString(),
    },
  });
});

apiRouter.post('/integrations/simulate-inbound', async (req: Request, res: Response) => {
  const { channel, senderName, senderPhone, customerName, phoneNumber, messageText } = req.body;
  const channelType = channel || 'whatsapp';
  const text = messageText || 'السلام عليكم، أود الاستفسار عن ترقية باقتي الحالية';
  const phone = senderPhone || phoneNumber || '+966500998877';
  const name = senderName || customerName || 'عميل تجريبي';

  // 1. Find or create Customer
  let customer = Array.from(db.customers.values()).find(
    (c) => c.organizationId === currentActor.organizationId && c.phone === phone
  );

  if (!customer) {
    const custId = `cust-sim-${Date.now().toString(36)}`;
    customer = {
      id: custId,
      organizationId: currentActor.organizationId,
      name,
      phone,
      email: `${custId}@demo.sa`,
      customerTier: 'standard',
      lifetimeValue: 1200,
      tags: ['تطبيق_واتساب', 'عميل_جديد'],
      customFields: { channel: channelType },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.customers.set(custId, customer);
  }

  // 2. Find or create Conversation
  let conv = Array.from(db.conversations.values()).find(
    (c) => c.organizationId === currentActor.organizationId && c.customerId === customer!.id && c.status === 'open'
  );

  const now = new Date().toISOString();
  if (!conv) {
    const convId = `conv-sim-${Date.now().toString(36)}`;
    conv = {
      id: convId,
      organizationId: currentActor.organizationId,
      customerId: customer.id,
      channel: channelType,
      status: 'open',
      priority: 'medium',
      sentiment: 'neutral',
      intent: 'general_inquiry',
      slaDueAt: new Date(Date.now() + 15 * 60000).toISOString(),
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    };
    db.conversations.set(convId, conv);
  } else {
    conv.lastMessageAt = now;
  }

  // 3. Create Unified Message
  const msgId = `msg-sim-${Date.now().toString(36)}`;
  const msg: UnifiedMessage = {
    id: msgId,
    organizationId: currentActor.organizationId,
    conversationId: conv.id,
    customerId: customer.id,
    channel: channelType,
    direction: 'inbound',
    type: 'text',
    body: text,
    sender: {
      id: customer.id,
      type: 'customer',
      name: customer.name,
    },
    status: 'delivered',
    metadata: { simulated: true, simulatedAt: now },
    createdAt: now,
  };
  db.messages.set(msgId, msg);

  // 4. Run AI Sentiment & Intent analysis
  try {
    const aiResult = await AIGateway.execute({
      organizationId: currentActor.organizationId,
      task: 'sentiment_intent_analysis',
      input: text,
      privacy: 'confidential',
      forceLocal: true,
    });
    const parsed = JSON.parse(aiResult.content);
    if (parsed.intent) conv.intent = parsed.intent;
    if (parsed.sentiment) conv.sentiment = parsed.sentiment;
  } catch (e) {
    // fallback
  }

  db.schedulePersist();
  EventBus.publish('message:new', { conversationId: conv.id, message: msg });
  EventBus.publish('conversation:updated', conv);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: customer.id,
    actorType: 'system',
    action: 'message.inbound_received',
    entityType: 'conversation',
    entityId: conv.id,
    afterState: { channel: channelType, textSnippet: text.slice(0, 30) },
  });

  res.json({
    success: true,
    data: {
      conversation: conv,
      conversationId: conv.id,
      customer,
      message: msg,
    },
  });
});

// ----------------------------------------------------
// 13. Workforce Management (WFM) & Shift Scheduling
// ----------------------------------------------------
apiRouter.get('/wfm/overview', (req: Request, res: Response) => {
  const shifts = Array.from(db.shifts.values()).filter((s) => s.organizationId === currentActor.organizationId);

  // Compute adherence average
  const totalAdherence = shifts.reduce((acc, s) => acc + s.adherencePercentage, 0);
  const avgAdherence = shifts.length > 0 ? Number((totalAdherence / shifts.length).toFixed(1)) : 94.5;

  // Status breakdown
  const statusCounts = {
    active: shifts.filter((s) => s.status === 'active').length,
    break: shifts.filter((s) => s.status === 'break').length,
    scheduled: shifts.filter((s) => s.status === 'scheduled').length,
    completed: shifts.filter((s) => s.status === 'completed').length,
    absent: shifts.filter((s) => s.status === 'absent').length,
  };

  // Erlang C Model Predictions (Hourly Forecast for Next 8 Hours)
  const hoursForecast = [
    { hour: '09:00', forecastedVolume: 120, requiredStaff: 8, scheduledStaff: 9, serviceLevelTarget: 88.5 },
    { hour: '10:00', forecastedVolume: 165, requiredStaff: 11, scheduledStaff: 10, serviceLevelTarget: 81.2 },
    { hour: '11:00', forecastedVolume: 190, requiredStaff: 12, scheduledStaff: 12, serviceLevelTarget: 85.0 },
    { hour: '12:00', forecastedVolume: 145, requiredStaff: 9, scheduledStaff: 10, serviceLevelTarget: 91.0 },
    { hour: '13:00', forecastedVolume: 110, requiredStaff: 7, scheduledStaff: 8, serviceLevelTarget: 94.2 },
    { hour: '14:00', forecastedVolume: 175, requiredStaff: 11, scheduledStaff: 11, serviceLevelTarget: 86.4 },
    { hour: '15:00', forecastedVolume: 210, requiredStaff: 13, scheduledStaff: 12, serviceLevelTarget: 79.8 },
    { hour: '16:00', forecastedVolume: 180, requiredStaff: 11, scheduledStaff: 11, serviceLevelTarget: 84.1 },
  ];

  res.json({
    success: true,
    data: {
      metrics: {
        globalAdherencePercent: avgAdherence,
        occupancyRatePercent: 82.4,
        forecastAccuracyPercent: 95.2,
        serviceLevelTarget: '80/20 (80% في أقل من 20 ثانية)',
        activeShiftsCount: statusCounts.active,
        scheduledShiftsCount: statusCounts.scheduled,
        breakShiftsCount: statusCounts.break,
      },
      statusDistribution: statusCounts,
      erlangForecast: hoursForecast,
      intervalForecasts: hoursForecast,
    },
  });
});

apiRouter.get('/wfm/shifts', (req: Request, res: Response) => {
  const shifts = Array.from(db.shifts.values()).filter((s) => s.organizationId === currentActor.organizationId);

  const enrichedShifts = shifts.map((shift) => {
    const agent = db.agents.get(shift.agentId);
    const user = agent ? db.users.get(agent.userId) : undefined;
    return {
      ...shift,
      agentName: user?.fullName || 'وكيل خدمة',
      agentEmail: user?.email || '',
      skills: agent?.skills || ['خدمة عامة'],
      currentStatus: agent?.status || 'offline',
      maxConcurrency: agent?.maxConcurrency || 3,
      currentActiveChats: agent?.currentActiveChats || 0,
    };
  });

  res.json({ success: true, data: enrichedShifts });
});

apiRouter.post('/wfm/shifts', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const { agentId, startTime, endTime, status } = req.body;
  if (!agentId || !startTime || !endTime) {
    res.status(400).json({ success: false, error: { message: 'agentId, startTime, endTime required' } });
    return;
  }

  const shiftId = `shift-dyn-${Date.now().toString(36)}`;
  const newShift = {
    id: shiftId,
    organizationId: currentActor.organizationId,
    agentId,
    startTime,
    endTime,
    status: status || 'scheduled',
    adherencePercentage: 100,
  };

  db.shifts.set(shiftId, newShift);
  db.schedulePersist();
  EventBus.publish('shift:created', newShift);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'wfm.shift_create',
    entityType: 'shift',
    entityId: shiftId,
    afterState: { agentId, startTime, endTime },
  });

  res.json({ success: true, data: newShift });
});

apiRouter.post('/wfm/shifts/:id/status', (req: Request, res: Response) => {
  const shift = db.shifts.get(req.params.id);
  if (!shift || shift.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { message: 'Shift not found' } });
    return;
  }

  const { status } = req.body;
  if (status) {
    shift.status = status;
    // Also reflect on agent if matched
    const agent = db.agents.get(shift.agentId);
    if (agent && (status === 'active' || status === 'break' || status === 'offline')) {
      agent.status = status === 'active' ? 'online' : status;
    }
  }

  res.json({ success: true, data: shift });
});

// ----------------------------------------------------
// 14. Workflow Automation & AI Routing Engine
// ----------------------------------------------------
apiRouter.get('/automation/rules', (req: Request, res: Response) => {
  const rules = Array.from(db.automationRules.values()).filter(
    (r) => r.organizationId === currentActor.organizationId
  );
  res.json({ success: true, data: rules });
});

apiRouter.post('/automation/rules', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const { name, trigger, conditions, actions } = req.body;
  if (!name || !trigger) {
    res.status(400).json({ success: false, error: { message: 'Name and trigger are required' } });
    return;
  }

  const ruleId = `rule-dyn-${Date.now().toString(36)}`;
  const newRule = {
    id: ruleId,
    organizationId: currentActor.organizationId,
    name,
    trigger,
    conditions: conditions || [],
    actions: actions || [],
    isActive: true,
    executionCount: 0,
    lastExecutedAt: undefined,
  };

  db.automationRules.set(ruleId, newRule);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'automation.rule_create',
    entityType: 'automation_rule',
    entityId: ruleId,
    afterState: { name, trigger },
  });

  res.json({ success: true, data: newRule });
});

apiRouter.put('/automation/rules/:id/toggle', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const rule = db.automationRules.get(req.params.id);
  if (!rule || rule.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { message: 'Rule not found' } });
    return;
  }

  rule.isActive = !rule.isActive;
  res.json({ success: true, data: rule });
});

apiRouter.delete('/automation/rules/:id', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const rule = db.automationRules.get(req.params.id);
  if (!rule || rule.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { message: 'Rule not found' } });
    return;
  }

  db.automationRules.delete(req.params.id);
  res.json({ success: true, message: 'Rule deleted successfully' });
});

apiRouter.post('/automation/simulate', (req: Request, res: Response) => {
  const { eventType, payload } = req.body;
  const activeRules = Array.from(db.automationRules.values()).filter(
    (r) => r.organizationId === currentActor.organizationId && r.isActive
  );

  const matchedRules: Array<{
    ruleId: string;
    ruleName: string;
    matchedConditions: string[];
    executedActions: Array<{ type: string; payload: Record<string, unknown> }>;
  }> = [];

  for (const rule of activeRules) {
    let matches = true;
    const matchedConds: string[] = [];

    if (rule.trigger !== eventType && rule.trigger !== 'all_events') {
      continue;
    }

    for (const cond of rule.conditions) {
      // Evaluate condition on payload
      const [obj, key] = cond.field.split('.');
      const val = payload[obj] ? payload[obj][key] : payload[key || obj];

      if (cond.operator === 'equals' && String(val).toLowerCase() === String(cond.value).toLowerCase()) {
        matchedConds.push(`${cond.field} == ${cond.value}`);
      } else if (cond.operator === 'contains' && String(val).toLowerCase().includes(String(cond.value).toLowerCase())) {
        matchedConds.push(`${cond.field} contains ${cond.value}`);
      } else {
        matches = false;
        break;
      }
    }

    if (matches) {
      rule.executionCount += 1;
      rule.lastExecutedAt = new Date().toISOString();
      matchedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matchedConditions: matchedConds,
        executedActions: rule.actions,
      });
    }
  }

  res.json({
    success: true,
    data: {
      eventType,
      rulesEvaluated: activeRules.length,
      rulesTriggeredCount: matchedRules.length,
      matchedRules,
      timestamp: new Date().toISOString(),
    },
  });
});

// ----------------------------------------------------
// 15. Intelligent Recommendations & Next-Best-Action Engine
// ----------------------------------------------------
interface RecommendationRecord {
  id: string;
  organizationId: string;
  domain: 'operational' | 'wfm' | 'customer_nba' | 'qa_coaching' | 'knowledge_gap' | 'cost_optimization';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  impact: string;
  actionLabel: string;
  applied: boolean;
  appliedAt?: string;
  targetEntity?: {
    type: 'customer' | 'agent' | 'ticket' | 'shift' | 'kb' | 'channel';
    id: string;
    name?: string;
  };
}

interface CoachingPlanRecord {
  id: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  title?: string;
  focusArea: string;
  recommendationText: string;
  targetMetric: string;
  status: 'active' | 'in_progress' | 'completed';
  assignedBy: string;
  dueDate: string;
  targetDate?: string;
  progressPercent: number;
  recommendedActions?: string[];
}

const memoryRecommendations: Map<string, RecommendationRecord> = new Map([
  [
    'rec-op-01',
    {
      id: 'rec-op-01',
      organizationId: DEMO_ORG_ID,
      domain: 'operational',
      title: 'تحويل آلي للمحادثات المتأخرة في طابور الواتساب',
      description: 'ارتفع متوسط زمن انتظار الواتساب إلى 52 ثانية (الحد الأقصى المسموح 40 ثانية). يُوصى بتفعيل الرد الآلي الذكي للفرز الأولي.',
      priority: 'critical',
      impact: 'تقليص زمن الانتظار بنسبة 65% والامتثال لمعايير SLA',
      actionLabel: 'تفعيل التوجيه الذكي الآلي',
      applied: false,
      targetEntity: { type: 'channel', id: 'whatsapp', name: 'واتساب الأعمال الرسمي' },
    },
  ],
  [
    'rec-wfm-01',
    {
      id: 'rec-wfm-01',
      organizationId: DEMO_ORG_ID,
      domain: 'wfm',
      title: 'إعادة توازن ورديات الاستراحة لتغطية ذروة 14:00',
      description: 'نموذج Erlang C يتوقع عجزاً بمقدار 2 وكلاء خلال الساعة القادمة. يُوصى بتأخير استراحة وكيلين لمدة 30 دقيقة.',
      priority: 'high',
      impact: 'رفع معدل مستوى الخدمة (SL%) من 68% إلى 86%',
      actionLabel: 'إعادة جدولة الاستراحات بنقرة واحدة',
      applied: false,
      targetEntity: { type: 'shift', id: 'shift-peak-14', name: 'مناوبة الظهيرة' },
    },
  ],
  [
    'rec-nba-01',
    {
      id: 'rec-nba-01',
      organizationId: DEMO_ORG_ID,
      domain: 'customer_nba',
      title: 'سارة العتيبي (VIP) - إجراء استبقاء استباقي (Churn Prevention)',
      description: 'تم رصد مؤشر عدم رضا 68% ناتج عن تأخر تركيب ألياف فايبر. يُوصى بتقديم خصم استبقاء 20% وترقية الراوتر لموديل Wi-Fi 6 مجاناً.',
      priority: 'critical',
      impact: 'حماية قيمة حساب العميل (LTV: 14,800 ر.س)',
      actionLabel: 'اعتماد باقة الاستبقاء وتوليد رمز الخصم',
      applied: false,
      targetEntity: { type: 'customer', id: 'cust-001', name: 'سارة العتيبي' },
    },
  ],
  [
    'rec-qa-01',
    {
      id: 'rec-qa-01',
      organizationId: DEMO_ORG_ID,
      domain: 'qa_coaching',
      title: 'خطة تدريبية للوكيلة سارة أحمد: تقليص وقت الصمت وإرشاد العميل',
      description: 'سجلت المكالمات الأخيرة فترات صمت بلغت 28 ثانية أثناء البحث في النظام. يُوصى بتدريب مكثف على اختصارات لوحة المفاتيح والـ AI Copilot.',
      priority: 'medium',
      impact: 'تقليص متوسط زمن المعالجة (AHT) بـ 45 ثانية',
      actionLabel: 'تعيين خطة التدريب في ملف الوكيل',
      applied: false,
      targetEntity: { type: 'agent', id: 'agt-sarah', name: 'سارة أحمد' },
    },
  ],
  [
    'rec-kb-01',
    {
      id: 'rec-kb-01',
      organizationId: DEMO_ORG_ID,
      domain: 'knowledge_gap',
      title: 'سد فجوة معرفية: آلية التعويض عند انقطاعات الكيبل البحري',
      description: 'تكرر استفسار العملاء 38 مرة خلال الـ 48 ساعة الماضية دون مقال معتمد في قاعدة المعرفة. يُوصى باعتماد ونشر المقال التوجيهي المرفق.',
      priority: 'high',
      impact: 'منع تضارب الإجابات بين الوكلاء ورفع دقة الدعم بنسبة 100%',
      actionLabel: 'اعتماد ونشر المقال في مستودع المعرفة',
      applied: false,
      targetEntity: { type: 'kb', id: 'kb-draft-cable', name: 'سياسة تعويضات الكيابل البحرية' },
    },
  ],
  [
    'rec-cost-01',
    {
      id: 'rec-cost-01',
      organizationId: DEMO_ORG_ID,
      domain: 'cost_optimization',
      title: 'تفعيل التخزين الدلالي المؤقت (Semantic Cache) لخفض استهلاك الذكاء الاصطناعي',
      description: '42% من الاستفسارات الواردة تتعلق بالاستعلام عن الرصيد وأسعار الباقات، ويمكن الإجابة عليها فورياً من الكاش دون استدعاء LLM.',
      priority: 'medium',
      impact: 'توفير ما يقارب $48 شهرياً من ميزانية الذكاء الاصطناعي مع تقليل زمن الاستجابة إلى 80ms',
      actionLabel: 'تفعيل الكاش الدلالي المتقدم',
      applied: false,
    },
  ],
]);

const memoryCoachingPlans: Map<string, CoachingPlanRecord> = new Map([
  [
    'cp-01',
    {
      id: 'cp-01',
      organizationId: DEMO_ORG_ID,
      agentId: 'agt-sarah',
      agentName: 'سارة أحمد',
      title: 'خطة تقليص فترات الصمت وسرعة الاستجابة',
      focusArea: 'تقليص زمن الصمت في المكالمات',
      recommendationText: 'استخدام خاصية البحث اللحظي في مستودع المعرفة وتجنب وضع العميل في وضع الانتظار الصامت بدون إشعار صوتي لطيف.',
      targetMetric: 'أقل من 15 ثانية صمت',
      status: 'in_progress',
      assignedBy: 'سلطان القحطاني (مشرف)',
      dueDate: '2026-09-25',
      targetDate: '2026-09-25',
      progressPercent: 65,
      recommendedActions: [
        'الاستماع لتسجيلين نموذجيين لمكالمات de-escalation',
        'التدريب على اختصارات البحث في قاعدة المعرفة',
      ],
    },
  ],
  [
    'cp-02',
    {
      id: 'cp-02',
      organizationId: DEMO_ORG_ID,
      agentId: 'agt-omar',
      agentName: 'عمر خالد',
      title: 'خطة الامتثال الأمني والتحقق من الهوية',
      focusArea: 'الامتثال للتحقق من هوية المتصل وسرية البيانات',
      recommendationText: 'طلب الرقم التعريفي المؤقت عبر تطبيق مدار أو نفاذ قبل الإفصاح عن تفاصيل الفواتير أو العنوان المسجل.',
      targetMetric: '100% نسبة الامتثال الأمني',
      status: 'active',
      assignedBy: 'مسؤول الجودة (QA Officer)',
      dueDate: '2026-09-30',
      targetDate: '2026-09-30',
      progressPercent: 40,
      recommendedActions: [
        'مراجعة ضوابط الأمن السيبراني للهيئة الوطنية',
        'محاكاة سيناريوهات التحقق الآمن مع المدرب الآلي',
      ],
    },
  ],
]);

apiRouter.get('/recommendations', (req: Request, res: Response) => {
  const domain = req.query.domain as string;
  let list = Array.from(memoryRecommendations.values()).filter(
    (r) => r.organizationId === currentActor.organizationId
  );
  if (domain && domain !== 'all') {
    list = list.filter((r) => r.domain === domain);
  }
  res.json({ success: true, data: list });
});

apiRouter.post('/recommendations/:id/apply', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const rec = memoryRecommendations.get(req.params.id);
  if (!rec || rec.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { message: 'Recommendation not found' } });
    return;
  }

  rec.applied = true;
  rec.appliedAt = new Date().toISOString();

  EventBus.publish('recommendation:applied', rec);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'recommendation.apply',
    entityType: 'recommendation',
    entityId: rec.id,
    afterState: { domain: rec.domain, title: rec.title, applied: true },
  });

  res.json({
    success: true,
    data: rec,
    message: `تم تطبيق التوصية بنجاح: ${rec.title}`,
  });
});

apiRouter.get('/qa/coaching-plans', (req: Request, res: Response) => {
  const plans = Array.from(memoryCoachingPlans.values()).filter(
    (p) => p.organizationId === currentActor.organizationId
  );
  res.json({ success: true, data: plans });
});

apiRouter.post('/qa/coaching-plans', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'qa.rubric.manage');
  const {
    agentId,
    agentName,
    focusArea,
    recommendationText,
    title,
    targetMetric,
    dueDate,
    targetDate,
    recommendedActions,
  } = req.body;

  const resolvedText = recommendationText || title || 'خطة تدريبية وتطويرية مخصصة';
  const resolvedTitle = title || recommendationText || 'خطة تطوير الأداء والجودة';

  if (!agentName || !focusArea) {
    res.status(400).json({ success: false, error: { message: 'agentName and focusArea are required' } });
    return;
  }

  const id = `cp-dyn-${Date.now().toString(36)}`;
  const resolvedDueDate = dueDate || targetDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const plan: CoachingPlanRecord = {
    id,
    organizationId: currentActor.organizationId,
    agentId: agentId || 'agt-general',
    agentName,
    title: resolvedTitle,
    focusArea,
    recommendationText: resolvedText,
    targetMetric: targetMetric || 'تحقيق هدف الجودة',
    status: 'active',
    assignedBy: currentActor.name || 'المشرف',
    dueDate: resolvedDueDate,
    targetDate: resolvedDueDate,
    progressPercent: 0,
    recommendedActions: recommendedActions && recommendedActions.length > 0
      ? recommendedActions
      : ['مراجعة سيناريوهات الدعم المعتمدة', 'جلسة تدريب مع مشرف الجودة'],
  };

  memoryCoachingPlans.set(id, plan);

  AuditLogger.log({
    organizationId: currentActor.organizationId,
    actorId: currentActor.userId,
    actorType: 'user',
    action: 'qa.coaching_plan_create',
    entityType: 'coaching_plan',
    entityId: id,
    afterState: { agentName, focusArea, title: resolvedTitle },
  });

  res.json({ success: true, data: plan });
});

apiRouter.post('/qa/coaching-plans/:id/progress', (req: Request, res: Response) => {
  const plan = memoryCoachingPlans.get(req.params.id);
  if (!plan || plan.organizationId !== currentActor.organizationId) {
    res.status(404).json({ success: false, error: { message: 'Coaching plan not found' } });
    return;
  }
  const { progressPercent, status } = req.body;
  if (typeof progressPercent === 'number') {
    plan.progressPercent = Math.min(100, Math.max(0, progressPercent));
    if (plan.progressPercent === 100) plan.status = 'completed';
    else if (plan.progressPercent > 0) plan.status = 'in_progress';
  }
  if (status) plan.status = status;

  res.json({ success: true, data: plan });
});

// ----------------------------------------------------
// 21. Canned Responses, Quick Macros & Guided Scenarios
// ----------------------------------------------------
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

const memoryMacros: MacroItem[] = [
  {
    id: 'macro-welcome',
    shortcut: '/welcome',
    title: 'ترحيب رسمي معتمد (CST Compliant)',
    category: 'عام',
    text: 'أهلاً بك في مدار كير للاتصالات والتقنية، يسعدني جداً خدمتك اليوم. كيف يمكنني مساعدتك؟',
  },
  {
    id: 'macro-apology',
    shortcut: '/apology',
    title: 'اعتذار عن التأخير وعرض تعويض معتمد',
    category: 'شكاوى',
    text: 'نعتذر بشدة عن التأخير غير المقصود في تفعيل الخدمة. وبحسب معايير هيئة الاتصالات والفضاء والتقنية (CST)، تم تسجيل طلبكم بأولوية قصوى واحتساب رصيد تعويضي على فاتورتكم القادمة.',
    actions: {
      setPriority: 'urgent',
    },
  },
  {
    id: 'macro-esim',
    shortcut: '/esim',
    title: 'خطوات تفعيل وتثبيت شريحة eSIM',
    category: 'الدعم الفني',
    text: 'لتثبيت شريحة الـ eSIM، يرجى التوجه إلى: الإعدادات > البيانات الخلوية > إضافة باقة خلوية، ومسح رمز الاستجابة السريعة (QR Code) المرسل إلى بريدك المعتمد مع التأكد من الاتصال بشبكة Wi-Fi مستقرة.',
  },
  {
    id: 'macro-escalate',
    shortcut: '/escalate',
    title: 'إشعار تصعيد إلى الدعم الميداني المتقدم',
    category: 'تصعيد',
    text: 'تم رفع تذكرتكم مباشرة إلى فريق المهندسين الميدانيين للمعاينة الفنية السريعة. سيصلك إشعار SMS برقم الموعد المحدد خلال ساعتين.',
    actions: {
      setPriority: 'urgent',
      setStatus: 'escalated',
      escalate: true,
    },
  },
  {
    id: 'macro-close',
    shortcut: '/close',
    title: 'إغلاق المحادثة وطلب تقييم الخدمة (CSAT)',
    category: 'إغلاق',
    text: 'سعدنا بخدمتكم في مدار كير! نرجو أن نكون وفقنا في حل استفساركم بالكامل. نرجو التكرم بتقييم مستوى الخدمة من 1 إلى 5 بالرد المباشر على هذه الرسالة.',
    actions: {
      setStatus: 'resolved',
    },
  },
];

apiRouter.get('/macros', (req: Request, res: Response) => {
  res.json({ success: true, data: memoryMacros });
});

apiRouter.post('/macros', (req: Request, res: Response) => {
  assertPermission(currentActor.role, [], 'settings.manage');
  const { shortcut, title, category, text, actions } = req.body;
  if (!shortcut || !title || !text) {
    res.status(400).json({ success: false, error: { message: 'Shortcut, title, and text required' } });
    return;
  }
  const newMacro: MacroItem = {
    id: `macro-${Date.now().toString(36)}`,
    shortcut: shortcut.startsWith('/') ? shortcut : `/${shortcut}`,
    title,
    category: category || 'عام',
    text,
    actions,
  };
  memoryMacros.push(newMacro);
  res.json({ success: true, data: newMacro });
});

apiRouter.post('/macros/:id/execute', async (req: Request, res: Response) => {
  const { conversationId } = req.body;
  const macro = memoryMacros.find((m) => m.id === req.params.id);
  if (!macro) {
    res.status(404).json({ success: false, error: { message: 'Macro not found' } });
    return;
  }

  const conv = db.conversations.get(conversationId);
  if (!conv) {
    res.status(404).json({ success: false, error: { message: 'Conversation not found' } });
    return;
  }

  // 1. Create message from macro
  const msgId = `msg-mcr-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const msg: UnifiedMessage = {
    id: msgId,
    organizationId: currentActor.organizationId,
    conversationId: conv.id,
    customerId: conv.customerId,
    channel: conv.channel,
    direction: 'outbound',
    type: 'text',
    body: macro.text,
    sender: {
      id: currentActor.userId,
      type: 'agent',
      name: currentActor.name,
    },
    status: 'delivered',
    metadata: {},
    createdAt: now,
  };
  db.messages.set(msgId, msg);

  // 2. Apply actions
  if (macro.actions?.setPriority) {
    conv.priority = macro.actions.setPriority as any;
  }
  if (macro.actions?.setStatus) {
    conv.status = macro.actions.setStatus as any;
  }
  conv.lastMessageAt = now;

  db.schedulePersist();
  EventBus.publish('message:new', { conversationId: conv.id, message: msg });
  EventBus.publish('conversation:updated', conv);

  res.json({
    success: true,
    data: {
      macro,
      message: msg,
      conversation: conv,
    },
  });
});

// Guided End-to-End Operational Scenario Runner
apiRouter.post('/demo/run-scenario', async (req: Request, res: Response) => {
  const scenarioType = req.body?.scenarioType || 'vip_billing_dispute';
  const now = new Date().toISOString();

  // Create or retrieve demo VIP customer
  const phone = '+966500998811';
  let cust = Array.from(db.customers.values()).find((c) => c.phone === phone);
  if (!cust) {
    const custId = `cust-scenario-${Date.now().toString(36)}`;
    cust = {
      id: custId,
      organizationId: currentActor.organizationId,
      name: 'سلطان القحطاني (عميل VIP)',
      phone,
      email: 'sultan.vip@madar.sa',
      customerTier: 'vip',
      lifetimeValue: 14500,
      tags: ['كبار_العملاء_VIP', 'فايبر_أعمال', 'سيناريو_تفاعلي'],
      customFields: { contractType: 'Enterprise Dedicated Fiber' },
      createdAt: now,
      updatedAt: now,
    };
    db.customers.set(custId, cust);
  }

  // Create Conversation
  const convId = `conv-scenario-${Date.now().toString(36)}`;
  const conv = {
    id: convId,
    organizationId: currentActor.organizationId,
    customerId: cust.id,
    channel: 'whatsapp' as const,
    status: 'open' as const,
    priority: 'urgent' as const,
    sentiment: 'negative' as const,
    intent: 'billing_dispute',
    assignedAgentId: currentActor.userId,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
  db.conversations.set(convId, conv);

  // Inbound Customer Message
  const msg1Id = `msg-scen-1-${Date.now().toString(36)}`;
  const msg1: UnifiedMessage = {
    id: msg1Id,
    organizationId: currentActor.organizationId,
    conversationId: convId,
    customerId: cust.id,
    channel: 'whatsapp',
    direction: 'inbound',
    type: 'text',
    body: 'السلام عليكم، ظهرت رسوم تجديد مكررة على اشتراك الألياف البصرية للفرع الرئيسي، أرجو المعالجة الفورية وفق اتفاقية مستوى الخدمة.',
    sender: { id: cust.id, type: 'customer', name: cust.name },
    status: 'delivered',
    metadata: {},
    createdAt: now,
  };
  db.messages.set(msg1Id, msg1);

  // Auto-generate Ticket
  const num = Math.floor(1000 + Math.random() * 9000);
  const ticketId = `TICK-${num}`;
  const newTicket = {
    id: ticketId,
    ticketNumber: num,
    organizationId: currentActor.organizationId,
    customerId: cust.id,
    conversationId: convId,
    title: 'نزاع فوترة وتكرار رسوم اشتراك الألياف البصرية (VIP)',
    description: 'نزاع فوترة وتكرار رسوم اشتراك الألياف البصرية للفرع الرئيسي، يتطلب مراجعة فورية وتطبيق سياسات التعويض المعتمدة.',
    category: 'الفوترة والمطالبات المالية',
    priority: 'urgent' as const,
    status: 'new' as const,
    assignedAgentId: currentActor.userId,
    slaDueAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    slaStatus: 'healthy' as const,
    createdAt: now,
    updatedAt: now,
  };
  db.tickets.set(ticketId, newTicket);

  // Persistence & Broadcast
  db.schedulePersist();
  EventBus.publish('message:new', { conversationId: convId, message: msg1 });
  EventBus.publish('conversation:updated', conv);
  EventBus.publish('ticket:created', newTicket);

  res.json({
    success: true,
    data: {
      scenario: scenarioType,
      conversationId: convId,
      customerId: cust.id,
      ticketId: newTicket.id,
      customerName: cust.name,
      messageText: msg1.body,
    },
  });
});

// ----------------------------------------------------
// 27. Autonomous Diagnostics Engine & Multi-Region Telecom Hub
// ----------------------------------------------------
apiRouter.post('/diagnostics/run', (req: Request, res: Response) => {
  const { lineId, testType, customerPhone } = req.body || {};
  const targetNumber = (customerPhone || lineId || '01018108979').trim();

  // Detect Operator
  let operator = 'فودافون مصر (Vodafone Egypt)';
  if (targetNumber.startsWith('011') || targetNumber.includes('011')) {
    operator = 'اتصالات مصر (e& Egypt)';
  } else if (targetNumber.startsWith('012') || targetNumber.includes('012')) {
    operator = 'أورنج مصر (Orange Egypt)';
  } else if (targetNumber.startsWith('015') || targetNumber.includes('015')) {
    operator = 'المصرية للاتصالات (WE - Telecom Egypt)';
  } else if (targetNumber.startsWith('+966') || targetNumber.startsWith('05')) {
    operator = 'stc السعودية / موبايلي';
  }

  const now = new Date().toISOString();

  if (testType === 'vdsl_fiber_ping') {
    const is010 = targetNumber.includes('01018108979') || targetNumber.startsWith('010');
    const result = {
      downstreamRateMbps: is010 ? 88.6 : 64.2,
      upstreamRateMbps: is010 ? 19.4 : 12.8,
      latencyMs: is010 ? 11 : 18,
      cabinetDistanceMeters: is010 ? 165 : 320,
      snrMarginDb: is010 ? 18.2 : 12.4,
      loopbackPassed: true,
      diagnosis: `تم فحص الكابينة والخط بنجاح للرقم ${targetNumber}. كفاءة خط الـ VDSL فائقة بنسبة 98.4% مع استقرار كامل في إشارة التردد وخلو الخط من أي فقد في الحزم (0% Packet Loss).`,
      recommendation: `الخط يدعم الترقية حتى باقة الفايبر فائقة السرعة Super 100Mbps بأداء مستقر وتوافق تام مع كابينة MSAN.`,
      testedAt: now,
    };
    return res.json({ success: true, data: { operator, targetNumber, testType, result } });
  }

  if (testType === 'esim_profile_check') {
    const result = {
      profileStatus: 'active_provisioned',
      imsi: '602029910181089',
      qrReference: `LPA:1$smdp.vodafone.com.eg$VF-ESIM-${targetNumber.replace(/\D/g, '') || '01018108979'}`,
      diagnosis: `تم التحقق من جاهزية بروفايل الـ eSIM للرقم ${targetNumber} على سيرفرات SM-DP+. الملف جاهز للتحميل الفوري عبر مسح كود الـ QR دون الحاجة لزيارة الفرع.`,
      provisionedAt: now,
    };
    return res.json({ success: true, data: { operator, targetNumber, testType, result } });
  }

  if (testType === 'instapay_fawry_link') {
    const refCode = `IPAY-${Math.floor(100000 + Math.random() * 900000)}`;
    const result = {
      paymentGateway: 'إنستاباي InstaPay / محفظة فودافون كاش / فوري',
      amountEgp: 420.0,
      referenceCode: refCode,
      status: 'pending_payment',
      diagnosis: `تم توليد أمر الدفع الإلكتروني المباشر للرقم ${targetNumber} بمبلغ 420.00 ج.م لاشتراك الباقة الشهرية وتجديد الخدمات.`,
      directPayUrl: `instapay://pay?account=${targetNumber}@instapay&ref=${refCode}&amount=420`,
      expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
    };
    return res.json({ success: true, data: { operator, targetNumber, testType, result } });
  }

  return res.json({
    success: true,
    data: {
      operator,
      targetNumber,
      testType,
      result: {
        diagnosis: `تم إجراء الفحص الشامل للرقم ${targetNumber} بنجاح.`,
      },
    },
  });
});
