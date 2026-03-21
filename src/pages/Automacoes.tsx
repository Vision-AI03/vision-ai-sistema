import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Zap, Loader2, ChevronDown, ChevronUp, CheckSquare, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Automacao {
  id?: string;
  estagio: string;
  ativo: boolean;
  criar_tarefa: boolean;
  tarefa_titulo: string;
  tarefa_descricao: string;
  tarefa_prazo_dias: number;
  tarefa_prioridade: string;
  criar_notificacao: boolean;
  notificacao_titulo: string;
  notificacao_descricao: string;
}

const ESTAGIOS = [
  { value: "novo", label: "Novo Lead", desc: "Quando um lead é capturado ou criado manualmente" },
  { value: "enriquecido", label: "Enriquecido", desc: "Após enriquecimento com IA" },
  { value: "contatado", label: "Contatado", desc: "Quando o lead é movido para contatado" },
  { value: "reuniao_agendada", label: "Reunião Agendada", desc: "Quando uma reunião é marcada" },
  { value: "perdido", label: "Perdido", desc: "Quando o lead é marcado como perdido" },
];

const DEFAULT_CONFIGS: Record<string, Partial<Automacao>> = {
  novo: {
    tarefa_titulo: "Enriquecer perfil de {lead_nome}",
    tarefa_descricao: "Acesse o CRM e use o botão 'Enriquecer com IA' no drawer do lead.",
    tarefa_prazo_dias: 1,
    tarefa_prioridade: "alta",
    notificacao_titulo: "Novo lead: {lead_nome}",
    notificacao_descricao: "Lead adicionado ao pipeline. Enriqueça o perfil e prepare o primeiro contato.",
  },
  enriquecido: {
    tarefa_titulo: "Primeiro contato com {lead_nome}",
    tarefa_descricao: "Lead enriquecido. Envie email personalizado ou mensagem WhatsApp.",
    tarefa_prazo_dias: 1,
    tarefa_prioridade: "alta",
    notificacao_titulo: "{lead_nome} foi enriquecido",
    notificacao_descricao: "Perfil completo. Hora de fazer o primeiro contato.",
  },
  contatado: {
    tarefa_titulo: "Follow-up com {lead_nome}",
    tarefa_descricao: "Lead contatado. Faça follow-up em 2 dias se não houver resposta.",
    tarefa_prazo_dias: 2,
    tarefa_prioridade: "media",
    notificacao_titulo: "{lead_nome} movido para Contatado",
    notificacao_descricao: "Acompanhe a resposta e prepare follow-up.",
  },
  reuniao_agendada: {
    tarefa_titulo: "Preparar pauta para reunião com {lead_nome}",
    tarefa_descricao: "Revise o perfil do lead, identifique dores e prepare a apresentação da Vision AI.",
    tarefa_prazo_dias: 1,
    tarefa_prioridade: "alta",
    notificacao_titulo: "Reunião agendada com {lead_nome}",
    notificacao_descricao: "Prepare a pauta e revise o perfil do lead antes da reunião.",
  },
  perdido: {
    tarefa_titulo: "Análise de perda — {lead_nome}",
    tarefa_descricao: "Documente o motivo da perda para melhorar o processo.",
    tarefa_prazo_dias: 3,
    tarefa_prioridade: "baixa",
    notificacao_titulo: "{lead_nome} marcado como perdido",
    notificacao_descricao: "Analise o motivo da perda para melhorar o processo.",
  },
};

function makeDefault(estagio: string): Automacao {
  const cfg = DEFAULT_CONFIGS[estagio] || {};
  return {
    estagio,
    ativo: true,
    criar_tarefa: true,
    tarefa_titulo: cfg.tarefa_titulo || `Ação para lead após estágio ${estagio}`,
    tarefa_descricao: cfg.tarefa_descricao || "",
    tarefa_prazo_dias: cfg.tarefa_prazo_dias || 1,
    tarefa_prioridade: cfg.tarefa_prioridade || "media",
    criar_notificacao: true,
    notificacao_titulo: cfg.notificacao_titulo || `Lead avançou para ${estagio}`,
    notificacao_descricao: cfg.notificacao_descricao || "",
  };
}

