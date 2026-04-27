import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Check, Clock, AlertTriangle, FileText, DollarSign, Pencil, Trash2,
  Save, X, MessageCircle, Mail, Loader2, ListChecks, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseBRL } from "@/lib/currency";

type Contrato = Tables<"contratos">;
type Parcela = Tables<"parcelas">;
type Recorrencia = Tables<"recorrencias">;

function getStatusBadge(status: string) {
  switch (status) {
    case "ativo": return "bg-success/20 text-success";
    case "encerrado": return "bg-muted text-muted-foreground";
    case "pendente_assinatura": return "bg-warning/20 text-warning";
    default: return "bg-muted text-muted-foreground";
  }
}

function getParcelaIcon(status: string) {
  switch (status) {
    case "pago": return <Check className="h-4 w-4 text-success" />;
    case "vencido": return <AlertTriangle className="h-4 w-4 text-destructive" />;
    default: return <Clock className="h-4 w-4 text-warning" />;
  }
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const TIPO_SERVICO_LABELS: Record<string, string> = {
  agente_ia: "Agente IA",
  automacao: "Automação",
  sistema: "Sistema",
  manutencao: "Manutenção",
};

interface ContratoDrawerProps {
  contrato: Contrato | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ContratoDrawer({ contrato, open, onClose, onUpdate }: ContratoDrawerProps) {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [cobrancaLoadingId, setCobrancaLoadingId] = useState<string | null>(null);

  // Inline edit recorrência
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editRecValor, setEditRecValor] = useState("");
  const [editRecDia, setEditRecDia] = useState("");
  const [editRecStatus, setEditRecStatus] = useState("ativo");
  const [savingRec, setSavingRec] = useState(false);
  const { toast } = useToast();

  // Editable fields
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editTipoServico, setEditTipoServico] = useState("");
  const [editValorTotal, setEditValorTotal] = useState("");
  const [editStatus, setEditStatus] = useState("");

  useEffect(() => {
    if (contrato) {
      fetchDetails(contrato.id);
      populateEditFields(contrato);
    }
  }, [contrato]);

  function populateEditFields(c: Contrato) {
    setEditNome(c.cliente_nome);
    setEditEmail(c.cliente_email || "");
    setEditTelefone(c.cliente_telefone || "");
    setEditTipoServico(c.tipo_servico);
    setEditValorTotal(String(c.valor_total));
    setEditStatus(c.status);
    setEditing(false);
  }

  async function fetchDetails(contratoId: string) {
    setLoading(true);
    const [pRes, rRes] = await Promise.all([
      supabase.from("parcelas").select("*").eq("contrato_id", contratoId).order("data_vencimento"),
      supabase.from("recorrencias").select("*").eq("contrato_id", contratoId),
    ]);
    setParcelas(pRes.data || []);
    setRecorrencias(rRes.data || []);
    setLoading(false);
  }

  async function handleGenerateOnboardingTasks(contratoId: string) {
    setGeneratingTasks(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("generate-onboarding-tasks", {
        body: { contrato_id: contratoId, user_id: session?.user?.id },
      });
      if (error || data?.error) {
        toast({
          title: "Erro ao gerar tarefas",
          description: error?.message || data?.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: `${data.count} tarefas de onboarding criadas!`,
          description: "Visualize e edite em Tarefas.",
        });
      }
    } catch (e) {
      toast({ title: "Erro ao gerar tarefas de onboarding", variant: "destructive" });
    }
    setGeneratingTasks(false);
  }

  async function handleSave() {
    if (!contrato) return;
    setSaving(true);

    const previousStatus = contrato.status;

    const { error } = await supabase.from("contratos").update({
      cliente_nome: editNome.trim(),
      cliente_email: editEmail.trim() || null,
      cliente_telefone: editTelefone.trim() || null,
      tipo_servico: editTipoServico,
      valor_total: parseBRL(editValorTotal),
      status: editStatus,
    }).eq("id", contrato.id);

    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    const wasActivated = previousStatus !== "ativo" && editStatus === "ativo";

    if (wasActivated) {
      toast({ title: "Contrato ativado!" });

      // Feature 1: Auto-activate recorrências
      if (recorrencias.length > 0) {
        await supabase.from("recorrencias").update({ ativo: true }).eq("contrato_id", contrato.id);
        setRecorrencias(prev => prev.map(r => ({ ...r, ativo: true })));
        toast({ title: "Recorrência ativada automaticamente no Financeiro!" });
      }

      // Feature 2: Generate onboarding tasks via AI
      await handleGenerateOnboardingTasks(contrato.id);
    } else {
      toast({ title: "Contrato atualizado!" });
    }

    setEditing(false);
    onUpdate();
  }

  async function handleDelete() {
    if (!contrato) return;
    setDeleting(true);
    await supabase.from("parcelas").delete().eq("contrato_id", contrato.id);
    await supabase.from("recorrencias").delete().eq("contrato_id", contrato.id);
    const { error } = await supabase.from("contratos").delete().eq("id", contrato.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contrato excluído!" });
      setDeleteOpen(false);
      onClose();
      onUpdate();
    }
  }

  async function confirmarPagamento(parcelaId: string) {
    await supabase.from("parcelas").update({
      status: "pago",
      data_pagamento: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", parcelaId);
    toast({ title: "Pagamento confirmado!" });
    if (contrato) fetchDetails(contrato.id);
    onUpdate();
  }

  // Feature 3: One-click charge — WhatsApp first, email as fallback
  async function handleCobrar(parcela: Parcela) {
    if (!contrato) return;

    const valor = formatCurrency(Number(parcela.valor));
    const vencimento = format(new Date(parcela.data_vencimento + "T00:00:00"), "dd/MM/yyyy");
    const mensagem = `Olá ${contrato.cliente_nome}! Passando para lembrar que há um pagamento de ${valor} com vencimento em ${vencimento} referente ao nosso contrato de serviços. Qualquer dúvida, estou à disposição!`;

    // WhatsApp preferred
    if (contrato.cliente_telefone) {
      const phone = contrato.cliente_telefone.replace(/\D/g, "");
      const waUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(mensagem)}`;
      window.open(waUrl, "_blank");
      toast({ title: "WhatsApp aberto!", description: "Mensagem de cobrança pré-preenchida." });
      return;
    }

    // Email fallback
    if (contrato.cliente_email) {
      setCobrancaLoadingId(parcela.id);
      try {
        const { error } = await supabase.functions.invoke("send-email", {
          body: {
            to: contrato.cliente_email,
            subject: `Lembrete de Pagamento — ${valor}`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
              <p>Olá <strong>${contrato.cliente_nome}</strong>,</p>
              <p>Passamos para lembrar que há um pagamento em aberto:</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;background:#f5f5f5;border-radius:4px"><strong>Valor</strong></td><td style="padding:8px">${valor}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;border-radius:4px"><strong>Vencimento</strong></td><td style="padding:8px">${vencimento}</td></tr>
                ${parcela.descricao ? `<tr><td style="padding:8px;background:#f5f5f5;border-radius:4px"><strong>Referente a</strong></td><td style="padding:8px">${parcela.descricao}</td></tr>` : ""}
              </table>
              <p>Qualquer dúvida, entre em contato conosco.</p>
              <br><p style="color:#666;font-size:12px">Vision AI</p>
            </div>`,
          },
        });
        if (error) {
          toast({ title: "Erro ao enviar email", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Cobrança enviada por email!", description: contrato.cliente_email });
        }
      } catch (e) {
        toast({ title: "Erro ao enviar cobrança", variant: "destructive" });
      }
      setCobrancaLoadingId(null);
      return;
    }

    toast({
      title: "Sem contato cadastrado",
      description: "Edite o contrato e adicione telefone ou email.",
      variant: "destructive",
    });
  }

  async function handleSalvarRecorrencia(recId: string) {
    setSavingRec(true);
    const isAtivo = editRecStatus === "ativo";
    const { error } = await supabase.from("recorrencias").update({
      valor_mensal: parseBRL(editRecValor),
      dia_vencimento: parseInt(editRecDia),
      ativo: isAtivo,
    }).eq("id", recId);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Recorrência atualizada!" });
      setEditingRecId(null);
      if (contrato) { fetchDetails(contrato.id); onUpdate(); }
    }
    setSavingRec(false);
  }

  if (!contrato) return null;

  const totalPago = parcelas.filter(p => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const totalPendente = parcelas.filter(p => p.status !== "pago").reduce((s, p) => s + Number(p.valor), 0);
  const mrrAtivo = recorrencias.filter(r => r.ativo).reduce((s, r) => s + Number(r.valor_mensal), 0);

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-5">
              <SheetHeader className="text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SheetTitle className="text-lg">{editing ? "Editar Contrato" : contrato.cliente_nome}</SheetTitle>
                    {!editing && <Badge className={getStatusBadge(contrato.status)}>{contrato.status.replace("_", " ")}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    {!editing ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteOpen(true)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { populateEditFields(contrato); }}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={handleSave} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </SheetHeader>

              {/* Generating tasks indicator */}
              {generatingTasks && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg text-xs text-primary border border-primary/20">
                  <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  <span>IA gerando tarefas de onboarding com base no contrato...</span>
                </div>
              )}

              {/* Contract info */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Dados do Contrato</h4>
                {editing ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome do Cliente</Label>
                      <Input value={editNome} onChange={e => setEditNome(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email</Label>
                        <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Telefone</Label>
                        <Input value={editTelefone} onChange={e => setEditTelefone(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tipo de Serviço</Label>
                        <Select value={editTipoServico} onValueChange={setEditTipoServico}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agente_ia">Agente IA</SelectItem>
                            <SelectItem value="automacao">Automação</SelectItem>
                            <SelectItem value="sistema">Sistema</SelectItem>
                            <SelectItem value="manutencao">Manutenção</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Valor Total</Label>
                        <CurrencyInput value={editValorTotal} onChange={setEditValorTotal} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Status</Label>
                      <Select value={editStatus} onValueChange={setEditStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente_assinatura">Pendente Assinatura</SelectItem>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="encerrado">Encerrado</SelectItem>
                        </SelectContent>
                      </Select>
                      {editStatus === "ativo" && contrato.status !== "ativo" && (
                        <p className="text-[10px] text-primary flex items-center gap-1 mt-1">
                          <ListChecks className="h-3 w-3" />
                          Ao salvar: recorrência será ativada e tarefas de onboarding geradas pela IA.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-secondary/30 rounded p-2">
                      <p className="text-[10px] text-muted-foreground">Tipo de Serviço</p>
                      <p className="font-medium">{TIPO_SERVICO_LABELS[contrato.tipo_servico] || contrato.tipo_servico}</p>
                    </div>
                    <div className="bg-secondary/30 rounded p-2">
                      <p className="text-[10px] text-muted-foreground">Valor Total</p>
                      <p className="font-medium">{formatCurrency(Number(contrato.valor_total))}</p>
                    </div>
                    <div className="bg-secondary/30 rounded p-2">
                      <p className="text-[10px] text-muted-foreground">Email</p>
                      <p className="font-medium truncate">{contrato.cliente_email || "—"}</p>
                    </div>
                    <div className="bg-secondary/30 rounded p-2">
                      <p className="text-[10px] text-muted-foreground">Telefone</p>
                      <p className="font-medium">{contrato.cliente_telefone || "—"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-success/10 rounded-lg p-3 text-center">
                  <DollarSign className="h-4 w-4 text-success mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Recebido</p>
                  <p className="text-sm font-bold text-success">{formatCurrency(totalPago)}</p>
                </div>
                <div className="bg-warning/10 rounded-lg p-3 text-center">
                  <Clock className="h-4 w-4 text-warning mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Pendente</p>
                  <p className="text-sm font-bold text-warning">{formatCurrency(totalPendente)}</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <RefreshCw className="h-4 w-4 text-primary mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">MRR</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(mrrAtivo)}</p>
                </div>
              </div>

              <Separator />

              {/* Payment timeline */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Timeline de Pagamentos</h4>
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : parcelas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma parcela cadastrada.</p>
                ) : (
                  <div className="space-y-2">
                    {parcelas.map(p => (
                      <div key={p.id} className="flex items-center gap-3 bg-secondary/20 rounded-lg p-3">
                        {getParcelaIcon(p.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{formatCurrency(Number(p.valor))}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Vence: {format(new Date(p.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}
                            {p.data_pagamento && ` — Pago: ${format(new Date(p.data_pagamento + "T00:00:00"), "dd/MM/yyyy")}`}
                          </p>
                          {p.descricao && <p className="text-[10px] text-muted-foreground">{p.descricao}</p>}
                        </div>
                        <div className="flex gap-1">
                          {p.status === "pendente" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs border-success/30 text-success hover:bg-success/10"
                              onClick={() => confirmarPagamento(p.id)}
                            >
                              Confirmar
                            </Button>
                          )}
                          {(p.status === "pendente" || p.status === "vencido") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => handleCobrar(p)}
                              disabled={cobrancaLoadingId === p.id}
                              title={contrato.cliente_telefone ? "Enviar cobrança via WhatsApp" : contrato.cliente_email ? "Enviar cobrança por email" : "Sem contato cadastrado"}
                            >
                              {cobrancaLoadingId === p.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : contrato.cliente_telefone ? (
                                <MessageCircle className="h-3 w-3" />
                              ) : (
                                <Mail className="h-3 w-3" />
                              )}
                              <span className="ml-1">Cobrar</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {recorrencias.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Recorrências</h4>
                    {recorrencias.map(r => (
                      <div key={r.id} className="bg-secondary/20 rounded-lg p-3 text-sm">
                        {editingRecId === r.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[10px]">Valor Mensal</Label>
                                <CurrencyInput value={editRecValor} onChange={setEditRecValor} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px]">Dia de Vencimento</Label>
                                <Input type="number" min="1" max="31" value={editRecDia} onChange={e => setEditRecDia(e.target.value)} className="h-9" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Status</Label>
                              <Select value={editRecStatus} onValueChange={setEditRecStatus}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ativo">Ativo</SelectItem>
                                  <SelectItem value="pausado">Pausado</SelectItem>
                                  <SelectItem value="cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingRecId(null)}>Cancelar</Button>
                              <Button size="sm" className="h-7 text-xs gradient-primary text-primary-foreground" onClick={() => handleSalvarRecorrencia(r.id)} disabled={savingRec}>
                                {savingRec ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{formatCurrency(Number(r.valor_mensal))}/mês</p>
                              <p className="text-[10px] text-muted-foreground">Dia de vencimento: {r.dia_vencimento}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={r.ativo ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}>
                                {r.ativo ? "Ativo" : "Inativo"}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                setEditingRecId(r.id);
                                setEditRecValor(String(r.valor_mensal));
                                setEditRecDia(String(r.dia_vencimento));
                                setEditRecStatus(r.ativo ? "ativo" : "cancelado");
                              }}>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato de <strong>{contrato.cliente_nome}</strong> e todas as parcelas/recorrências associadas serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
