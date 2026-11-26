import { describe, it, expect } from "vitest";
import { shouldCloseOnOutsideClick } from "./search-select-outside";

/** Nó mínimo com `contains`, suficiente para testar a decisão de fecho. */
function noComFilhos(): HTMLElement {
  const filhos: unknown[] = [];
  return {
    contains: (node: unknown) => filhos.includes(node),
    filhos,
  } as unknown as HTMLElement;
}

function alvo(): EventTarget {
  return {} as EventTarget;
}

describe("shouldCloseOnOutsideClick", () => {
  it("não fecha ao clicar dentro do campo", () => {
    const container = noComFilhos();
    const clicado = alvo();
    (container as unknown as { filhos: unknown[] }).filhos.push(clicado);

    expect(shouldCloseOnOutsideClick(clicado, container, null, false)).toBe(false);
  });

  it("fecha ao clicar fora, sem portal", () => {
    const container = noComFilhos();

    expect(shouldCloseOnOutsideClick(alvo(), container, null, false)).toBe(true);
  });

  it("não fecha ao clicar numa opção da lista em portal", () => {
    const container = noComFilhos();
    const lista = noComFilhos();
    const clicado = alvo();
    (lista as unknown as { filhos: unknown[] }).filhos.push(clicado);

    expect(shouldCloseOnOutsideClick(clicado, container, lista, true)).toBe(false);
  });

  it("fecha ao clicar fora do campo e da lista em portal", () => {
    const container = noComFilhos();
    const lista = noComFilhos();

    expect(shouldCloseOnOutsideClick(alvo(), container, lista, true)).toBe(true);
  });

  it("fecha ao clicar fora mesmo quando não há lista montada", () => {
    const container = noComFilhos();

    expect(shouldCloseOnOutsideClick(alvo(), container, null, true)).toBe(true);
  });
});
