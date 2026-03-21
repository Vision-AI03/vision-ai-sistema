import { useEffect, useState, useCallback } from "react";
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import KanbanColumn from "@/components/crm/KanbanColumn";
import LeadCard from "@/components/crm/LeadCard";
import LeadDrawer from "@/components/crm/LeadDrawer";
import AddLeadDialog from "@/components/crm/AddLeadDialog";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

const COLUNAS = [
  { id: "novo", title: "Novo" },
  { id: "enriquecido", title: "Enriquecido" },
  { id: "contatado", title: "Contatado" },
  { id: "reuniao_agendada", title: "Reunião Agendada" },
  { id: "perdido", title: "Perdido" },
];

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase.from("leads").select("*").order("criado_em", { ascending: false });
    setLeads(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLeads]);

  function getLeadsByStatus(status: string) {
    return leads.filter(l => (l.status || "novo") === status);
  }

  function handleDragStart(event: DragStartEvent) {
    const lead = leads.find(l => l.id === event.active.id);
    setActiveLead(lead || null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    // The "over" could be a column id or another lead id
    let newStatus: string | undefined;

    // Check if dropped over a column directly
    const column = COLUNAS.find(c => c.id === over.id);
    if (column) {
      newStatus = column.id;
    } else {
      // Dropped over another lead — find which column that lead is in
      const overLead = leads.find(l => l.id === over.id);
      if (overLead) {
        newStatus = overLead.status || "novo";
      }
    }

    if (!newStatus) return;

    const currentLead = leads.find(l => l.id === leadId);
    if (currentLead && (currentLead.status || "novo") === newStatus) return;

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus! } : l));

    await supabase.from("leads").update({ status: newStatus, status_mudou_em: new Date().toISOString() }).eq("id", leadId);

    // Dispara automação se configurada para o novo estágio
    const movedLead = leads.find(l => l.id === leadId);
    if (movedLead) {
      supabase.functions.invoke("process-automation", {
        body: { lead_id: leadId, novo_status: newStatus, lead_nome: movedLead.nome },
      }).catch(() => {});
    }
  }

  function handleDragOver(event: DragOverEvent) {
    // Optional: could add visual feedback
  }

  function handleLeadClick(lead: Lead) {
    setDrawerLead(lead);
    setDrawerOpen(true);
  }

  async function handleStatusChange(leadId: string, newStatus: string) {
    const currentLead = leads.find(l => l.id === leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    setDrawerLead(prev => prev && prev.id === leadId ? { ...prev, status: newStatus } : prev);
    await supabase.from("leads").update({ status: newStatus, status_mudou_em: new Date().toISOString() }).eq("id", leadId);

    // Dispara automação se configurada para o novo estágio
    if (currentLead) {
      supabase.functions.invoke("process-automation", {
        body: { lead_id: leadId, novo_status: newStatus, lead_nome: currentLead.nome },
      }).catch(() => {});
    }
  }

  function handleLeadUpdate(updatedLead: Lead) {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    setDrawerLead(prev => prev && prev.id === updatedLead.id ? updatedLead : prev);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CRM — Pipeline de Leads</h1>
        <AddLeadDialog />
      </div>

      <div className="overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          <div className="flex gap-3 min-w-max">
            {COLUNAS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                leads={getLeadsByStatus(col.id)}
                onLeadClick={handleLeadClick}
              />
            ))}
          </div>

          <DragOverlay>
            {activeLead ? (
              <div className="opacity-90 rotate-2">
                <LeadCard lead={activeLead} onClick={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <LeadDrawer
        lead={drawerLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStatusChange={handleStatusChange}
        onLeadUpdate={handleLeadUpdate}
        onLeadDelete={(leadId) => {
          setLeads(prev => prev.filter(l => l.id !== leadId));
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}
