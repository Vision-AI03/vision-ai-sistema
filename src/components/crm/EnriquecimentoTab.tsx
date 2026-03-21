import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Globe, Linkedin, Instagram, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface EnriquecimentoTabProps {
  lead: Lead;
  onLeadUpdate?: (lead: Lead) => void;
}

function SectionToggle({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-secondary/30 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 text-xs space-y-1">{children}</div>}
    </div>
  );
}

export function EnriquecimentoTab({ lead, onLeadUpdate }: EnriquecimentoTabProps) {
  const [enriching, setEnriching] = useState(false);
  const { toast } = useToast();

  const fontes = (lead as any).enriquecimento_fontes as Record<string, boolean> | null;
  const enriquecidoEm = (lead as any).enriquecimento_data as string | null;
  const siteRaw = (lead as any).enriquecimento_site_raw as Record<string, string> | null;
  const linkedinRaw = (lead as any).enriquecimento_linkedin_raw as Record<string, unknown> | null;
  const instagramRaw = (lead as any).enriquecimento_instagram_raw as Record<string, unknown> | null;

  async function handleEnrich() {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-lead", {
        body: { lead_id: lead.id },
      });
      if (error || data?.error) {
        toast({ title: "Erro no enriquecimento", description: error?.message || data?.error, variant: "destructive" });
      } else {
        toast({
          title: "Lead enriquecido!",
          description: `Site: ${data.sources?.site_scraped ? "✓" : "✗"} | LinkedIn: ${data.sources?.linkedin_scraped ? "✓" : "✗"} | Instagram: ${data.sources?.instagram_scraped ? "✓" : "✗"}`,
        });
        const { data: updated } = await supabase.from("leads").select("*").eq("id", lead.id).maybeSingle();
        if (updated && onLeadUpdate) onLeadUpdate(updated);
      }
    } catch {
      toast({ title: "Erro ao enriquecer lead", variant: "destructive" });
    }
    setEnriching(false);
  }

  function FonteStatus({ label, icon, ativo }: { label: string; icon: React.ReactNode; ativo: boolean | undefined }) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {icon}
        <span>{label}</span>
        {ativo === undefined ? (
          <Badge variant="outline" className="text-[10px] h-4 px-1 ml-auto">Não buscado</Badge>
        ) : ativo ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success ml-auto" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-destructive ml-auto" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status das fontes */}
      <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Fontes</span>
          {enriquecidoEm && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(enriquecidoEm), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
        <FonteStatus label="Site da Empresa" icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />} ativo={fontes?.site} />
        <FonteStatus label="LinkedIn" icon={<Linkedin className="h-3.5 w-3.5 text-muted-foreground" />} ativo={fontes?.linkedin} />
        <FonteStatus label="Instagram" icon={<Instagram className="h-3.5 w-3.5 text-muted-foreground" />} ativo={fontes?.instagram} />
      </div>

      {/* Análise IA */}
      {(lead.segmento || lead.dores_identificadas || lead.oportunidades) && (
        <SectionToggle title="Análise da IA">
          {lead.segmento && <p><span className="text-muted-foreground">Segmento:</span> {lead.segmento}</p>}
          {lead.porte_empresa && <p><span className="text-muted-foreground">Porte:</span> {lead.porte_empresa}</p>}
          {lead.nivel_maturidade_digital && <p><span className="text-muted-foreground">Maturidade digital:</span> {lead.nivel_maturidade_digital}</p>}
          {lead.dores_identificadas && (
            <div>
              <p className="text-muted-foreground mt-1">Dores:</p>
              <p className="bg-secondary/50 rounded p-1.5 mt-0.5">{lead.dores_identificadas}</p>
            </div>
          )}
          {lead.oportunidades && (
            <div>
              <p className="text-muted-foreground mt-1">Oportunidades:</p>
              <p className="bg-secondary/50 rounded p-1.5 mt-0.5">{lead.oportunidades}</p>
            </div>
          )}
          {lead.resumo_empresa && (
            <div>
              <p className="text-muted-foreground mt-1">Resumo da empresa:</p>
              <p className="bg-secondary/50 rounded p-1.5 mt-0.5">{lead.resumo_empresa}</p>
            </div>
          )}
        </SectionToggle>
      )}

      {/* Dados Site */}
      {siteRaw && (
        <SectionToggle title={`Site — ${lead.site_empresa || "Dados coletados"}`}>
          {siteRaw.title && <p><span className="text-muted-foreground">Título:</span> {siteRaw.title}</p>}
          {siteRaw.description && <p><span className="text-muted-foreground">Descrição:</span> {siteRaw.description}</p>}
          {lead.site_empresa && (
            <a href={lead.site_empresa.startsWith("http") ? lead.site_empresa : `https://${lead.site_empresa}`}
              target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1 mt-1">
              Abrir site ↗
            </a>
          )}
        </SectionToggle>
      )}

      {/* Dados LinkedIn */}
      {linkedinRaw && (
        <SectionToggle title="LinkedIn">
          {(linkedinRaw.headline as string) && <p><span className="text-muted-foreground">Cargo:</span> {linkedinRaw.headline as string}</p>}
          {(linkedinRaw.location as string) && <p><span className="text-muted-foreground">Localização:</span> {linkedinRaw.location as string}</p>}
          {(linkedinRaw.summary as string) && (
            <div>
              <p className="text-muted-foreground mt-1">Resumo:</p>
              <p className="bg-secondary/50 rounded p-1.5 mt-0.5 line-clamp-4">{linkedinRaw.summary as string}</p>
            </div>
          )}
          {Array.isArray(linkedinRaw.skills) && linkedinRaw.skills.length > 0 && (
            <div>
              <p className="text-muted-foreground mt-1">Skills:</p>
              <p>{(linkedinRaw.skills as string[]).join(", ")}</p>
            </div>
          )}
        </SectionToggle>
      )}

      {/* Dados Instagram */}
      {instagramRaw && (
        <SectionToggle title="Instagram">
          {(instagramRaw.fullName as string) && <p><span className="text-muted-foreground">Nome:</span> {instagramRaw.fullName as string}</p>}
          {(instagramRaw.biography as string) && <p><span className="text-muted-foreground">Bio:</span> {instagramRaw.biography as string}</p>}
          {instagramRaw.followersCount != null && <p><span className="text-muted-foreground">Seguidores:</span> {Number(instagramRaw.followersCount).toLocaleString("pt-BR")}</p>}
          {(instagramRaw.businessCategory as string) && <p><span className="text-muted-foreground">Categoria:</span> {instagramRaw.businessCategory as string}</p>}
          {(instagramRaw.isBusinessAccount as boolean) && (
            <Badge variant="outline" className="text-[10px]">Conta Business</Badge>
          )}
        </SectionToggle>
      )}

      {/* Botão Enriquecer */}
      <Button
        size="sm"
        variant="outline"
        onClick={handleEnrich}
        disabled={enriching}
        className="w-full gap-1.5 text-xs"
      >
        {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {enriching ? "Enriquecendo..." : enriquecidoEm ? "Re-enriquecer com IA" : "Enriquecer com IA"}
      </Button>
    </div>
  );
}
