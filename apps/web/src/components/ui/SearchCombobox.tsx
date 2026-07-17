'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ants/ui';

/** Opção de um dropdown pesquisável. `data` transporta campos extra (preço, stock, NUIT…). */
export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
  data?: Record<string, string | number>;
}

interface SearchComboboxProps {
  /** Modo estático: lista completa, pesquisa client-side. */
  options?: ComboOption[];
  /** Modo assíncrono: endpoint GET que devolve `{ options: ComboOption[] }` para `?q=`. */
  searchEndpoint?: string;
  /** Modo assíncrono: opções mostradas antes de o utilizador escrever. */
  defaultOptions?: ComboOption[];
  /** Opções fixas no topo da lista (ex.: «Cliente final»), sempre disponíveis. */
  pinnedOptions?: ComboOption[];
  value: string;
  onChange?: (value: string, option: ComboOption | null) => void;
  /** Nome do campo — gera input hidden para formulários GET server-rendered. */
  name?: string;
  /** Label da opção seleccionada quando não está nas listas (pré-selecção em modo assíncrono). */
  selectedLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Mostra botão para limpar a selecção (equivalente à opção «Todos»/vazia). */
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  /** Estilo do botão, para alinhar com os campos de cada ecrã. */
  triggerStyle?: React.CSSProperties;
  /** Necessário quando o combobox vive dentro de um Dialog modal (Radix). */
  modal?: boolean;
}

const DEBOUNCE_MS = 300;

/** Normaliza para pesquisa: minúsculas e sem acentos. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Filtro determinístico por substring (label + sublabel), em vez do fuzzy do cmdk. */
function substringFilter(value: string, search: string, keywords?: string[]): number {
  const haystack = normalize(keywords?.length ? keywords.join(' ') : value);
  return haystack.includes(normalize(search)) ? 1 : 0;
}

const baseTrigger: React.CSSProperties = {
  width: '100%',
  height: 42,
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '0 12px',
  fontSize: 13.5,
  background: 'var(--card)',
  color: 'var(--text)',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  textAlign: 'left',
  cursor: 'pointer',
};

export function SearchCombobox({
  options,
  searchEndpoint,
  defaultOptions,
  pinnedOptions,
  value,
  onChange,
  name,
  selectedLabel,
  placeholder = '— Seleccione —',
  searchPlaceholder = 'Pesquisar…',
  emptyText = 'Sem resultados.',
  clearable = false,
  disabled = false,
  id,
  triggerStyle,
  modal = false,
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [innerValue, setInnerValue] = useState(value);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ComboOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ComboOption | null>(null);
  const async = Boolean(searchEndpoint);
  // Com `onChange` o componente é controlado (o pai decide o valor);
  // sem `onChange` (formulários GET) o valor vive no estado interno.
  const controlled = onChange !== undefined;
  const lastPropValue = useRef(value);

  // Sincroniza o estado interno quando o pai altera `value` (modo não controlado).
  if (value !== lastPropValue.current) {
    lastPropValue.current = value;
    if (!controlled && value !== innerValue) {
      setInnerValue(value);
      if (!value) setSelected(null);
    }
  }
  const currentValue = controlled ? value : innerValue;

  useEffect(() => {
    if (!async || !open) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const sep = searchEndpoint!.includes('?') ? '&' : '?';
        const res = await fetch(`${searchEndpoint}${sep}q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { options?: ComboOption[] };
        setResults(Array.isArray(json.options) ? json.options : []);
        setLoading(false);
      } catch {
        if (!ctrl.signal.aborted) {
          setResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [async, open, query, searchEndpoint]);

  const listId = useId();
  const baseList = useMemo(
    () => (async ? (results ?? defaultOptions ?? []) : (options ?? [])),
    [async, results, defaultOptions, options],
  );
  const q = query.trim().toLowerCase();
  const visiblePinned = useMemo(() => {
    if (!pinnedOptions?.length) return [];
    if (!q) return pinnedOptions;
    return pinnedOptions.filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q));
  }, [pinnedOptions, q]);
  // Em modo assíncrono a filtragem é do servidor; em modo estático é do cmdk (via keywords).
  const listed = useMemo(() => {
    const pinnedIds = new Set(pinnedOptions?.map((o) => o.value) ?? []);
    return baseList.filter((o) => !pinnedIds.has(o.value));
  }, [baseList, pinnedOptions]);

  const current = !currentValue
    ? null
    : ((selected?.value === currentValue ? selected : null) ??
      pinnedOptions?.find((o) => o.value === currentValue) ??
      baseList.find((o) => o.value === currentValue) ??
      defaultOptions?.find((o) => o.value === currentValue) ??
      (selectedLabel ? { value: currentValue, label: selectedLabel } : null));

  const pick = (option: ComboOption) => {
    setSelected(option);
    if (!controlled) setInnerValue(option.value);
    setOpen(false);
    setQuery('');
    onChange?.(option.value, option);
  };

  const clear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(null);
    if (!controlled) setInnerValue('');
    onChange?.('', null);
  };

  const renderItem = (option: ComboOption) => (
    <CommandItem
      key={option.value}
      value={option.value}
      keywords={[option.label, option.sublabel ?? '']}
      onSelect={() => pick(option)}
      data-active={option.value === currentValue || undefined}
    >
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: option.value === currentValue ? 700 : 500 }}>
          {option.label}
        </span>
        {option.sublabel ? (
          <span className="font-mono" style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {option.sublabel}
          </span>
        ) : null}
      </span>
    </CommandItem>
  );

  return (
    <Popover modal={modal} open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          style={{ ...baseTrigger, ...triggerStyle, ...(disabled ? { opacity: 0.6, cursor: 'default' } : null) }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: current ? 'var(--text)' : 'var(--text3)',
            }}
          >
            {current ? current.label : placeholder}
          </span>
          {clearable && currentValue && !disabled ? (
            <span onClick={clear} title="Limpar" style={{ display: 'inline-flex', color: 'var(--text3)', flex: 'none' }}>
              <X size={14} />
            </span>
          ) : null}
          <ChevronsUpDown size={14} style={{ color: 'var(--text3)', flex: 'none' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent style={{ width: 'var(--radix-popover-trigger-width)', minWidth: 220 }}>
        <Command shouldFilter={!async} filter={substringFilter}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList id={listId}>
            {loading ? (
              <div style={{ padding: '12px 10px', fontSize: 12.5, color: 'var(--text3)', textAlign: 'center' }}>A pesquisar…</div>
            ) : (
              <>
                <CommandEmpty>{visiblePinned.length ? null : emptyText}</CommandEmpty>
                {visiblePinned.map((option) => (
                  <CommandItem key={option.value} value={option.value} keywords={[option.label]} onSelect={() => pick(option)} forceMount>
                    <span style={{ fontWeight: option.value === currentValue ? 700 : 500 }}>{option.label}</span>
                  </CommandItem>
                ))}
                {listed.map(renderItem)}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
