import React, { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronsUpDown, Check, X } from "lucide-react";
import { shouldCloseOnOutsideClick } from "./search-select-outside";

export interface SearchSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SearchSelectProps {
  value?: string;
  onChange: (value: string) => void;
  options: (string | SearchSelectOption)[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  className?: string;
  id?: string;
  name?: string;
  hasError?: boolean;
  /** Renderiza o dropdown num portal de posição fixed, ideal para uso dentro de tabelas com overflow:hidden */
  portal?: boolean;
}

export function SearchSelect({
  value = "",
  onChange,
  options,
  placeholder = "Selecionar ou pesquisar...",
  disabled = false,
  required = false,
  allowClear = true,
  className = "",
  id,
  hasError = false,
  portal = false,
}: SearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Normaliza a lista de opções para objetos { value, label, icon }
  const normalizedOptions: SearchSelectOption[] = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Opção atualmente selecionada
  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value);
  }, [normalizedOptions, value]);

  // Opções filtradas pela busca
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) {
      return normalizedOptions;
    }
    const q = searchTerm.toLowerCase().trim();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchTerm]);

  // Sincroniza o texto do input com o valor selecionado quando o dropdown estiver fechado
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(selectedOption ? selectedOption.label : "");
      setHighlightedIndex(-1);
    }
  }, [isOpen, selectedOption]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        shouldCloseOnOutsideClick(
          event.target,
          containerRef.current,
          listRef.current,
          portal
        )
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, portal]);

  // Rola o item destacado para a visualização
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-option-index]");
      const target = items[highlightedIndex] as HTMLElement;
      if (target) {
        target.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const updateDropdownPosition = useCallback(() => {
    if (!portal || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 240;
    const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      minWidth: Math.max(rect.width, 240),
      maxWidth: "90vw",
      zIndex: 9999,
      // O Radix Dialog coloca `pointer-events: none` no body enquanto o modal
      // está aberto. A lista vive num portal fora do diálogo, por isso precisa
      // de reactivar os cliques nela.
      pointerEvents: "auto",
      ...(showAbove
        ? { bottom: viewportHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [portal]);

  useEffect(() => {
    if (!isOpen || !portal) return;
    updateDropdownPosition();
    window.addEventListener("scroll", updateDropdownPosition, true);
    window.addEventListener("resize", updateDropdownPosition);
    return () => {
      window.removeEventListener("scroll", updateDropdownPosition, true);
      window.removeEventListener("resize", updateDropdownPosition);
    };
  }, [isOpen, portal, updateDropdownPosition]);

  const handleOpen = () => {
    if (disabled) return;
    if (portal) updateDropdownPosition();
    setIsOpen(true);
    setSearchTerm("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    const chosen = normalizedOptions.find((o) => o.value === val);
    setSearchTerm(chosen ? chosen.label : "");
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
    if (isOpen) {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        handleOpen();
        return;
      }
    }

    if (isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (
          highlightedIndex >= 0 &&
          highlightedIndex < filteredOptions.length
        ) {
          handleSelect(filteredOptions[highlightedIndex].value);
        } else if (filteredOptions.length > 0) {
          handleSelect(filteredOptions[0].value);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm(selectedOption ? selectedOption.label : "");
      }
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Campo de Input com Busca Direta */}
      <div
        onClick={handleOpen}
        className={`relative flex items-center w-full h-9 rounded-md border bg-background text-sm transition-colors cursor-text ${
          hasError
            ? "border-destructive ring-1 ring-destructive/30"
            : isOpen
            ? "border-primary ring-2 ring-primary/20"
            : "border-input hover:border-muted-foreground/50"
        } ${disabled ? "opacity-50 cursor-not-allowed bg-muted" : ""}`}
      >
        <div className="flex items-center pl-2.5 pr-1.5 text-muted-foreground pointer-events-none">
          <Search className="w-3.5 h-3.5 opacity-60" />
        </div>

        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          value={isOpen ? searchTerm : selectedOption ? selectedOption.label : ""}
          placeholder={selectedOption ? selectedOption.label : placeholder}
          onChange={(e) => {
            if (!isOpen) setIsOpen(true);
            setSearchTerm(e.target.value);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (!isOpen) {
              setIsOpen(true);
              setSearchTerm("");
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full h-full pr-8 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-normal"
        />

        {/* Botões de Ação (Limpar e Chevron) */}
        <div className="absolute right-2 flex items-center gap-1">
          {allowClear && !required && value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                if (isOpen) {
                  setIsOpen(false);
                } else {
                  handleOpen();
                }
              }
            }}
            className="p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>
      </div>

      {/* Menu Dropdown de Opções */}
      {isOpen && (() => {
        const dropdownContent = (
          <div
            ref={listRef}
            style={portal ? dropdownStyle : undefined}
            className={`${
              portal
                ? "rounded-md border border-border bg-popover text-popover-foreground shadow-xl max-h-60 overflow-y-auto p-1 text-sm"
                : "absolute left-0 right-0 top-full mt-1.5 z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 max-h-60 overflow-y-auto p-1 text-sm"
            }`}
          >
            {filteredOptions.length === 0 ? (
              <div className="py-3 px-2 text-center text-xs text-muted-foreground">
                Nenhuma opção encontrada para &ldquo;{searchTerm}&rdquo;
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={opt.value}
                    data-option-index={idx}
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between px-2.5 py-2 rounded text-xs cursor-pointer select-none transition-colors ${
                      isSelected
                        ? "bg-primary/15 text-primary font-semibold"
                        : isHighlighted
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted/70"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
        return portal ? createPortal(dropdownContent, document.body) : dropdownContent;
      })()}
    </div>
  );
}
