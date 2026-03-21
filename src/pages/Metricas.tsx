import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Bot, Mail, Users, Target } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface MetricCard {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

const ESTAGIO_LABELS: Record<string, string> = {
  novo: "Novo",
  enriquecido: "Enriquecido",
  contatado: "Contatado",
  reuniao_agendada: "Reunião",
  perdido: "Perdido",
};

const ESTAGIO_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#22c55e", "#ef4444"];
const PIE_COLORS = ["#22c55e", "#ef4444", "#6366f1", "#f59e0b", "#64748b"];

function KpiCard({ label, value, sub, color }: MetricCard) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color || ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Metricas() {
  const [loading, setLoading] = useState(true);
  const [funilData, setFunilData] = useState<{ name: string; total: number }[]>([]);
  const [iaData, setIaData] = useState({ aceitas: 0, rejeitadas: 0, confiancaMedia: 0 });
  const [emailData, setEmailData] = useState({ enviados: 0, abertos: 0, clicados: 0, bounced: 0 });
  const [fontesData, setFontesData] = useState<{ name: string; value: number }[]>([]);
  const [tempoEstagioData, setTempoEstagioData] = useState<{ estagio: string; dias: number }[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [taxaConversao, setTaxaConversao] = useState(0);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [leadsRes, iaRes, emailRes] = await Promise.all([
      supabase.from("leads").select("status, segmento, criado_em, status_mudou_em"),
      supabase.from("analise_lead_ia").select("aplicado, confianca").eq("user_id", user.id),
      supabase.from("comunicacoes").select("status, tipo, direcao").eq("tipo", "email").eq("direcao", "enviado"),
    ]);

    // Funil de leads
    const leads = leadsRes.data || [];
    setTotalLeads(leads.length);

    const funil = Object.entries(ESTAGIO_LABELS).map(([key, name]) => ({
      name,
      total: leads.filter(l => (l.status || "novo") === key).length,
    }));
    setFunilData(funil);

    // Taxa de conversão (reunião agendada / total)
    const comReuniao = leads.filter(l => l.status === "reuniao_agendada").length;
    setTaxaConversao(leads.length > 0 ? Math.round((comReuniao / leads.length) * 100) : 0);

    // Fontes por segmento
    const segmentoCount: Record<string, number> = {};
    for (const l of leads) {
      const seg = l.segmento || "Não mapeado";
      segmentoCount[seg] = (segmentoCount[seg] || 0) + 1;
    }
    const fontesArr = Object.entries(segmentoCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
    setFontesData(fontesArr);

    // Tempo por estágio
    const tempoPorEstagio: Record<string, number[]> = {};
    for (const l of leads) {
      const status = l.status || "novo";
      const criado = new Date(l.criado_em);
      const diasTotal = Math.round((Date.now() - criado.getTime()) / 86400000);
      if (!tempoPorEstagio[status]) tempoPorEstagio[status] = [];
      tempoPorEstagio[status].push(diasTotal);
    }
    const tempoArr = Object.entries(tempoPorEstagio).map(([estagio, dias]) => ({
      estagio: ESTAGIO_LABELS[estagio] || estagio,
      dias: Math.round(dias.reduce((a, b) => a + b, 0) / dias.length),
    }));
    setTempoEstagioData(tempoArr);

    // Análise IA
    const iaItems = iaRes.data || [];
    const aceitas = iaItems.filter(i => i.aplicado).length;
    const rejeitadas = iaItems.filter(i => !i.aplicado).length;
    const confiancaMedia = iaItems.length > 0
      ? Math.round(iaItems.reduce((sum, i) => sum + (i.confianca || 0), 0) / iaItems.length)
      : 0;
    setIaData({ aceitas, rejeitadas, confiancaMedia });

    // Emails
    const emails = emailRes.data || [];
    setEmailData({
      enviados: emails.length,
      abertos: emails.filter(e => e.status === "aberto" || e.status === "clicado").length,
      clicados: emails.filter(e => e.status === "clicado").length,
      bounced: emails.filter(e => e.status === "bounced").length,
    });

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const taxaAbertura = emailData.enviados > 0
    ? Math.round((emailData.abertos / emailData.enviados) * 100)
    : 0;

  const taxaIa = iaData.aceitas + iaData.rejeitadas > 0
    ? Math.round((iaData.aceitas / (iaData.aceitas + iaData.rejeitadas)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Métricas & Inteligência</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão analítica do pipeline, IA e comunicações</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total de Leads" value={totalLeads} sub="no pipeline" />
        <KpiCard
          label="Taxa Chegou à Reunião"
          value={`${taxaConversao}%`}
          sub={`${funilData.find(f => f.name === "Reunião")?.total || 0} leads`}
          color={taxaConversao > 20 ? "text-success" : "text-warning"}
        />
        <KpiCard
          label="Sugestões IA Aceitas"
          value={`${taxaIa}%`}
          sub={`${iaData.aceitas} de ${iaData.aceitas + iaData.rejeitadas}`}
          color={taxaIa > 60 ? "text-success" : "text-muted-foreground"}
        />
        <KpiCard
          label="Taxa de Abertura Email"
          value={`${taxaAbertura}%`}
          sub={`${emailData.abertos} de ${emailData.enviados}`}
          color={taxaAbertura > 30 ? "text-success" : "text-muted-foreground"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funil de Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Funil de Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funilData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                  {funilData.map((_, i) => (
                    <Cell key={i} fill={ESTAGIO_COLORS[i % ESTAGIO_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Análise IA */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Sugestões de Estágio pela IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {iaData.aceitas + iaData.rejeitadas === 0 ? (
              <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground text-sm">
                <Bot className="h-10 w-10 mb-2 opacity-30" />
                <p>Ainda sem dados de análise IA</p>
                <p className="text-xs mt-1">Habilite a análise de WhatsApp nas configurações</p>
              </div>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Aceitas", value: iaData.aceitas },
                        { name: "Rejeitadas", value: iaData.rejeitadas },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                      labelLine={false}
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-success inline-block" />
                    Aceitas: {iaData.aceitas}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
                    Rejeitadas: {iaData.rejeitadas}
                  </span>
                  <span className="text-muted-foreground">Confiança média: {iaData.confiancaMedia}%</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Performance de Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            {emailData.enviados === 0 ? (
              <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground text-sm">
                <Mail className="h-10 w-10 mb-2 opacity-30" />
                <p>Nenhum email enviado ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[
                    { name: "Enviados", valor: emailData.enviados },
                    { name: "Entregues", valor: emailData.enviados - emailData.bounced },
                    { name: "Abertos", valor: emailData.abertos },
                    { name: "Clicados", valor: emailData.clicados },
                    { name: "Bounced", valor: emailData.bounced },
                  ]}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                      {["#6366f1", "#8b5cf6", "#22c55e", "#3b82f6", "#ef4444"].map((color, i) => (
                        <Cell key={i} fill={color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-secondary/30 rounded p-2 text-center">
                    <p className="text-muted-foreground">Taxa Abertura</p>
                    <p className="font-bold text-success">{taxaAbertura}%</p>
                  </div>
                  <div className="bg-secondary/30 rounded p-2 text-center">
                    <p className="text-muted-foreground">Taxa Clique</p>
                    <p className="font-bold text-primary">
                      {emailData.enviados > 0 ? Math.round((emailData.clicados / emailData.enviados) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads por Segmento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Leads por Segmento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fontesData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground text-sm">
                <Target className="h-10 w-10 mb-2 opacity-30" />
                <p>Enriqueça leads para ver segmentos</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={fontesData}
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, percent }) => percent > 0.05 ? `${Math.round(percent * 100)}%` : ""}
                  >
                    {fontesData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Legend
                    formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tempo médio por estágio */}
      {tempoEstagioData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tempo Médio dos Leads por Estágio (dias desde criação)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tempoEstagioData}>
                <XAxis dataKey="estagio" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(val) => [`${val} dias`, "Tempo médio"]}
                />
                <Bar dataKey="dias" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
