import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Radar as RadarIcon, Loader2, RefreshCw, Sparkles, Rss, Trash2, Pencil,
  ExternalLink, Star, Settings2, Plus,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const db = supabase as any;

interface Item {
  id: string; titulo: string; resumo: string | null; url: string;
  categoria: string; relevancia: number; destaque: boolean;
  fonte_nome: string | null; publicado_em: string | null; coletado_em: string;
}
interface Fonte { id: string; tipo: string; nome: string; url: string; ativo: boolean; }
interface Relatorio {
  id: string; cadencia: string; resumo: string | null; conteudo: string | null; gerado_em: string;
}

const CAT: Record<string, { label: string; cls: string }> = {
  ferramenta: { label: "Ferramenta", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" },
  modelo:     { label: "Modelo",     cls: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  pesquisa:   { label: "Pesquisa",   cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  negocio:    { label: "Negócio",    cls: "bg-amber-500/15 text-amber-500 border-amber-500/20" },
  outro:      { label: "Outro",      cls: "bg-secondary text-muted-foreground border-border" },
};

const mdComponents = {
  h2: ({ children }: any) => <h2 className="text-base font-bold mt-5 mb-2 text-foreground">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-4 mb-1.5 text-foreground">{children}</h3>,
  p: ({ children }: any) => <p className="text-sm text-foreground/90 mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-foreground/90">{children}</ul>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{children}</a>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
};

export default function Radar() {
  const [loading, setLoading] = useState(true);
  const [coletando, setColetando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [filtro, setFiltro] = useState<string>("todas");
  const [fontesOpen, setFontesOpen] = useState(false);
  const { toast } = useToast();

  // form de fonte (add/edit)
  const [fEditId, setFEditId] = useState<string | null>(null);
  const [fTipo, setFTipo] = useState("rss");
  const [fNome, setFNome] = useState("");
  const [fUrl, setFUrl] = useState("");

  async function fetchAll() {
    setLoading(true);
    const [iRes, fRes, rRes] = await Promise.all([
      db.from("mercado_itens").select("*").eq("status", "curado").order("coletado_em", { ascending: false }).limit(150),
      db.from("mercado_fontes").select("*").order("criado_em", { ascending: true }),
      db.from("mercado_relatorios").select("*").order("gerado_em", { ascending: false }).limit(20),
    ]);
    setItens((iRes.data ?? []) as Item[]);
    setFontes((fRes.data ?? []) as Fonte[]);
    setRelatorios((rRes.data ?? []) as Relatorio[]);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleColetar() {
    setColetando(true);
    try {
      const { data, error } = await supabase.functions.invoke("radar-coletar", { body: {} });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast({ title: "Coleta concluída", description: `${data?.curados ?? 0} itens novos de ${data?.fontes ?? 0} fontes.` });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro na coleta", description: e.message, variant: "destructive" });
    } finally {
      setColetando(false);
    }
  }

  async function handleGerar(cadencia: "diario" | "semanal") {
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("radar-relatorio", { body: { cadencia } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast({ title: `Briefing ${cadencia} gerado!` });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao gerar briefing", description: e.message, variant: "destructive" });
    } finally {
      setGerando(false);
    }
  }

  async function handleDeleteItem(id: string) {
    const { error } = await db.from("mercado_itens").delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir", variant: "destructive" });
    setItens((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleDeleteRelatorio(id: string) {
    const { error } = await db.from("mercado_relatorios").delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir", variant: "destructive" });
    setRelatorios((prev) => prev.filter((r) => r.id !== id));
  }

  function resetForm() { setFEditId(null); setFTipo("rss"); setFNome(""); setFUrl(""); }

  async function handleSalvarFonte() {
    if (!fNome.trim() || !fUrl.trim()) return toast({ title: "Preencha nome e URL", variant: "destructive" });
    const payload = { tipo: fTipo, nome: fNome.trim(), url: fUrl.trim() };
    const { error } = fEditId
      ? await db.from("mercado_fontes").update(payload).eq("id", fEditId)
      : await db.from("mercado_fontes").insert(payload);
    if (error) return toast({ title: "Erro ao salvar fonte", description: error.message, variant: "destructive" });
    toast({ title: fEditId ? "Fonte atualizada" : "Fonte adicionada" });
    resetForm();
    await fetchAll();
  }

  async function handleToggleFonte(f: Fonte) {
    const { error } = await db.from("mercado_fontes").update({ ativo: !f.ativo }).eq("id", f.id);
    if (error) return toast({ title: "Erro", variant: "destructive" });
    setFontes((prev) => prev.map((x) => (x.id === f.id ? { ...x, ativo: !x.ativo } : x)));
  }

  async function handleDeleteFonte(id: string) {
    const { error } = await db.from("mercado_fontes").delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir", variant: "destructive" });
    setFontes((prev) => prev.filter((f) => f.id !== id));
  }

  function editarFonte(f: Fonte) { setFEditId(f.id); setFTipo(f.tipo); setFNome(f.nome); setFUrl(f.url); }

  const filtrados = useMemo(
    () => (filtro === "todas" ? itens : itens.filter((i) => i.categoria === filtro)),
    [itens, filtro]
  );
  const ultimo = relatorios[0];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RadarIcon className="h-6 w-6" /> Radar de Mercado IA</h1>
          <p className="text-sm text-muted-foreground mt-1">O que muda no mundo da IA — sem ruído. Curadoria por IA + briefing diário/semanal.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleColetar} disabled={coletando} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${coletando ? "animate-spin" : ""}`} /> {coletando ? "Coletando..." : "Coletar agora"}
          </Button>
          <Button size="sm" onClick={() => handleGerar("diario")} disabled={gerando} className="gap-1.5">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Briefing diário
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleGerar("semanal")} disabled={gerando} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Semanal
          </Button>
          <Dialog open={fontesOpen} onOpenChange={(o) => { setFontesOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><Settings2 className="h-4 w-4" /> Fontes</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Fontes do Radar</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {/* form add/edit */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={fTipo} onValueChange={setFTipo}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rss" className="text-xs">RSS</SelectItem>
                        <SelectItem value="site" className="text-xs">Site</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">Nome</Label>
                    <Input value={fNome} onChange={(e) => setFNome(e.target.value)} className="h-8 text-xs" placeholder="TechCrunch AI" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">URL do feed</Label>
                    <Input value={fUrl} onChange={(e) => setFUrl(e.target.value)} className="h-8 text-xs" placeholder="https://.../feed/" />
                  </div>
                  <div className="col-span-2 flex gap-1">
                    <Button size="sm" className="h-8 flex-1 gap-1" onClick={handleSalvarFonte}>
                      <Plus className="h-3.5 w-3.5" />{fEditId ? "Salvar" : "Add"}
                    </Button>
                  </div>
                </div>

                <div className="max-h-[340px] overflow-y-auto space-y-1.5">
                  {fontes.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                      <Switch checked={f.ativo} onCheckedChange={() => handleToggleFonte(f)} />
                      <Badge variant="outline" className="text-[10px] uppercase">{f.tipo}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{f.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{f.url}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editarFonte(f)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir "{f.nome}"?</AlertDialogTitle>
                            <AlertDialogDescription>A fonte deixará de ser coletada.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteFonte(f.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Briefing mais recente */}
      {ultimo && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Briefing {ultimo.cadencia}
              <span className="text-[11px] font-normal text-muted-foreground">
                · {formatDistanceToNow(new Date(ultimo.gerado_em), { addSuffix: true, locale: ptBR })}
              </span>
            </CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir este briefing?</AlertDialogTitle>
                  <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteRelatorio(ultimo.id)}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{ultimo.conteudo || ""}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros por categoria */}
      <div className="flex gap-1.5 flex-wrap">
        <Button variant={filtro === "todas" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFiltro("todas")}>
          Todas ({itens.length})
        </Button>
        {Object.entries(CAT).map(([k, v]) => {
          const n = itens.filter((i) => i.categoria === k).length;
          if (n === 0) return null;
          return (
            <Button key={k} variant={filtro === k ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFiltro(k)}>
              {v.label} ({n})
            </Button>
          );
        })}
      </div>

      {/* Feed de itens */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Rss className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum item ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em <b>Coletar agora</b> para buscar novidades das fontes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtrados.map((i) => (
            <Card key={i.id} className={i.destaque ? "border-primary/40" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${CAT[i.categoria]?.cls ?? CAT.outro.cls}`}>
                      {CAT[i.categoria]?.label ?? "Outro"}
                    </Badge>
                    {i.destaque && <Star className="h-3.5 w-3.5 text-primary fill-primary" />}
                    <span className="text-[10px] text-muted-foreground">{i.relevancia}</span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive -mt-1 -mr-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover este item?</AlertDialogTitle>
                        <AlertDialogDescription>Ele some do feed do radar.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteItem(i.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <a href={i.url} target="_blank" rel="noreferrer" className="group">
                  <p className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                    {i.titulo} <ExternalLink className="inline h-3 w-3 opacity-50" />
                  </p>
                </a>
                {i.resumo && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{i.resumo}</p>}
                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                  <span>{i.fonte_nome}</span>
                  {i.publicado_em && <span>· {format(new Date(i.publicado_em), "dd/MM HH:mm", { locale: ptBR })}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
