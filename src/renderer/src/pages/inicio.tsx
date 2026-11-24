import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Receipt,
  Package,
  Landmark,
  Building2,
  FileSpreadsheet,
  FileCheck,
  UserRound,
  ArrowRight,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function InicioPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isCompanyConfigured = Boolean(user?.empresaNome && user.empresaNome !== "Empresa não configurada");
  const isAdmin = user?.perfilNome === "Administrador" || Boolean(user?.permissoes?.["*"]);

  const modulesList = [
    {
      title: "Vendas & Faturação",
      desc: "Emissão de faturas, recibos, notas de crédito e consulta de documentos fiscais.",
      icon: <ShoppingCart className="w-5 h-5 text-primary" />,
      path: "/vendas",
      module: "vendas",
    },
    {
      title: "Compras & Fornecedores",
      desc: "Gestão de encomendas, receção de mercadorias e catálogo de fornecedores.",
      icon: <Receipt className="w-5 h-5 text-indigo-500" />,
      path: "/compras",
      module: "compras",
    },
    {
      title: "Stock & Armazéns",
      desc: "Inventário permanente, movimentações de stock e controlo de lotes/artigos.",
      icon: <Package className="w-5 h-5 text-amber-500" />,
      path: "/estoque",
      module: "estoque",
    },
    {
      title: "Finanças & Tesouraria",
      desc: "Contas bancárias, extratos, reconciliação e fluxos de pagamentos.",
      icon: <Landmark className="w-5 h-5 text-emerald-500" />,
      path: "/financas",
      module: "financas",
    },
    {
      title: "Comercial & Clientes",
      desc: "Fichas de clientes, gestão de crédito comercial e condições de pagamento.",
      icon: <Building2 className="w-5 h-5 text-sky-500" />,
      path: "/comercial",
      module: "comercial",
    },
    {
      title: "Fiscal & SAF-T (PT/AO)",
      desc: "Exportação SAF-T, fecho de períodos fiscais e conformidade tributária.",
      icon: <FileCheck className="w-5 h-5 text-purple-500" />,
      path: "/fiscal",
      module: "fiscal",
    },
    {
      title: "Relatórios & Análise",
      desc: "Mapas de vendas, balancetes de stock, rentabilidade e exportações.",
      icon: <FileSpreadsheet className="w-5 h-5 text-blue-500" />,
      path: "/relatorios",
      module: "relatorios",
    },
    {
      title: "Recursos Humanos",
      desc: "Funcionários, salários, processamentos, ausências e obrigações declarativas.",
      icon: <UserRound className="w-5 h-5 text-rose-500" />,
      path: "/rh",
      module: "rh",
    },
  ];

  return (
    <ErpShell
      active="inicio"
      title="Painel Geral"
      breadcrumb={["SOC TECHNO", "Página Inicial"]}
      ribbon={[]}
    >
      <div className="max-w-6xl mx-auto py-6 space-y-8">
        {/* Banner de Aviso caso a Empresa não esteja configurada */}
        {!isCompanyConfigured && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4 text-amber-600 dark:text-amber-400">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold">Configuração da Empresa Pendente</h4>
                <p className="text-xs opacity-90 mt-0.5">
                  Os módulos operacionais exigem os dados fiscais e cadastrais da empresa previamente definidos.
                  {isAdmin ? " Por favor, configure a empresa no módulo de configurações." : " Contacte o administrador para concluir o registo da empresa."}
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/configuracoes")}
                className="border-amber-500/40 hover:bg-amber-500/10 text-xs shrink-0 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 mr-1.5" />
                Configurar Empresa
              </Button>
            )}
          </div>
        )}

        {/* Hero Central / Identidade Visual Neutra */}

        {/*
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card/90 to-card/50 p-8 shadow-sm backdrop-blur-sm">
          <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -top-16 w-80 h-80 bg-primary-glow/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-glow to-primary-deep grid place-items-center text-3xl font-extrabold text-white shadow-lg shadow-primary/25 ring-2 ring-primary/20">
                ST
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/15 text-primary border border-primary/25 mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SISTEMA DE GESTÃO EMPRESARIAL
                </div>
                <h2 className="text-3xl font-black tracking-tight text-foreground">
                  SOC TECHNO <span className="text-primary font-normal">2026</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Empresa Ativa: <span className="font-semibold text-foreground">{user?.empresaNome || "Empresa não configurada"}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-1 text-xs text-muted-foreground border-t md:border-t-0 md:border-l border-border/80 pt-4 md:pt-0 md:pl-6">
              <div className="text-sm font-semibold text-foreground">
                {user?.nomeCompleto || user?.login}
              </div>
              <div className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium">
                Perfil: {user?.perfilNome || "Utilizador"}
              </div>
              <div className="text-[11px] text-muted-foreground/80 mt-1">
                Ambiente de Produção · Ano Fiscal 2026
              </div>
            </div>
          </div>
        </div>
        */}

        {/* Grelha de Acesso aos Módulos do Sistema */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Módulos Disponíveis
            </h3>
            <span className="text-xs text-muted-foreground">
              Selecione um módulo na barra superior ou abaixo para trabalhar
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modulesList.map((item) => (
              <Card
                key={item.path}
                onClick={() => navigate(item.path)}
                className="group border-border/80 hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer bg-card/60 hover:bg-card"
              >
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:scale-105 transition-transform">
                        {item.icon}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                    <span>Aceder ao módulo</span>
                    <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">Abrir &rarr;</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </ErpShell>
  );
}
