import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Mail, MailCheck, MessageSquare, CheckCheck, Globe, Smartphone, Hand, Bot } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
}

function getScoreBadge(score: number | null) {
  const s = score ?? 0;
  if (s >= 71) return "bg-success/20 text-success border-success/30";
  if (s >= 41) return "bg-warning/20 text-warning border-warning/30";
  return "bg-destructive/20 text-destructive border-destructive/30";
}

function getPrioridadeBadge(prioridade: string | null) {
  switch (prioridade) {
    case "imediata": return "bg-destructive/20 text-destructive";
    case "alta": return "bg-warning/20 text-warning";
    case "media": return "bg-primary/20 text-primary";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function LeadCard({ lead, onClick }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(lead)}
      className="glass-card rounded-lg p-3 cursor-grab active:cursor-grabbing space-y-2 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate flex-1">{lead.nome}</p>
          {lead.origem === "website" && (
            <Tooltip><TooltipTrigger><Globe className="h-3 w-3 text-primary shrink-0" /></TooltipTrigger><TooltipContent>Via site</TooltipContent></Tooltip>
          )}
          {lead.origem === "meta_ads" && (
            <Tooltip><TooltipTrigger><Smartphone className="h-3 w-3 text-blue-500 shrink-0" /></TooltipTrigger><TooltipContent>Via Meta Ads</TooltipContent></Tooltip>
          )}
          {(!lead.origem || lead.origem === "manual") && (
            <Tooltip><TooltipTrigger><Hand className="h-3 w-3 text-muted-foreground shrink-0" /></TooltipTrigger><TooltipContent>Manual</TooltipContent></Tooltip>
          )}
        </div>
        <Badge className={`text-[10px] px-1.5 py-0 ml-1 ${getScoreBadge(lead.score)}`}>
          {lead.score ?? 0}
        </Badge>
      </div>

      {lead.empresa && (
        <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>
      )}

      {(lead as any).estagio_fonte === "ia_whatsapp" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-0.5">
              <Badge className="text-[9px] px-1 py-0 bg-primary/15 text-primary border-primary/20 gap-0.5">
                <Bot className="h-2.5 w-2.5" /> IA
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Estágio definido automaticamente pela IA</TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lead.email_respondido ? (
            <MailCheck className="h-3.5 w-3.5 text-success" />
          ) : lead.email_enviado ? (
            <Mail className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Mail className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                {lead.whatsapp_respondido ? (
                  <CheckCheck className="h-3.5 w-3.5 text-success" />
                ) : lead.whatsapp_enviado ? (
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {lead.whatsapp_respondido
                ? `Respondeu no WhatsApp${lead.data_whatsapp_respondido ? " · " + formatDistanceToNow(new Date(lead.data_whatsapp_respondido), { addSuffix: true, locale: ptBR }) : ""}`
                : lead.whatsapp_enviado
                ? `Contatado no WhatsApp${lead.data_whatsapp_enviado ? " · " + formatDistanceToNow(new Date(lead.data_whatsapp_enviado), { addSuffix: true, locale: ptBR }) : ""}`
                : "Sem contato no WhatsApp"}
            </TooltipContent>
          </Tooltip>
        </div>

        <Badge className={`text-[10px] px-1.5 py-0 ${getPrioridadeBadge(lead.prioridade_contato)}`}>
          {lead.prioridade_contato || "media"}
        </Badge>
      </div>

      {lead.criado_em && (
        <p className="text-[10px] text-muted-foreground">
          {format(new Date(lead.criado_em), "dd/MM/yyyy")}
        </p>
      )}
    </div>
  );
}