function AutomacaoCard({ estagio, label, desc, automacao, onChange, onSave, saving }: {
  estagio: string;
  label: string;
  desc: string;
  automacao: Automacao;
  onChange: (a: Automacao) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  function update(key: keyof Automacao, val: unknown) {
    onChange({ ...automacao, [key]: val });
  }

  return (
    <Card className={`transition-colors ${automacao.ativo ? "border-border" : "border-border/40 opacity-60"}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">{label}</CardTitle>
              {automacao.id && <Badge variant="outline" className="text-[10px]">Configurada</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={automacao.ativo}
              onCheckedChange={v => update("ativo", v)}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          <Separator />

          {/* Tarefa */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Criar Tarefa</span>
              <Switch
                checked={automacao.criar_tarefa}
                onCheckedChange={v => update("criar_tarefa", v)}
                className="ml-auto"
              />
            </div>

            {automacao.criar_tarefa && (
              <div className="space-y-2 pl-5">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Título da Tarefa</Label>
                  <Input
                    value={automacao.tarefa_titulo}
                    onChange={e => update("tarefa_titulo", e.target.value)}
                    placeholder="Use {lead_nome} para personalizar"
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Use {"{lead_nome}"} para incluir o nome do lead.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Descrição (opcional)</Label>
                  <Textarea
                    value={automacao.tarefa_descricao}
                    onChange={e => update("tarefa_descricao", e.target.value)}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Prazo (dias)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={automacao.tarefa_prazo_dias}
                      onChange={e => update("tarefa_prazo_dias", parseInt(e.target.value) || 1)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Prioridade</Label>
                    <Select value={automacao.tarefa_prioridade} onValueChange={v => update("tarefa_prioridade", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Notificação */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Criar Notificação</span>
              <Switch
                checked={automacao.criar_notificacao}
                onCheckedChange={v => update("criar_notificacao", v)}
                className="ml-auto"
              />
            </div>

            {automacao.criar_notificacao && (
              <div className="space-y-2 pl-5">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Título da Notificação</Label>
                  <Input
                    value={automacao.notificacao_titulo}
                    onChange={e => update("notificacao_titulo", e.target.value)}
                    placeholder="Use {lead_nome} para personalizar"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Descrição (opcional)</Label>
                  <Input
                    value={automacao.notificacao_descricao}
                    onChange={e => update("notificacao_descricao", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            size="sm"
            onClick={onSave}
            disabled={saving}
            className="w-full gradient-primary text-primary-foreground text-xs gap-2 h-8"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {saving ? "Salvando..." : "Salvar Automação"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export default function Automacoes() {
  const [automacoes, setAutomacoes] = useState<Record<string, Automacao>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAutomacoes();
  }, []);

  async function fetchAutomacoes() {
    setLoading(true);
    const { data } = await supabase.from("automacoes_estagio").select("*");

    const map: Record<string, Automacao> = {};
    for (const estagio of ESTAGIOS) {
      const existing = (data || []).find(a => a.estagio === estagio.value);
      if (existing) {
        map[estagio.value] = {
          id: existing.id,
          estagio: existing.estagio,
          ativo: existing.ativo ?? true,
          criar_tarefa: existing.criar_tarefa ?? true,
          tarefa_titulo: existing.tarefa_titulo || "",
          tarefa_descricao: existing.tarefa_descricao || "",
          tarefa_prazo_dias: existing.tarefa_prazo_dias || 1,
          tarefa_prioridade: existing.tarefa_prioridade || "media",
          criar_notificacao: existing.criar_notificacao ?? true,
          notificacao_titulo: existing.notificacao_titulo || "",
          notificacao_descricao: existing.notificacao_descricao || "",
        };
      } else {
        map[estagio.value] = makeDefault(estagio.value);
      }
    }
    setAutomacoes(map);
    setLoading(false);
  }

  async function handleSave(estagio: string) {
    setSaving(estagio);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const a = automacoes[estagio];
    const payload = {
      user_id: user.id,
      estagio: a.estagio,
      ativo: a.ativo,
      criar_tarefa: a.criar_tarefa,
      tarefa_titulo: a.tarefa_titulo,
      tarefa_descricao: a.tarefa_descricao,
      tarefa_prazo_dias: a.tarefa_prazo_dias,
      tarefa_prioridade: a.tarefa_prioridade,
      criar_notificacao: a.criar_notificacao,
      notificacao_titulo: a.notificacao_titulo,
      notificacao_descricao: a.notificacao_descricao,
    };

    let error;
    if (a.id) {
      ({ error } = await supabase.from("automacoes_estagio").update(payload as any).eq("id", a.id));
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("automacoes_estagio")
        .insert(payload as any)
        .select()
        .single();
      error = insertError;
      if (inserted) {
        setAutomacoes(prev => ({
          ...prev,
          [estagio]: { ...prev[estagio], id: inserted.id },
        }));
      }
    }

    if (error) {
      toast({ title: "Erro ao salvar automação", variant: "destructive" });
    } else {
      toast({ title: "Automação salva!" });
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure ações automáticas que disparam quando um lead muda de estágio no CRM.
          Use <code className="bg-secondary px-1 rounded text-xs">{"{lead_nome}"}</code> nos textos para personalizar.
        </p>
      </div>

      <div className="space-y-3">
        {ESTAGIOS.map(e => (
          automacoes[e.value] ? (
            <AutomacaoCard
              key={e.value}
              estagio={e.value}
              label={e.label}
              desc={e.desc}
              automacao={automacoes[e.value]}
              onChange={a => setAutomacoes(prev => ({ ...prev, [e.value]: a }))}
              onSave={() => handleSave(e.value)}
              saving={saving === e.value}
            />
          ) : null
        ))}
      </div>
    </div>
  );
}
