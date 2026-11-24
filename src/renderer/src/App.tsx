import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster } from "./components/ui/sonner";
import { DbConfigPanel } from "./components/system/DbConfigPanel";
import { useDbConfigShortcut } from "./hooks/useDbConfigShortcut";
import InicioPage from "./pages/inicio";
import VendasPage from "./pages/vendas";
import FinancasPage from "./pages/financas";
import ComprasPage from "./pages/compras";
import StockPage from "./pages/estoque";
import ComercialPage from "./pages/comercial";
import RhPage from "./pages/rh";
import RelatoriosPage from "./pages/relatorios";
import FiscalPage from "./pages/fiscal";
import ConfiguracoesPage from "./pages/configuracoes";
import LoginPage from "./pages/login";
import NotFoundPage from "./pages/not-found";

export default function App() {
  const { isOpen, setIsOpen } = useDbConfigShortcut();

  return (
    // `HashRouter` e não `BrowserRouter`: o renderer é carregado com
    // `loadFile`, ou seja um URL `file:`. Com `BrowserRouter` o `pathname`
    // passa a ser o caminho do ficheiro em disco
    // (`/R:/projecao/out/renderer/index.html`), que não casa com nenhuma
    // rota e leva a app a abrir no 404 em qualquer build. Sobre `file:` só o
    // fragmento é interpretável, e é o que o `HashRouter` usa.
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          {/* Redirect root to Inicio (which triggers ProtectedRoute) */}
          <Route path="/" element={<Navigate to="/inicio" replace />} />

          {/* Public Login Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Main Landing Route */}
          <Route
            path="/inicio"
            element={
              <ProtectedRoute>
                <InicioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendas"
            element={
              <ProtectedRoute module="vendas">
                <VendasPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/financas"
            element={
              <ProtectedRoute module="financas">
                <FinancasPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/compras"
            element={
              <ProtectedRoute module="compras">
                <ComprasPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/estoque"
            element={
              <ProtectedRoute module="estoque">
                <StockPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/comercial"
            element={
              <ProtectedRoute module="comercial">
                <ComercialPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rh"
            element={
              <ProtectedRoute module="rh">
                <RhPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/relatorios"
            element={
              <ProtectedRoute module="relatorios">
                <RelatoriosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fiscal"
            element={
              <ProtectedRoute module="fiscal">
                <FiscalPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <ProtectedRoute module="configuracoes" action="admin">
                <ConfiguracoesPage />
              </ProtectedRoute>
            }
          />

          {/* 404 fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <Toaster position="top-right" />
        <DbConfigPanel
          key={isOpen ? 'aberto' : 'fechado'}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      </ErrorBoundary>
    </HashRouter>
  );
}
