import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Clapperboard, RefreshCw, Check, MessageSquareWarning, Pencil, Trash2, Send, Undo2,
  ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Images, Film, CalendarClock, AlertTriangle,
} from "lucide-react";
import { format, addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Conta = "vision_ai" | "cot_ai";
type Tipo = "imagem" | "carrossel" | "reels";
type Status = "rascunho" | "revisar" | "aprovado" | "publicando" | "publicado" | "erro" | "cancelado";

type Post = {
  id: string; conta: Conta; tipo: Tipo; status: Status;
  legenda: string; midia_urls: string[]; capa_url: string | null;
  pauta: string | null; nicho: string | null; referencias: string[] | null;
  feedback: string | null; erro: string | null; permalink: string | null;
  agendado_para: string | null; publicado_em: string | null; criado_em: string;
};

const CONTAS: Record<Conta, string> = { vision_ai: "Vision AI", cot_ai: "COT-AI" };
const TIPOS: Record<Tipo, { label: string; icon: typeof ImageIcon }> = {
  imagem: { label: "Imagem", icon: ImageIcon },
  carrossel: { label: "Carrossel", icon: Images },
  reels: { label: "Reels", icon: Film },
};

const ABAS: { id: string; label: string; status: Status[] }[] = [
  { id: "aprovar", label: "Para aprovar", status: ["rascunho"] },
  { id: "revisao", label: "Em revisão", status: ["revisar"] },
  { id: "agendados", label: "Agendados", status: ["aprovado", "publicando"] },
  { id: "publicados", label: "Publicados", status: ["publicado"] },
  { id: "erros", label: "Erros", status: ["erro", "cancelado"] },
];

// Mesma regra de public.fila_posts_proximo_horario: dia sim, dia não a partir de 2026-11-14.
const ANCORA = new Date(2026, 10, 14);
function proximosDiasDePublicacao(qtd: number): Date[] {
  const dias: Date[] = [];
  let d = startOfDay(new Date());
  while (dias.length < qtd) {
    if (differenceInCalendarDays(d, ANCORA) % 2 === 0) dias.push(d);
    d = addDays(d, 1);
  }
  return dias;
}

const BUCKET_PREFIX = "/storage/v1/object/public/posts/";
function caminhoNoBucket(url: string): string | null {
  const i = url.indexOf(BUCKET_PREFIX);
  return i >= 0 ? decodeURIComponent(url.slice(i + BUCKET_PREFIX.length)) : null;
}

const fmtData = (iso: string) => format(new Date(iso), "EEE, dd/MM 'às' HH:mm", { locale: ptBR });

function Midia({ post }: { post: Post }) {
  const [idx, setIdx] = useState(0);
  const urls = post.midia_urls;

  if (post.tipo === "reels") {
    return (
      <video
        src={urls[0]} poster={post.capa_url ?? undefined} controls preload="metadata"
        className="w-full aspect-[9/16] max-h-[420px] object-contain bg-black rounded-md"
      />
    );
  }

  return (
    <div className="relative">
      <a href={urls[idx]} target="_blank" rel="noreferrer">
        <img src={urls[idx]} alt="" className="w-full aspect-[4/5] object-cover rounded-md bg-muted" loading="lazy" />
      </a>
      {urls.length > 1 && (
        <>
          <Button
            size="icon" variant="secondary" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-80"
            disabled={idx === 0} onClick={() => setIdx(idx - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon" variant="secondary" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-80"
            disabled={idx === urls.length - 1} onClick={() => setIdx(idx + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/70 text-white rounded px-1.5 py-0.5">
            {idx + 1}/{urls.length}
          </span>
        </>
      )}
    </div>
  );
}

export default function Conteudo() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState("aprovar");
  const [conta, setConta] = useState<"todas" | Conta>("todas");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const [alterando, setAlterando] = useState<Post | null>(null);
  const [pedido, setPedido] = useState("");
  const [editando, setEditando] = useState<Post | null>(null);
  const [form, setForm] = useState({ legenda: "", pauta: "", nicho: "" });

  const { toast } = useToast();

  const carregar = useCallback(async () => {
    const { data, error } = await db
      .from("fila_posts").select("*")
      .order("agendado_para", { ascending: true, nullsFirst: false })
      .order("criado_em", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setPosts((data ?? []) as Post[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const daConta = useMemo(
    () => posts.filter((p) => conta === "todas" || p.conta === conta),
    [posts, conta],
  );
  const abaAtual = ABAS.find((a) => a.id === aba)!;
  const lista = useMemo(() => {
    const l = daConta.filter((p) => abaAtual.status.includes(p.status));
    if (aba === "publicados") {
      l.sort((a, b) => (b.publicado_em ?? "").localeCompare(a.publicado_em ?? ""));
    }
    return l;
  }, [daConta, abaAtual, aba]);

  const executar = async (id: string, fn: () => Promise<void>) => {
    setOcupado(id);
    try {
      await fn();
      await carregar();
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  const aprovar = (p: Post) => executar(p.id, async () => {
    const { data, error } = await db.rpc("fila_posts_aprovar", { p_id: p.id });
    if (error) throw new Error(error.message);
    toast({ title: "Aprovado ✓", description: data ? `Sai ${fmtData(data)}.` : "Sem horário livre no calendário." });
  });

  const desaprovar = (p: Post) => executar(p.id, async () => {
    const { error } = await db.from("fila_posts")
      .update({ status: "rascunho", agendado_para: null, atualizado_em: new Date().toISOString() })
      .eq("id", p.id);
    if (error) throw new Error(error.message);
    toast({ title: "Voltou para aprovação" });
  });

  const publicarAgora = (p: Post) => executar(p.id, async () => {
    const { error } = await db.from("fila_posts")
      .update({ agendado_para: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq("id", p.id);
    if (error) throw new Error(error.message);
    const { data, error: fnErr } = await supabase.functions.invoke("publicar-instagram", { body: {} });
    if (fnErr) throw new Error(fnErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (data?.resultados ?? []).find((x: any) => x.id === p.id);
    if (r?.ok === false) throw new Error(r.erro ?? "Falha ao publicar");
    toast({
      title: r?.pendente ? "Instagram ainda processando" : "Publicado ✓",
      description: r?.pendente ? "O vídeo está sendo processado; sai na próxima rodada (até 15 min)." : undefined,
    });
  });

  const enviarPedido = () => {
    if (!alterando || !pedido.trim()) return;
    const p = alterando;
    executar(p.id, async () => {
      const { error } = await db.from("fila_posts")
        .update({ status: "revisar", feedback: pedido.trim(), agendado_para: null, atualizado_em: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw new Error(error.message);
      toast({ title: "Alteração pedida", description: "O Claude refaz e devolve para aprovação." });
      setAlterando(null);
      setPedido("");
    });
  };

  const abrirEdicao = (p: Post) => {
    setEditando(p);
    setForm({ legenda: p.legenda, pauta: p.pauta ?? "", nicho: p.nicho ?? "" });
  };

  const salvarEdicao = () => {
    if (!editando || !form.legenda.trim()) return;
    const p = editando;
    executar(p.id, async () => {
      const { error } = await db.from("fila_posts").update({
        legenda: form.legenda.trim(),
        pauta: form.pauta.trim() || null,
        nicho: form.nicho.trim() || null,
        atualizado_em: new Date().toISOString(),
      }).eq("id", p.id);
      if (error) throw new Error(error.message);
      toast({ title: "Post atualizado" });
      setEditando(null);
    });
  };

  const excluir = (p: Post) => executar(p.id, async () => {
    const { error } = await db.from("fila_posts").delete().eq("id", p.id);
    if (error) throw new Error(error.message);
    const arquivos = [...p.midia_urls, p.capa_url ?? ""].map(caminhoNoBucket).filter(Boolean) as string[];
    if (arquivos.length) await supabase.storage.from("posts").remove(arquivos);
    toast({ title: "Post excluído" });
  });

  // Calendário: próximos dias de publicação e o que já está encaixado em cada horário.
  const calendario = useMemo(() => {
    const ocupados = posts.filter((p) => ["aprovado", "publicando", "publicado"].includes(p.status) && p.agendado_para);
    return proximosDiasDePublicacao(4).map((dia) => ({
      dia,
      slots: (Object.keys(CONTAS) as Conta[])
        .filter((c) => conta === "todas" || c === conta)
        .flatMap((c) => (["feed", "reels"] as const).map((k) => ({
          conta: c, k,
          post: ocupados.find((p) =>
            p.conta === c && (p.tipo === "reels") === (k === "reels") &&
            differenceInCalendarDays(new Date(p.agendado_para!), dia) === 0),
        }))),
    }));
  }, [posts, conta]);

  const contagem = (status: Status[]) => daConta.filter((p) => status.includes(p.status)).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clapperboard className="h-6 w-6" /> Conteúdo
          </h1>
          <p className="text-sm text-muted-foreground">
            O Claude cria, você aprova. Aprovado entra sozinho no calendário: dia sim, dia não, feed às 12h e Reels às 19h.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={conta} onValueChange={(v) => setConta(v as typeof conta)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as contas</SelectItem>
              <SelectItem value="vision_ai">Vision AI</SelectItem>
              <SelectItem value="cot_ai">COT-AI</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); carregar(); }}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Calendário */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {calendario.map(({ dia, slots }) => (
          <Card key={dia.toISOString()}>
            <CardContent className="p-3 space-y-1.5">
              <p className="text-xs font-semibold capitalize">{format(dia, "EEE, dd/MM", { locale: ptBR })}</p>
              {slots.map((s) => (
                <div key={s.conta + s.k} className="flex items-center justify-between text-[11px] gap-1">
                  <span className="text-muted-foreground truncate">
                    {CONTAS[s.conta]} · {s.k === "reels" ? "Reels 19h" : "Feed 12h"}
                  </span>
                  {s.post
                    ? <Check className={`h-3.5 w-3.5 shrink-0 ${s.post.status === "publicado" ? "text-muted-foreground" : "text-primary"}`} />
                    : <span className="text-warning shrink-0">vazio</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex-wrap h-auto">
          {ABAS.map((a) => {
            const n = contagem(a.status);
            return (
              <TabsTrigger key={a.id} value={a.id} className="gap-1.5">
                {a.label}
                {n > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n}</Badge>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : lista.length === 0 ? (
        <Card><CardContent className="p-8 text-sm text-muted-foreground text-center">
          {aba === "aprovar" ? "Nada esperando aprovação. Os próximos rascunhos do Claude aparecem aqui." : "Nada por aqui."}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => {
            const TipoIcon = TIPOS[p.tipo].icon;
            const aberto = expandido[p.id];
            const busy = ocupado === p.id;
            return (
              <Card key={p.id}>
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
                  <Midia post={p} />

                  <div className="space-y-3 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className="text-[10px]">{CONTAS[p.conta]}</Badge>
                      <Badge variant="outline" className="text-[10px] gap-1"><TipoIcon className="h-3 w-3" />{TIPOS[p.tipo].label}</Badge>
                      {p.nicho && <Badge variant="outline" className="text-[10px]">{p.nicho}</Badge>}
                      {p.status === "publicando" && <Badge variant="outline" className="text-[10px]">publicando…</Badge>}
                      {p.agendado_para && p.status !== "publicado" && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 capitalize">
                          <CalendarClock className="h-3.5 w-3.5" /> {fmtData(p.agendado_para)}
                        </span>
                      )}
                      {p.publicado_em && (
                        <span className="text-xs text-muted-foreground capitalize">Publicado {fmtData(p.publicado_em)}</span>
                      )}
                    </div>

                    {p.pauta && <p className="text-xs text-muted-foreground"><span className="font-medium">Pauta:</span> {p.pauta}</p>}

                    <div>
                      <p className={`text-sm whitespace-pre-wrap ${aberto ? "" : "line-clamp-5"}`}>{p.legenda}</p>
                      {p.legenda.split("\n").length > 5 || p.legenda.length > 320 ? (
                        <button
                          className="text-xs text-primary mt-1"
                          onClick={() => setExpandido({ ...expandido, [p.id]: !aberto })}
                        >
                          {aberto ? "ver menos" : "ver legenda inteira"}
                        </button>
                      ) : null}
                    </div>

                    {p.status === "revisar" && p.feedback && (
                      <div className="text-xs rounded-md border border-warning/30 bg-warning/10 p-2">
                        <span className="font-medium">Seu pedido:</span> {p.feedback}
                      </div>
                    )}
                    {p.erro && (p.status === "erro" || p.status === "aprovado") && (
                      <div className="text-xs rounded-md border border-destructive/30 bg-destructive/10 p-2 flex gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                        <span className="break-all">{p.erro}</span>
                      </div>
                    )}
                    {(p.referencias ?? []).length > 0 && (
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        <span className="font-medium">Referências:</span>
                        {(p.referencias ?? []).map((r) => (
                          <a key={r} href={r} target="_blank" rel="noreferrer" className="block truncate hover:text-primary">{r}</a>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {(p.status === "rascunho" || p.status === "revisar") && (
                        <Button size="sm" className="h-8" disabled={busy} onClick={() => aprovar(p)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                        </Button>
                      )}
                      {p.status === "rascunho" && (
                        <Button size="sm" variant="outline" className="h-8" disabled={busy}
                          onClick={() => { setAlterando(p); setPedido(""); }}>
                          <MessageSquareWarning className="h-3.5 w-3.5 mr-1" /> Pedir alteração
                        </Button>
                      )}
                      {p.status === "aprovado" && (
                        <>
                          <Button size="sm" className="h-8" disabled={busy} onClick={() => publicarAgora(p)}>
                            <Send className="h-3.5 w-3.5 mr-1" /> {busy ? "Publicando…" : "Publicar agora"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => desaprovar(p)}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" /> Desaprovar
                          </Button>
                        </>
                      )}
                      {(p.status === "erro" || p.status === "cancelado") && (
                        <Button size="sm" className="h-8" disabled={busy} onClick={() => aprovar(p)}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar de novo
                        </Button>
                      )}
                      {p.permalink && (
                        <Button size="sm" variant="outline" className="h-8" asChild>
                          <a href={p.permalink} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver no Instagram
                          </a>
                        </Button>
                      )}
                      {p.status !== "publicado" && p.status !== "publicando" && (
                        <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => abrirEdicao(p)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      )}
                      {p.status !== "publicando" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-destructive" disabled={busy}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir este post?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {p.status === "publicado"
                                  ? "Sai da lista do sistema, mas continua no Instagram. Para tirar do perfil, apague pelo app do Instagram."
                                  : "O post e as mídias dele são apagados. Não dá para desfazer."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(p)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pedir alteração */}
      <Dialog open={!!alterando} onOpenChange={(o) => !o && setAlterando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir alteração</DialogTitle>
            <DialogDescription>Diga o que mudar. O Claude refaz o post e ele volta para aprovação.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5} value={pedido} onChange={(e) => setPedido(e.target.value)}
            placeholder="Ex.: gancho mais forte na primeira linha, trocar a imagem 3, falar de clínicas em vez de imobiliárias…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlterando(null)}>Cancelar</Button>
            <Button onClick={enviarPedido} disabled={!pedido.trim() || !!ocupado}>Enviar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar post</DialogTitle>
            <DialogDescription>Ajuste o texto direto. Para trocar imagem ou vídeo, use "Pedir alteração".</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label>Legenda</Label>
                <span className={`text-xs ${form.legenda.length > 2200 ? "text-destructive" : "text-muted-foreground"}`}>
                  {form.legenda.length}/2200
                </span>
              </div>
              <Textarea rows={12} value={form.legenda} onChange={(e) => setForm({ ...form, legenda: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
              <div className="space-y-1.5">
                <Label>Pauta</Label>
                <Input value={form.pauta} onChange={(e) => setForm({ ...form, pauta: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nicho</Label>
                <Input value={form.nicho} onChange={(e) => setForm({ ...form, nicho: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={!form.legenda.trim() || form.legenda.length > 2200 || !!ocupado}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
