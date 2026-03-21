import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail, MailCheck, MessageSquare, CheckCheck, ExternalLink, Calendar,
  Building2, User, Globe, Linkedin, Loader2, Send, Trash2, StickyNote, Database,
  CheckCircle2, MousePointerClick, AlertCircle,
} from "lucide-react";
import { WhatsAppTab } from "@/components/crm/WhatsAppTab";
import { NotasTab } from "@/components/crm/NotasTab";
import { EnriquecimentoTab } from "@/components/crm/EnriquecimentoTab";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;
type Comunicacao = Tables<"comunicacoes">;

const COLUNAS = [
  { value: "novo", label: "Novo" },
  { value: "enriquecido", label: "Enriquecido" },
  { value: "contatado", label: "Contatado" },
  { value: "reuniao_agendada", label: "Reunião Agendada" },
  { value: "perdido", label: "Perdido" },
];

function getScoreColor(score: number | null) {
  const s = score ?? 0;
  if (s >= 71) return "bg-success/20 text-success";
  if (s >= 41) return "bg-warning/20 text-warning";
  return "bg-destructive/20 text-destructive";
}

function getEmailStatusIcon(status: string | null) {
  if (status === "aberto") return <MailCheck className="h-3 w-3 text-success" />;
  if (status === "clicado") return <MousePointerClick className="h-3 w-3 text-primary" />;
  if (status === "bounced") return <AlertCircle className="h-3 w-3 text-destructive" />;
  if (status === "entregue") return <CheckCircle2 className="h-3 w-3 text-muted-foreground" />;
  return null;
}

interface LeadDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (leadId: string, newStatus: string) => void;
  onLeadUpdate?: (lead: Lead) => void;
  onLeadDelete?: (leadId: string) => void;
}

