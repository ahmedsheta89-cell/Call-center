/**
 * @file src/App.tsx
 * AI Contact Center OS - Main Enterprise Application Layout
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { SidebarNav, ActiveTab } from './components/SidebarNav.tsx';
import { LiveOpsDashboard } from './components/LiveOpsDashboard.tsx';
import { OmnichannelInbox } from './components/OmnichannelInbox.tsx';
import { VoiceSoftphone } from './components/VoiceSoftphone.tsx';
import { TicketsManager } from './components/TicketsManager.tsx';
import { Customer360View } from './components/Customer360View.tsx';
import { AIAnalystBenchmark } from './components/AIAnalystBenchmark.tsx';
import { QACoachingView } from './components/QACoachingView.tsx';
import { AuditLogView } from './components/AuditLogView.tsx';
import { KnowledgeBaseView } from './components/KnowledgeBaseView.tsx';
import { ChannelIntegrationsView } from './components/ChannelIntegrationsView.tsx';
import { WorkforceManagementView } from './components/WorkforceManagementView.tsx';
import { AutomationRulesView } from './components/AutomationRulesView.tsx';
import { RecommendationsHub } from './components/RecommendationsHub.tsx';
import { LiveMetrics, Agent, Conversation, Ticket, Customer, CallSession } from './types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('live_ops');
  const [currentRole, setCurrentRole] = useState<string>('Supervisor');
  const [zeroCostMode, setZeroCostMode] = useState<boolean>(false);
  const [aiSpend, setAiSpend] = useState<number>(18.45);
  const [aiBudget, setAiBudget] = useState<number>(250.0);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Primary Domain State
  const [metrics, setMetrics] = useState<LiveMetrics>({
    activeConversations: 25,
    activeCalls: 1,
    waitingQueue: 2,
    slaAtRiskCount: 2,
    agentsOnline: 9,
    agentsBusy: 3,
    serviceAvailabilityPercent: 99.8,
    aiComplianceAlerts: 1,
    openTicketsCount: 12,
  });

  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string>('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Initial Data Fetching
  const refreshOperations = () => {
    fetch('/api/v1/operations/live')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setMetrics(d.data.liveMetrics);
          setAiSpend(d.data.aiBudget.currentSpendUsd);
          setAiBudget(d.data.aiBudget.monthlyLimitUsd);
          setZeroCostMode(d.data.aiBudget.zeroCostMode);
        }
      })
      .catch(() => {});

    fetch('/api/v1/agents')
      .then((r) => r.json())
      .then((d) => d.success && setAgents(d.data))
      .catch(() => {});

    fetch('/api/v1/conversations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setConversations(d.data);
          if (!selectedConvId && d.data.length > 0) {
            setSelectedConvId(d.data[0].id);
          }
        }
      })
      .catch(() => {});

    fetch('/api/v1/tickets')
      .then((r) => r.json())
      .then((d) => d.success && setTickets(d.data))
      .catch(() => {});

    fetch('/api/v1/customers')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setCustomers(d.data);
          if (!selectedCustomerId && d.data.length > 0) {
            setSelectedCustomerId(d.data[0].id);
          }
        }
      })
      .catch(() => {});

    fetch('/api/v1/calls')
      .then((r) => r.json())
      .then((d) => d.success && setCalls(d.data))
      .catch(() => {});
  };

  useEffect(() => {
    refreshOperations();
    const interval = setInterval(refreshOperations, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleRoleChange = async (role: string) => {
    setCurrentRole(role);
    await fetch('/api/v1/auth/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    refreshOperations();
  };

  const handleToggleZeroCost = async () => {
    const newMode = !zeroCostMode;
    setZeroCostMode(newMode);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zeroCostMode: newMode }),
      });
      const data = await res.json();
      if (!data.success) {
        setZeroCostMode(!newMode);
      }
    } catch {
      setZeroCostMode(!newMode);
    }
  };

  const handleSendMessage = async (convId: string, body: string, isInternalNote: boolean) => {
    await fetch(`/api/v1/conversations/${convId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, isInternalNote }),
    });
    refreshOperations();
  };

  const handleCreateTicket = async (ticketData: any) => {
    const res = await fetch('/api/v1/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketData),
    });
    const d = await res.json();
    if (d.success) {
      refreshOperations();
    }
  };

  const handleEscalateTicket = async (ticketId: string) => {
    await fetch(`/api/v1/tickets/${ticketId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Escalated by supervisor' }),
    });
    refreshOperations();
  };

  const handleControlCall = async (callId: string, action: string, supervisorMode?: string) => {
    await fetch(`/api/v1/calls/${callId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, supervisorMode }),
    });
    refreshOperations();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white" dir="rtl">
      {/* Top Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        zeroCostMode={zeroCostMode}
        onToggleZeroCost={handleToggleZeroCost}
        aiSpend={aiSpend}
        aiBudget={aiBudget}
        onOpenSoftphone={() => setActiveTab('voice')}
        activeCallCount={metrics.activeCalls}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        customers={customers}
        tickets={tickets}
        conversations={conversations}
        onNavigateToCustomer={(customerId) => {
          setSelectedCustomerId(customerId);
          setActiveTab('customers');
        }}
        onNavigateToTicket={(_ticketId) => {
          setActiveTab('tickets');
        }}
        onNavigateToConversation={(convId) => {
          setSelectedConvId(convId);
          setActiveTab('inbox');
        }}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Right Sidebar Navigation (RTL First) */}
        <SidebarNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          openConversationsCount={metrics.activeConversations}
          activeCallsCount={metrics.activeCalls}
          slaAtRiskCount={metrics.slaAtRiskCount}
        />

        {/* Dynamic Tab Content View */}
        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'live_ops' && (
            <LiveOpsDashboard
              metrics={metrics}
              agents={agents}
              tickets={tickets}
              conversations={conversations}
              onSelectConversation={(id) => {
                setSelectedConvId(id);
                setActiveTab('inbox');
              }}
              onOpenSoftphone={() => setActiveTab('voice')}
              onNavigateToRecommendations={() => setActiveTab('recommendations')}
              userRole={currentRole}
            />
          )}

          {activeTab === 'inbox' && (
            <OmnichannelInbox
              conversations={conversations}
              selectedConvId={selectedConvId}
              onSelectConversation={setSelectedConvId}
              onSendMessage={handleSendMessage}
              zeroCostMode={zeroCostMode}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceSoftphone
              activeCalls={calls}
              onControlCall={handleControlCall}
              userRole={currentRole}
            />
          )}

          {activeTab === 'tickets' && (
            <TicketsManager
              tickets={tickets}
              customers={customers}
              onCreateTicket={handleCreateTicket}
              onEscalateTicket={handleEscalateTicket}
              userRole={currentRole}
            />
          )}

          {activeTab === 'customers' && (
            <Customer360View
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              onSelectCustomer={setSelectedCustomerId}
              onInitiateCall={(phone) => {
                setActiveTab('voice');
              }}
            />
          )}

          {activeTab === 'recommendations' && (
            <RecommendationsHub
              onNavigateToCustomer={(customerId) => {
                setSelectedCustomerId(customerId);
                setActiveTab('customers');
              }}
              onNavigateToWFM={() => setActiveTab('wfm')}
              onNavigateToQA={() => setActiveTab('qa')}
              onNavigateToKB={() => setActiveTab('knowledge_base')}
            />
          )}

          {activeTab === 'knowledge_base' && <KnowledgeBaseView />}

          {activeTab === 'integrations' && <ChannelIntegrationsView />}

          {activeTab === 'wfm' && <WorkforceManagementView />}

          {activeTab === 'automation' && <AutomationRulesView />}

          {activeTab === 'ai_analyst' && <AIAnalystBenchmark />}

          {activeTab === 'qa' && <QACoachingView />}

          {activeTab === 'audit' && <AuditLogView />}
        </main>
      </div>
    </div>
  );
}
