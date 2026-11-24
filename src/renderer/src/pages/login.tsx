import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  FileCheck,
  FileSpreadsheet,
  Landmark,
  Lock,
  Loader2,
  Package,
  Receipt,
  ServerCog,
  ShieldCheck,
  ShoppingCart,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

type LoginValues = {
  utilizador: string;
  senha: string;
};

const loginSchema = z.object({
  utilizador: z
    .string()
    .trim()
    .min(3, "O utilizador deve ter pelo menos 3 caracteres")
    .max(50, "O utilizador não pode exceder os 50 caracteres"),
  senha: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres")
    .max(100, "A senha não pode exceder os 100 caracteres"),
});

// Nomes e descrições alinhados com o painel "Módulos Disponíveis" de inicio.tsx.
const modules = [
  {
    title: "Vendas & Faturação",
    description: "Faturas, recibos e notas de crédito.",
    icon: ShoppingCart,
  },
  {
    title: "Compras & Fornecedores",
    description: "Encomendas, receção e fornecedores.",
    icon: Receipt,
  },
  {
    title: "Stock & Armazéns",
    description: "Inventário, movimentos e armazéns.",
    icon: Package,
  },
  {
    title: "Finanças & Tesouraria",
    description: "Contas, extratos e reconciliação.",
    icon: Landmark,
  },
  {
    title: "Comercial & Clientes",
    description: "Clientes, crédito e condições.",
    icon: Building2,
  },
  {
    title: "Fiscal & SAF-T (PT/AO)",
    description: "SAF-T, fechos e conformidade.",
    icon: FileCheck,
  },
  {
    title: "Relatórios & Análise",
    description: "Mapas, stock e rentabilidade.",
    icon: FileSpreadsheet,
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      utilizador: "",
      senha: "",
    },
  });

  const onSubmit = async (data: LoginValues) => {
    const success = await login({
      utilizador: data.utilizador,
      senha: data.senha,
    });

    if (success) {
      const currentUser = useAuth.getState().user;
      toast.success("Autenticação efetuada com sucesso!", {
        description: `Bem-vindo de volta, ${currentUser?.nomeCompleto || data.utilizador}!`,
      });
      void navigate("/inicio");
    } else {
      const errorMsg = useAuth.getState().error;
      toast.error("Erro na autenticação", {
        description: errorMsg || "Utilizador ou senha incorretos.",
      });
    }
  };

  const inputClassName =
    "h-11 rounded-lg border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-slate-400 hover:border-white/20 focus-visible:border-cyan-400/60 focus-visible:ring-2 focus-visible:ring-cyan-400/30 focus-visible:ring-offset-0";

  return (
    <main className="login-page flex min-h-screen w-full overflow-x-hidden bg-primary-deep font-sans text-slate-100">
      {/* Painel informativo — visível apenas quando há espaço para uma leitura confortável. */}
      <section className="hidden min-h-screen w-[46%] shrink-0 flex-col justify-between gap-6 border-r border-white/10 bg-primary-deep px-10 py-7 2xl:px-16 lg:flex">
        <header className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-400 text-base font-bold text-slate-950">
            ST
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-white">SOC TECHNO</p>
            <p className="truncate text-xs text-slate-400">Sistema de Gestão Empresarial</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200">
            ERP · Angola
          </span>
        </header>

        <div className="mx-auto w-full max-w-2xl flex-1 py-2">
          <h1 className="max-w-xl text-[clamp(1.75rem,2.5vw,2.75rem)] font-semibold leading-[1.14] tracking-tight text-white">
            A plataforma operacional{" "}
            <span className="mt-1 block text-slate-300">para o seu negócio em Angola.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
            Vendas, stock, compras, finanças, fiscal e relatórios num só sistema — com informação
            clara para cada decisão.
          </p>

          <ul className="mt-6 grid grid-cols-2 gap-2.5" aria-label="Módulos do sistema">
            {modules.map(({ title, description, icon: Icon }, index) => (
              <li
                key={title}
                className={`rounded-lg border border-white/10 bg-white/[0.04] p-2.5 transition-colors duration-200 hover:border-cyan-300/30 hover:bg-white/[0.07] motion-reduce:transition-none ${
                  index === modules.length - 1 ? "col-span-2" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-400">
                    MVP
                  </span>
                </div>
                <h2 className="mt-2 text-[12px] font-semibold leading-tight text-white">{title}</h2>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <footer className="text-[11px] text-slate-400">
          © 2026 SOC TECHNO. Todos os direitos reservados.
        </footer>
      </section>

      {/* Painel de autenticação — escopo .dark local usa o fundo escuro do sistema. */}
      <section className="login-auth dark flex min-h-screen w-full flex-col bg-background text-foreground px-6 py-8 sm:px-10 lg:w-[54%] xl:px-16">
        <h1 className="sr-only lg:hidden">SOC TECHNO — Acesso ao sistema</h1>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-cyan-400 text-xs font-bold text-slate-950">
              ST
            </div>
            <span className="text-sm font-semibold text-white">SOC TECHNO</span>
          </div>
          <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            <ServerCog className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            Servidor Luanda
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            <header className="mb-8">
              <h2 className="text-3xl font-semibold tracking-tight text-white">Bem-vindo de volta</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Introduza as suas credenciais para aceder ao sistema.
              </p>
            </header>

            <form
              onSubmit={(event) => {
                void handleSubmit(onSubmit)(event);
              }}
              aria-busy={isLoading}
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="utilizador" className="text-sm font-medium text-slate-200">
                    Utilizador
                  </Label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <Input
                      id="utilizador"
                      type="text"
                      placeholder="Ex: nome do utilizador"
                      className={`${inputClassName} ${errors.utilizador ? "border-red-400/70 focus-visible:border-red-400 focus-visible:ring-red-400/30" : ""}`}
                      aria-invalid={errors.utilizador ? true : undefined}
                      aria-describedby={errors.utilizador ? "utilizador-erro" : undefined}
                      disabled={isLoading}
                      {...register("utilizador")}
                    />
                  </div>
                  {errors.utilizador && (
                    <p
                      id="utilizador-erro"
                      role="alert"
                      className="flex items-center gap-1.5 text-xs font-medium text-red-300"
                    >
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {errors.utilizador.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="senha" className="text-sm font-medium text-slate-200">
                      Senha
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        toast.info(
                          "Por favor, contacte o administrador do sistema para repor a sua senha.",
                        );
                      }}
                      className="text-xs font-medium text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                    >
                      Esqueceu-se da senha?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <Input
                      id="senha"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className={`${inputClassName} pr-10 ${errors.senha ? "border-red-400/70 focus-visible:border-red-400 focus-visible:ring-red-400/30" : ""}`}
                      aria-invalid={errors.senha ? true : undefined}
                      aria-describedby={errors.senha ? "senha-erro" : undefined}
                      disabled={isLoading}
                      {...register("senha")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.senha && (
                    <p
                      id="senha-erro"
                      role="alert"
                      className="flex items-center gap-1.5 text-xs font-medium text-red-300"
                    >
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {errors.senha.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="remember"
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-white/5 accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                  />
                  <label
                    htmlFor="remember"
                    className="cursor-pointer select-none text-xs text-slate-400"
                  >
                    Manter a sessão iniciada
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                className="mt-7 h-11 w-full rounded-lg bg-cyan-400 text-sm font-semibold text-slate-950 shadow-none hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 motion-reduce:transition-none"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                    A autenticar...
                  </>
                ) : (
                  "Entrar no Sistema"
                )}
              </Button>
            </form>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-[11px] text-slate-400 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span>SOC TECHNO v1.0.0 · © 2026</span>
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            Sistema sincronizado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            Ligação segura
          </span>
        </footer>
      </section>
    </main>
  );
}
