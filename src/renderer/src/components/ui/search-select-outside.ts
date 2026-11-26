/**
 * Decide se um clique fora do input deve fechar o dropdown do SearchSelect.
 *
 * Com `portal`, a lista vive no `document.body` e não dentro do contentor do
 * campo. Sem esta verificação, um clique numa opção é tratado como "fora" e
 * fecha o dropdown no `mousedown`, antes do `click` da opção.
 */
export function shouldCloseOnOutsideClick(
  target: EventTarget | null,
  container: HTMLElement | null,
  list: HTMLElement | null,
  portal: boolean
): boolean {
  if (!container) return false;
  const node = target as Node | null;
  if (container.contains(node)) return false;
  return !(portal && list?.contains(node) === true);
}