export default function LeadDrawer({ lead, open, onClose, onStatusChange, onLeadUpdate, onLeadDelete }: LeadDrawerProps) {
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ assunto: string; conteudo: string } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (lead) {
      setEmailDraft(null);
      fetchComunicacoes(lead.id);
    }
  }, [lead]);

  async function fetchComunicacoes(leadId: string) {
    const { data } = await supabase
      .from("comunicacoes")
      .select("*")
      .eq("lead_id", leadId)
      .order("criado_em", { ascending: false });
    setComunicacoes((data || []) as Comunicacao[]);
  }

  async function handleDeleteLead() {
    if (!lead) return;
    setDeleting(true);
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) {
      toast({ title: "Erro ao excluir lead", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead excluído com sucesso!" });
      onLeadDelete?.(lead.id);
      onClose();
    }
    setDeleting(false);
  }

  async function handleGenerateEmail() {
    if (!lead) return;
    setGeneratingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: { lead_id: lead.id },
      });
      if (error || data?.error) {
        toast({ title: "Erro ao gerar email", description: error?.message || data?.error, variant: "destructive" });
      } else {
        setEmailDraft(data.data);
        toast({ title: "Rascunho de email gerado!" });
      }
    } catch {
      toast({ title: "Erro ao gerar email", variant: "destructive" });
    }
    setGeneratingEmail(false);
  }

  async function handleSendDraft() {
    if (!lead || !emailDraft) return;
    setSendingEmail(true);

    const htmlContent = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px;text-align:center;">
          <span style="color:#fff;font-weight:bold;font-size:20px;">Vision AI</span>
        </div>
        <div style="padding:24px;background:#fff;">
          <h2 style="margin:0 0 16px;">${emailDraft.assunto}</h2>
          <div style="white-space:pre-wrap;color:#333;">${emailDraft.conteudo}</div>
        </div>
        <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#888;">
          Vision AI — Inteligência Artificial para o seu negócio
        </div>
      </div>`;

    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { to: lead.email, name: lead.nome, subject: emailDraft.assunto, html: htmlContent },
    });

    if (error || data?.error) {
      toast({ title: "Erro ao enviar", description: error?.message || data?.error, variant: "destructive" });
    } else {
      // Salva resend_id para tracking
      await supabase.from("comunicacoes").insert({
        lead_id: lead.id, tipo: "email", direcao: "enviado",
        assunto: emailDraft.assunto, conteudo: emailDraft.conteudo, status: "enviado",
        resend_message_id: data?.resend_id || null,
      } as any);
      await supabase.from("leads").update({
        email_enviado: true, data_email_enviado: new Date().toISOString(),
      }).eq("id", lead.id);

      toast({ title: "Email enviado com sucesso!" });
      setEmailDraft(null);
      fetchComunicacoes(lead.id);
    }
    setSendingEmail(false);
  }

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-5">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <SheetTitle className="text-lg">{lead.nome}</SheetTitle>
                <Badge className={`${getScoreColor(lead.score)}`}>Score: {lead.score ?? 0}</Badge>
              </div>
              {lead.empresa && <p className="text-sm text-muted-foreground">{lead.empresa}</p>}
            </SheetHeader>

            {/* Move column */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Mover para</label>
              <Select value={lead.status || "novo"} onValueChange={(v) => onStatusChange(lead.id, v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUNAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Contact info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Dados de Contato</h4>
              <div className="grid grid-cols-1 gap-1.5 text-sm">
                <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={lead.email} />
                <InfoRow icon={<MessageSquare className="h-3.5 w-3.5" />} label="Telefone" value={lead.telefone} />
                <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Empresa" value={lead.empresa} />
                <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Site" value={lead.site_empresa} link />
                <InfoRow icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" value={lead.linkedin_url} link />
                <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Instagram" value={(lead as any).instagram_url} link />
                <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Cargo" value={lead.linkedin_cargo} />
              </div>
            </div>

            <Separator />

            {/* Interaction indicators */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Status de Interação</h4>
              <div className="flex flex-wrap gap-2">
                <InteractionBadge
                  icon={lead.email_respondido ? <MailCheck className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                  label={lead.email_respondido ? "Email Respondido" : lead.email_enviado ? "Email Enviado" : "Email Pendente"}
                  active={!!lead.email_enviado}
                  success={!!lead.email_respondido}
                />
                <InteractionBadge
                  icon={lead.whatsapp_respondido ? <CheckCheck className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                  label={lead.whatsapp_respondido ? "WhatsApp Respondido" : lead.whatsapp_enviado ? "WhatsApp Enviado" : "WhatsApp Pendente"}
                  active={!!lead.whatsapp_enviado}
                  success={!!lead.whatsapp_respondido}
                />
                <InteractionBadge
                  icon={<Calendar className="h-3 w-3" />}
                  label={lead.reuniao_agendada ? `Reunião ${lead.data_reuniao ? format(new Date(lead.data_reuniao), "dd/MM") : "Agendada"}` : "Sem Reunião"}
                  active={!!lead.reuniao_agendada}
                  success={!!lead.reuniao_agendada}
                />
              </div>
            </div>

            <Separator />

            {/* Generate Email */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Ações</h4>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateEmail}
                disabled={generatingEmail}
                className="gap-1.5 text-xs"
              >
                {generatingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                {generatingEmail ? "Gerando..." : "Gerar Email com IA"}
              </Button>

              {emailDraft && (
                <div className="rounded-lg border border-primary/30 overflow-hidden mt-2">
                  <div className="bg-primary/10 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">Rascunho de Email (editável)</span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEmailDraft(null)}>
                        Descartar
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 text-xs gradient-primary text-primary-foreground gap-1"
                        onClick={handleSendDraft}
                        disabled={sendingEmail}
                      >
                        <Send className="h-3 w-3" />
                        {sendingEmail ? "Enviando..." : "Enviar"}
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium">Assunto</label>
                      <input
                        type="text"
                        value={emailDraft.assunto}
                        onChange={(e) => setEmailDraft({ ...emailDraft, assunto: e.target.value })}
                        className="w-full mt-0.5 rounded border border-border bg-secondary/30 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium">Conteúdo</label>
                      <textarea
                        value={emailDraft.conteudo}
                        onChange={(e) => setEmailDraft({ ...emailDraft, conteudo: e.target.value })}
                        rows={8}
                        className="w-full mt-0.5 rounded border border-border bg-secondary/30 px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[100px]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* 4 abas: Timeline, WhatsApp, Notas, Enriquecimento */}
            <Tabs defaultValue="timeline" className="w-full">
              <TabsList className="w-full bg-secondary/50 h-8 grid grid-cols-4">
                <TabsTrigger value="timeline" className="text-[10px] h-7 px-1">
                  <Mail className="h-3 w-3 mr-1" /> Timeline
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="text-[10px] h-7 px-1">
                  <MessageSquare className="h-3 w-3 mr-1" /> WhatsApp
                  {(lead as any).total_mensagens_whatsapp > 0 && (
                    <Badge className="ml-1 text-[9px] h-3.5 px-0.5 bg-primary/20 text-primary">
                      {(lead as any).total_mensagens_whatsapp}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="notas" className="text-[10px] h-7 px-1">
                  <StickyNote className="h-3 w-3 mr-1" /> Notas
                </TabsTrigger>
                <TabsTrigger value="enriquecimento" className="text-[10px] h-7 px-1">
                  <Database className="h-3 w-3 mr-1" /> Dados
                </TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-3">
                {comunicacoes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma interação registrada.</p>
                ) : (
                  <div className="space-y-2">
                    {comunicacoes.map(c => {
                      const com = c as any;
                      return (
                        <div key={c.id} className="bg-secondary/30 rounded p-2 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px]">{c.tipo} — {c.direcao}</Badge>
                              {c.tipo === "email" && getEmailStatusIcon(c.status)}
                              {c.status && (
                                <span className="text-[10px] text-muted-foreground capitalize">{c.status}</span>
                              )}
                            </div>
                            <span className="text-muted-foreground">{format(new Date(c.criado_em), "dd/MM HH:mm")}</span>
                          </div>
                          {c.assunto && <p className="font-medium">{c.assunto}</p>}
                          {c.conteudo && <p className="text-muted-foreground line-clamp-2">{c.conteudo}</p>}
                          {com.aberto_em && (
                            <p className="text-[10px] text-success">Aberto em {format(new Date(com.aberto_em), "dd/MM HH:mm")}</p>
                          )}
                          {com.clicado_em && (
                            <p className="text-[10px] text-primary">Clicado em {format(new Date(com.clicado_em), "dd/MM HH:mm")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="whatsapp" className="mt-3">
                <WhatsAppTab
                  leadId={lead.id}
                  estagioFonte={(lead as any).estagio_fonte}
                />
              </TabsContent>

              <TabsContent value="notas" className="mt-3">
                <NotasTab leadId={lead.id} />
              </TabsContent>

              <TabsContent value="enriquecimento" className="mt-3">
                <EnriquecimentoTab lead={lead} onLeadUpdate={onLeadUpdate} />
              </TabsContent>
            </Tabs>

            <Separator />

            {/* Delete */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="w-full gap-1.5" disabled={deleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Excluindo..." : "Excluir Lead"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir <strong>{lead.nome}</strong>? Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteLead} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon, label, value, link }: { icon: React.ReactNode; label: string; value: string | null; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-foreground">
        {link ? (
          <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-1">
            {value} <ExternalLink className="h-3 w-3" />
          </a>
        ) : value}
      </span>
    </div>
  );
}

function InteractionBadge({ icon, label, active, success }: { icon: React.ReactNode; label: string; active: boolean; success: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
      success ? "bg-success/20 text-success" : active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
    }`}>
      {icon}
      {label}
    </div>
  );
}
