import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Search, MapPin, Briefcase, Users, Zap, Clock,
  CheckCircle2, XCircle, Loader2, Phone,
  TrendingUp, Target, RefreshCw, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const NICHOS = [
  "Transportadora",
  "Clínica Médica",
  "Clínica Odontológica",
  "Imobiliária",
  "Escritório de Contabilidade",
  "Academia",
  "Restaurante",
  "Salão de Beleza",
  "Oficina Mecânica",
  "Pet Shop",
  "Farmácia",
  "Escola",
];

const CIDADES_SP = [
  "Rio Claro",
  "Piracicaba",
  "Limeira",
  "Campinas",
  "São Paulo",
  "Ribeirão Preto",
  "Sorocaba",
  "São José dos Campos",
  "Santos",
  "Jundiaí",
  "Americana",
  "Bauru",
  "Marília",
  "Presidente Prudente",
  "São José do Rio Preto",
  "Araçatuba",
  "Franca",
  "Araraquara",
  "Taubaté",
  "Botucatu",
];

const QUANTIDADES = [10, 25, 50];

type Extracao = {
  id: string;
  criado_em: string;
  cidade: string;
  nicho: string;
  quantidade_solicitada: number;
  quantidade_extraida: number;
  quantidade_descartada?: number;
  motivo_descartes?: Record<string, number>;
  status: "processando" | "concluido" | "erro";
  erro_mensagem?: string;
  apify_run_id?: string;
};

const MOTIVO_LABELS: Record<string, string> = {
  sem_contato: "sem contato",
  duplicado: "duplicado",
};

function formatarMotivos(motivos?: Record<string, number>): string {
  if (!motivos) return "";
  return Object.entries(motivos)
    .filter(([, count]) => count > 0)
    .map(([k, v]) => `${v} ${MOTIVO_LABELS[k] || k}`)
    .join(", ");
}

