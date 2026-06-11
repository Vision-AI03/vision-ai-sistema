import {
  LayoutDashboard, Users, MessageSquare, FileText, DollarSign, LogOut,
  KeyRound, CheckSquare, DatabaseBackup, Webhook, BarChart2, Zap,
  CalendarDays, ScrollText, BrainCircuit, Target, Sun,
} from "lucide-react";
import logoVision from "@/assets/logo_vision_transparent_transparent.png";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Hoje", url: "/", icon: Sun },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "CRM", url: "/crm", icon: Users },
  { title: "Prospecção", url: "/prospeccao", icon: Target },
  { title: "Comunicações", url: "/comunicacoes", icon: MessageSquare },
  { title: "Propostas", url: "/propostas", icon: ScrollText },
  { title: "Contratos", url: "/contratos", icon: FileText },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Tarefas", url: "/tarefas", icon: CheckSquare },
  { title: "Reuniões", url: "/reunioes", icon: CalendarDays },
];

const analyticsItems = [
  { title: "Métricas", url: "/metricas", icon: BrainCircuit },
  { title: "Relatórios", url: "/relatorios", icon: BarChart2 },
];

const configItems = [
  { title: "Automações", url: "/configuracoes/automacoes", icon: Zap },
  { title: "Credenciais", url: "/configuracoes/credenciais", icon: KeyRound },
  { title: "Integrações", url: "/configuracoes/integracoes", icon: Webhook },
  { title: "Backup", url: "/configuracoes/backup", icon: DatabaseBackup },
];

export function AppSidebar() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const linkClass = "hover:bg-sidebar-accent";
  const activeLinkClass = "bg-sidebar-accent text-primary font-medium";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src={logoVision} alt="Vision AI" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold gradient-primary-text">Vision AI</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/"} className={linkClass} activeClassName={activeLinkClass}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">Análise</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={linkClass} activeClassName={activeLinkClass}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {configItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={linkClass} activeClassName={activeLinkClass}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
