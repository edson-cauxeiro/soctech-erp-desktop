import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RhDividasProcessosManager } from './RhDividasProcessosManager';
import { RhDividasPrestacoesManager } from './RhDividasPrestacoesManager';

export function RhDividasManager() {
  const [tab, setTab] = useState<string>('processos');

  return (
    <div className="space-y-4" data-testid="rh-dividas">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="processos">
            Processos de Dívida
          </TabsTrigger>
          <TabsTrigger value="prestacoes">
            Prestações
          </TabsTrigger>
        </TabsList>
        <TabsContent value="processos">
          <RhDividasProcessosManager />
        </TabsContent>
        <TabsContent value="prestacoes">
          <RhDividasPrestacoesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}