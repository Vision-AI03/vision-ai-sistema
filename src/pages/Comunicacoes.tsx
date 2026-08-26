import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Mailbox, MessageCircle, Clock, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ListasNichoTab } from "@/components/comunicacoes/ListasNichoTab";
import { WhatsAppTab } from "@/components/comunicacoes/WhatsAppTab";
import { HistoricoTab } from "@/components/comunicacoes/HistoricoTab";
import { ListasTab } from "@/components/comunicacoes/ListasTab";

export default function Comunicacoes() {
  const [importerOpen, setImporterOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Comunicações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Listas alimentadas pela Prospecção, copy gerado por IA, envio agendado anti-spam e abordagem WhatsApp assistida.
          </p>
        </div>
        <Sheet open={importerOpen} onOpenChange={setImporterOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Importar lista manualmente
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[90vw] sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Importar lista manual</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <ListasTab listas={[]} onRefresh={() => {}} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Tabs defaultValue="listas" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="listas" className="gap-1.5">
            <Mailbox className="h-4 w-4" /> Listas por Nicho
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <Clock className="h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listas"><ListasNichoTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="historico"><HistoricoTab /></TabsContent>
      </Tabs>
    </div>
  );
}