export default function Prospeccao() {
  const { toast } = useToast();
  const [cidade, setCidade] = useState("Rio Claro");
  const [cidadeCustom, setCidadeCustom] = useState("");
  const [usarCidadeCustom, setUsarCidadeCustom] = useState(false);
  const [nicho, setNicho] = useState("Transportadora");
  const [quantidade, setQuantidade] = useState(10);
  const [extraindo, setExtraindo] = useState(false);
  const [extracoes, setExtracoes] = useState<Extracao[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchExtracoes = useCallback(async () => {
    const { data } = await supabase
      .from("extracoes")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(20);
    setExtracoes((data as Extracao[]) || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    fetchExtracoes();
    const channel = supabase
      .channel("extracoes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "extracoes" }, () => {
        fetchExtracoes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchExtracoes]);

  // Conclusão chega via webhook do Apify → realtime channel acima atualiza a UI.

  async function handleExcluir(id: string) {
    const { error } = await supabase.from("extracoes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Extração excluída", description: "Os leads no CRM foram mantidos." });
    fetchExtracoes();
  }

  async function handleLimparComErro() {
    const { error, count } = await supabase
      .from("extracoes")
      .delete({ count: "exact" })
      .eq("status", "erro");
    if (error) {
      toast({ title: "Erro ao limpar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${count ?? 0} extrações com erro removidas` });
    fetchExtracoes();
  }

  const cidadeFinal = usarCidadeCustom ? cidadeCustom : cidade;
  const temErros = extracoes.some(e => e.status === "erro");

  async function handleExtrair() {
    if (!cidadeFinal.trim()) {
      toast({ title: "Informe a cidade", variant: "destructive" });
      return;
    }
    setExtraindo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: extracao, error: extracaoError } = await supabase
        .from("extracoes")
        .insert({
          cidade: cidadeFinal.trim(),
          nicho,
          quantidade_solicitada: quantidade,
          status: "processando",
          user_id: user?.id,
        })
        .select()
        .single();

      if (extracaoError || !extracao) throw new Error("Erro ao criar registro de extração");

      const { error: fnError } = await supabase.functions.invoke("prospeccao-apify", {
        body: { cidade: cidadeFinal.trim(), nicho, quantidade, extracao_id: extracao.id },
      });

      if (fnError) throw new Error(fnError.message);

      toast({
        title: "✅ Extração iniciada!",
        description: "Os leads aparecerão no CRM automaticamente em 3-5 minutos.",
      });
    } catch (err: any) {
      toast({
        title: "Erro na extração",
        description: err?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setExtraindo(false);
    }
  }

  const totalLeads = extracoes.reduce((acc, e) => acc + (e.quantidade_extraida || 0), 0);
  const totalExtracoes = extracoes.length;
  const emProcessamento = extracoes.filter(e => e.status === "processando").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Prospecção Automática
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Extrai leads do Google Maps por cidade e nicho — telefone, site, endereço e categoria já entram no CRM
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchExtracoes}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Total de Leads Extraídos
          </div>
          <div className="text-2xl font-bold text-primary">{totalLeads}</div>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Zap className="h-3.5 w-3.5" />
            Extrações Realizadas
          </div>
          <div className="text-2xl font-bold">{totalExtracoes}</div>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Loader2 className="h-3.5 w-3.5" />
            Em Processamento
          </div>
          <div className="text-2xl font-bold text-yellow-500">{emProcessamento}</div>
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Nova Extração
        </h2>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Cidade
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {CIDADES_SP.map((c) => (
              <button
                key={c}
                onClick={() => { setCidade(c); setUsarCidadeCustom(false); }}
                className={`px-3 py-1 rounded-full text-xs border transition-all ${
                  !usarCidadeCustom && cidade === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setUsarCidadeCustom(true)}
              className={`px-3 py-1 rounded-full text-xs border transition-all ${
                usarCidadeCustom
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/50 text-muted-foreground"
              }`}
            >
              + Outra cidade
            </button>
          </div>
          {usarCidadeCustom && (
            <input
              type="text"
              placeholder="Digite a cidade..."
              value={cidadeCustom}
              onChange={(e) => setCidadeCustom(e.target.value)}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
            Nicho
          </label>
          <div className="flex flex-wrap gap-2">
            {NICHOS.map((n) => (
              <button
                key={n}
                onClick={() => setNicho(n)}
                className={`px-3 py-1 rounded-full text-xs border transition-all ${
                  nicho === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Quantidade de leads
          </label>
          <div className="flex gap-2">
            {QUANTIDADES.map((q) => (
              <button
                key={q}
                onClick={() => setQuantidade(q)}
                className={`px-5 py-2 rounded-lg text-sm font-medium border transition-all ${
                  quantidade === q
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {q} leads
              </button>
            ))}
          </div>
        </div>

        <div className="bg-muted/40 rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Busca que será executada (Google Maps):</p>
          <code className="text-xs text-primary font-mono">
            {nicho} em {cidadeFinal || "[cidade]"} (Google Maps)
          </code>
        </div>

        <Button
          onClick={handleExtrair}
          disabled={extraindo || !cidadeFinal.trim()}
          className="w-full sm:w-auto"
          size="lg"
        >
          {extraindo ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Iniciando busca no Google Maps...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Extrair {quantidade} Leads de {cidadeFinal || "..."}
            </>
          )}
        </Button>

        {extraindo && (
          <p className="text-xs text-muted-foreground">
            🗺️ Disparando o Google Maps Scraper. Os leads aparecem aqui quando o run concluir (geralmente 1–3 min).
          </p>
        )}
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-2">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Histórico de Extrações
          </h2>
          {temErros && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Limpar com erro
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar extrações com erro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove todas as extrações com status de erro do histórico. Leads já criados no CRM não são afetados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLimparComErro}>Limpar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : extracoes.length === 0 ? (
          <div className="py-12 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma extração realizada ainda</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Configure e execute sua primeira prospecção acima</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {extracoes.map((ext) => (
              <div key={ext.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {ext.status === "processando" && (
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-500 shrink-0" />
                  )}
                  {ext.status === "concluido" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                  {ext.status === "erro" && (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {ext.nicho} · {ext.cidade}
                    </p>
                    {ext.erro_mensagem && (
                      <p className="text-xs text-destructive truncate">{ext.erro_mensagem}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(ext.criado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {ext.status === "concluido" && (() => {
                    const novos = ext.quantidade_extraida || 0;
                    const descartados = ext.quantidade_descartada ?? 0;
                    const total = novos + descartados;
                    return (
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-foreground">{total} extraídos</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-green-600">{novos} novos</span>
                          {descartados > 0 && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{descartados} descartados</span>
                            </>
                          )}
                        </div>
                        {descartados > 0 && (
                          <div className="text-xs text-muted-foreground">
                            ({formatarMotivos(ext.motivo_descartes)})
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <Badge
                    variant={
                      ext.status === "concluido" ? "default" :
                      ext.status === "processando" ? "secondary" : "destructive"
                    }
                    className="text-xs"
                  >
                    {ext.status === "processando" ? "Processando" :
                     ext.status === "concluido" ? "Concluído" : "Erro"}
                  </Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir esta extração?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove o registro de {ext.nicho} · {ext.cidade} do histórico. Os leads já criados no CRM permanecem intactos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleExcluir(ext.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
