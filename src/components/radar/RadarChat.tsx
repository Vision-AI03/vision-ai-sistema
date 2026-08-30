import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search, Plus, Send, Loader2, Trash2, MessageSquare, ExternalLink, Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const db = supabase as any;

interface Thread { id: string; titulo: string; atualizado_em: string; }
interface Fonte { url: string; titulo: string; }
interface Msg { id: string; papel: "user" | "assistant"; conteudo: string; fontes: Fonte[] | null; criado_em: string; pendente?: boolean; }

const md = {
  h2: ({ children }: any) => <h2 className="text-sm font-bold mt-3 mb-1.5 text-foreground">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-2.5 mb-1 text-foreground">{children}</h3>,
  p: ({ children }: any) => <p className="text-sm text-foreground/90 mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1 mb-2 text-sm text-foreground/90">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1 mb-2 text-sm text-foreground/90">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{children}</a>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-border px-2 py-1 bg-secondary text-left font-semibold">{children}</th>,
  td: ({ children }: any) => <td className="border border-border px-2 py-1">{children}</td>,
  code: ({ children }: any) => <code className="px-1 py-0.5 rounded bg-secondary text-xs">{children}</code>,
};

export default function RadarChat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [busca, setBusca] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const { toast } = useToast();
  const fimRef = useRef<HTMLDivElement>(null);

  async function fetchThreads() {
    const { data } = await db.from("radar_chat_threads").select("id, titulo, atualizado_em").order("atualizado_em", { ascending: false }).limit(100);
    setThreads((data ?? []) as Thread[]);
  }
  useEffect(() => { fetchThreads(); }, []);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function abrirThread(id: string) {
    setActiveId(id);
    setCarregandoMsgs(true);
    const { data } = await db.from("radar_chat_mensagens").select("*").eq("thread_id", id).order("criado_em", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
    setCarregandoMsgs(false);
  }

  function novaConversa() {
    setActiveId(null);
    setMsgs([]);
    setInput("");
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || enviando) return;
    setInput("");
    const tmpUser: Msg = { id: `tmp-u-${Date.now()}`, papel: "user", conteudo: texto, fontes: null, criado_em: new Date().toISOString() };
    const tmpBot: Msg = { id: `tmp-a-${Date.now()}`, papel: "assistant", conteudo: "", fontes: null, criado_em: new Date().toISOString(), pendente: true };
    setMsgs((p) => [...p, tmpUser, tmpBot]);
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("radar-chat", {
        body: { thread_id: activeId, mensagem: texto },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      setMsgs((p) => p.map((m) => m.id === tmpBot.id
        ? { ...m, conteudo: data.resposta, fontes: data.fontes ?? [], pendente: false }
        : m));
      if (data?.thread_id && !activeId) setActiveId(data.thread_id);
      if (data?.nova_thread) fetchThreads();
      else setThreads((prev) => {
        const t = prev.find((x) => x.id === data.thread_id);
        if (!t) return prev;
        return [{ ...t, atualizado_em: new Date().toISOString() }, ...prev.filter((x) => x.id !== data.thread_id)];
      });
    } catch (e: any) {
      setMsgs((p) => p.filter((m) => m.id !== tmpBot.id));
      toast({ title: "Erro na pesquisa", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function excluirThread(id: string) {
    const { error } = await db.from("radar_chat_threads").delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir", variant: "destructive" });
    setThreads((p) => p.filter((t) => t.id !== id));
    if (activeId === id) novaConversa();
  }

  const filtrados = busca.trim()
    ? threads.filter((t) => t.titulo.toLowerCase().includes(busca.toLowerCase()))
    : threads;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 h-[calc(100vh-220px)] min-h-[460px]">
      {/* Coluna: conversas + lupa */}
      <div className="flex flex-col border border-border rounded-lg overflow-hidden">
        <div className="p-2 border-b border-border space-y-2">
          <Button size="sm" className="w-full gap-1.5" onClick={novaConversa}>
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tema..." className="h-8 pl-7 text-xs" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center p-4">
              {busca ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
            </p>
          ) : filtrados.map((t) => (
            <div
              key={t.id}
              className={`group flex items-center gap-1.5 px-2.5 py-2 border-b border-border/50 cursor-pointer hover:bg-secondary/60 ${activeId === t.id ? "bg-secondary" : ""}`}
              onClick={() => abrirThread(t.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{t.titulo}</p>
                <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(t.atualizado_em), { addSuffix: true, locale: ptBR })}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir "{t.titulo}"?</AlertDialogTitle>
                    <AlertDialogDescription>A conversa e suas mensagens serão apagadas.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => excluirThread(t.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </div>

      {/* Coluna: mensagens */}
      <div className="flex flex-col border border-border rounded-lg overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {carregandoMsgs ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : msgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <Sparkles className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Pergunte sobre qualquer tema de IA / mercado.</p>
              <p className="text-xs text-muted-foreground">A IA busca na web e responde com fontes.</p>
            </div>
          ) : msgs.map((m) => (
            <div key={m.id} className={`flex ${m.papel === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${m.papel === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {m.pendente ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Pesquisando na web…
                  </div>
                ) : m.papel === "user" ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.conteudo}</p>
                ) : (
                  <>
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{m.conteudo}</ReactMarkdown>
                    </div>
                    {m.fontes && m.fontes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
                        {m.fontes.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border text-muted-foreground hover:text-primary max-w-[220px] truncate">
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{f.titulo}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={fimRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-2.5 flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Pergunte um tema... (Enter envia, Shift+Enter quebra linha)"
            className="min-h-[42px] max-h-32 text-sm resize-none"
            rows={1}
            disabled={enviando}
          />
          <Button size="icon" className="h-[42px] w-[42px] shrink-0" onClick={enviar} disabled={enviando || !input.trim()}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
