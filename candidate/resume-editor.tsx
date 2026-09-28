'use client';

/**
 * Resume editor — what the "Edit" button next to Download PDF opens.
 *
 * Scope, deliberately small: edit any text in place, drag blocks and sections
 * to reorder, add / delete blocks and sections, and basic styling (bold,
 * italic, size, alignment, bullet / entry). No canvas, no free placement,
 * no rotate / crop / multi-select — a resume has to stay readable to a parser.
 *
 * The PDF is never touched here: the editor works on the same `ResumeDocument`
 * JSON that the preview and `resumePdf()` already use, so saving simply hands
 * the document back and the studio re-renders the file from it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Copy,
  GripVertical,
  Italic,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resumePageBreaks } from './demo-resume-pdf';
import type {
  ResumeBlockKind,
  ResumeBlockStyle,
  ResumeDocument,
} from './demo-resume-pdf';

/* -------------------------------------------------------------------------- */
/*                        Editable mirror of the model                        */
/* -------------------------------------------------------------------------- */

export interface EditBlock {
  id: string;
  kind: ResumeBlockKind;
  text: string;
  style: ResumeBlockStyle;
}

export interface EditSection {
  id: string;
  title: string;
  blocks: EditBlock[];
}

export interface EditDocument {
  name: string;
  headline: string;
  contacts: string[];
  sections: EditSection[];
}

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** `ResumeDocument` → editor state (stable ids so drag and undo work). */
export function toEditable(document: ResumeDocument): EditDocument {
  return {
    name: document.name,
    headline: document.headline,
    contacts: [...document.contacts],
    sections: document.sections.map((section) => ({
      id: uid('sec'),
      title: section.title,
      blocks: section.blocks.map((block) => ({
        id: uid('blk'),
        kind: block.kind,
        text: block.text,
        style: { ...(block.style ?? {}) },
      })),
    })),
  };
}

/** Editor state → `ResumeDocument` (ids dropped, empty styles omitted). */
export function toDocument(document: EditDocument): ResumeDocument {
  return {
    name: document.name.trim(),
    headline: document.headline.trim(),
    contacts: document.contacts.map((contact) => contact.trim()).filter(Boolean),
    sections: document.sections
      .map((section) => ({
        title: section.title.trim() || 'Section',
        blocks: section.blocks
          .map((block) => {
            const style: ResumeBlockStyle = {};
            if (block.style.bold !== undefined) style.bold = block.style.bold;
            if (block.style.italic !== undefined) style.italic = block.style.italic;
            if (block.style.size !== undefined) style.size = block.style.size;
            if (block.style.align !== undefined) style.align = block.style.align;
            return {
              kind: block.kind,
              text: block.text.trim(),
              ...(Object.keys(style).length ? { style } : {}),
            };
          })
          .filter((block) => block.text.length > 0),
      }))
      .filter((section) => section.blocks.length > 0),
  };
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

/* -------------------------------------------------------------------------- */
/*                        Text that can be typed in place                     */
/* -------------------------------------------------------------------------- */

/** What the user sees, soft line breaks included (innerText knows about <br>). */
export function readEditableText(element: HTMLElement): string {
  const inner = (element as HTMLElement & { innerText?: string }).innerText;
  const text = typeof inner === 'string' && inner.length > 0 ? inner : element.textContent ?? '';
  return text.replace(/\u00a0/g, ' ');
}

function caretAt(edge: 'start' | 'end'): boolean {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;
  const probe = range.cloneRange();
  const container = range.startContainer;
  probe.selectNodeContents(container.nodeType === 3 ? (container.parentNode as Node) : container);
  if (edge === 'start') probe.setEnd(range.startContainer, range.startOffset);
  else probe.setStart(range.endContainer, range.endOffset);
  return probe.toString().length === 0;
}

export interface FocusRequest {
  token: number;
  at: 'start' | 'end';
}

/**
 * A text the candidate can type in directly.
 *
 * Deliberately UNCONTROLLED: React must never rewrite the text while the caret
 * is inside, because re-rendering the children resets the caret to the start —
 * which is what makes typed letters come out reversed. The DOM owns the text
 * while it has focus; the model is updated on every keystroke, and the DOM is
 * re-synced from the model only when focus is elsewhere (blur, undo, …).
 */
function EditableText({
  value,
  onBegin,
  onChange,
  onDone,
  onKeyDown,
  className,
  placeholder,
  singleLine = true,
  as: Tag = 'div',
  focusRequest,
}: {
  value: string;
  /** Called once when the caret enters — the editor snapshots for undo here. */
  onBegin: () => void;
  onChange: (next: string) => void;
  onDone?: () => void;
  /** Extra keys (Enter, Backspace, arrows) — handled by the block that owns it. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  className?: string;
  placeholder?: string;
  singleLine?: boolean;
  as?: 'div' | 'span' | 'h2' | 'h3' | 'p';
  /** Focus this field programmatically (new block, arrow navigation, …). */
  focusRequest?: FocusRequest | null;
}) {
  const ref = useRef<HTMLElement | null>(null);

  /* Initial text + external changes (undo, style switches, another device). */
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (document.activeElement === element) return;
    if (readEditableText(element) !== value) element.textContent = value;
  }, [value]);

  /* Focus on request, with the caret where the caller asked. */
  useEffect(() => {
    if (!focusRequest) return;
    const element = ref.current;
    if (!element) return;
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(focusRequest.at === 'start');
    const selection = window.getSelection?.();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [focusRequest]);

  return (
    <Tag
      ref={ref as never}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      spellCheck={false}
      data-placeholder={placeholder}
      onFocus={onBegin}
      onInput={(event) => {
        const element = event.currentTarget;
        /* An emptied contentEditable keeps a stray <br>, which would break the
           placeholder — clear it so `:empty` matches again. */
        if ((element.textContent ?? '') === '' && element.innerHTML !== '') element.innerHTML = '';
        onChange(readEditableText(element));
      }}
      onBlur={() => {
        onDone?.();
        const element = ref.current;
        if (element && readEditableText(element) !== value) element.textContent = value;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'Enter' && event.shiftKey) {
          /* Soft break inside one line — kept as a newline in the model, so the
             PDF breaks there too. */
          event.preventDefault();
          const element = ref.current;
          const selection = window.getSelection?.();
          let inserted = false;
          if (element && selection && selection.rangeCount > 0) {
            try {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const node = document.createTextNode('\n');
              range.insertNode(node);
              range.setStartAfter(node);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              inserted = true;
            } catch {
              /* older engines: fall through */
            }
          }
          if (element && !inserted) element.textContent = `${readEditableText(element)}\n`;
          if (element) onChange(readEditableText(element));
          return;
        }
        if (onKeyDown) {
          onKeyDown(event);
        } else if (event.key === 'Enter' && singleLine) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        /* Ctrl/Cmd+Z must undo the document, not the typing session. */
        event.stopPropagation();
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        try {
          document.execCommand('insertText', false, text);
          const element = ref.current;
          if (element) onChange(readEditableText(element));
        } catch {
          onChange(`${value}${text}`);
        }
      }}
      className={cn(
        'rounded px-1 outline-none transition-colors focus:bg-primary/5 focus:ring-2 focus:ring-primary/40',
        'empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)]',
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Editor                                   */
/* -------------------------------------------------------------------------- */

const SIZE_OPTIONS: Array<{ label: string; value: number | undefined }> = [
  { label: 'Small', value: 9.5 },
  { label: 'Normal', value: undefined },
  { label: 'Large', value: 11.5 },
  { label: 'XL', value: 13 },
];

const KIND_OPTIONS: Array<{ label: string; value: ResumeBlockKind }> = [
  { label: 'Text', value: 'text' },
  { label: 'Bullet', value: 'bullet' },
  { label: 'Entry', value: 'entry' },
];

export function ResumeEditor({
  document: initialDocument,
  onSave,
  onCancel,
}: {
  document: ResumeDocument;
  onSave: (document: ResumeDocument) => void;
  onCancel: () => void;
}) {
  const [doc, setDoc] = useState<EditDocument>(() => toEditable(initialDocument));
  const [past, setPast] = useState<EditDocument[]>([]);
  const [future, setFuture] = useState<EditDocument[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  /* Which line should take the caret next, and where in it. */
  const [focusRequest, setFocusRequest] = useState<{ id: string; at: 'start' | 'end'; token: number }
    | null>(null);
  const focusToken = useRef(0);

  const requestFocus = useCallback((id: string, at: 'start' | 'end' = 'end') => {
    focusToken.current += 1;
    setFocusRequest({ id, at, token: focusToken.current });
  }, []);

  const [drag, setDrag] = useState<
    { kind: 'block'; sectionId: string; blockId: string } | { kind: 'section'; sectionId: string } | null
  >(null);
  const [dropHint, setDropHint] = useState<{ sectionId: string; index: number } | null>(null);

  /**
   * Where the PDF will start a new page, resolved to editor block ids. Computed
   * with the very same layout code the PDF writer uses, so a marker can never
   * point at the wrong line. Empty lines are skipped exactly as the document
   * conversion skips them, which keeps the indices aligned.
   */
  const pageMarkers = useMemo(() => {
    const document = toDocument(doc);

    /* The conversion drops empty lines and sections that end up empty, so walk
       the editor's blocks the same way and keep the ids that survive — that
       keeps `sectionIndex`/`blockIndex` from the layout aligned with our ids. */
    const idsBySection: string[][] = [];
    for (const section of doc.sections) {
      const filled = section.blocks.filter((block) => block.text.trim().length > 0);
      if (!filled.length) continue;
      idsBySection.push(filled.map((block) => block.id));
    }

    const markers = new Map<string, Array<{ page: number; insideBlock: boolean }>>();
    for (const item of resumePageBreaks(document)) {
      const id = idsBySection[item.sectionIndex]?.[item.blockIndex];
      if (!id) continue;
      const list = markers.get(id) ?? [];
      list.push({ page: item.page, insideBlock: item.insideBlock });
      markers.set(id, list);
    }
    return markers;
  }, [doc]);

  const totalPages = useMemo(
    () => Math.max(1, ...[...pageMarkers.values()].flat().map((marker) => marker.page)),
    [pageMarkers],
  );

  const original = useMemo(() => JSON.stringify(toDocument(toEditable(initialDocument))), [initialDocument]);
  const dirty = useMemo(() => JSON.stringify(toDocument(doc)) !== original, [doc, original]);

  const selected = useMemo(() => {
    if (!selectedBlockId) return null;
    for (const section of doc.sections) {
      const block = section.blocks.find((candidate) => candidate.id === selectedBlockId);
      if (block) return { section, block };
    }
    return null;
  }, [doc.sections, selectedBlockId]);

  /* ---------------------------- history helpers ---------------------------- */

  const history = useRef({ past: [] as EditDocument[], future: [] as EditDocument[] });
  history.current = { past, future };

  /** Snapshot before a discrete change (add, delete, drag, style). */
  const snapshot = useCallback(() => {
    setPast((stack) => [...stack.slice(-49), clone(doc)]);
    setFuture([]);
  }, [doc]);

  /** Change without touching history — used while typing. */
  const live = useCallback((mutate: (draft: EditDocument) => void) => {
    setDoc((current) => {
      const draft = clone(current);
      mutate(draft);
      return draft;
    });
  }, []);

  /** Change that can be undone. */
  const edit = useCallback(
    (mutate: (draft: EditDocument) => void) => {
      snapshot();
      live(mutate);
    },
    [live, snapshot],
  );

  const undo = useCallback(() => {
    /* The fields are uncontrolled, so drop focus first — that is what lets them
       pick the undone text back up. */
    (document.activeElement as HTMLElement | null)?.blur?.();
    setPast((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setFuture((redoStack) => [...redoStack, clone(doc)]);
      setDoc(previous);
      return stack.slice(0, -1);
    });
  }, [doc]);

  const redo = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setFuture((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setPast((undoStack) => [...undoStack, clone(doc)]);
      setDoc(next);
      return stack.slice(0, -1);
    });
  }, [doc]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Escape' && !dirty) {
        onCancel();
      } else if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave(toDocument(doc));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, doc, onCancel, onSave, redo, undo]);

  /* ------------------------------ mutations ------------------------------- */

  const moveBlock = useCallback(
    (fromSectionId: string, blockId: string, toSectionId: string, toIndex: number) => {
      edit((draft) => {
        const from = draft.sections.find((section) => section.id === fromSectionId);
        const to = draft.sections.find((section) => section.id === toSectionId);
        if (!from || !to) return;
        const fromIndex = from.blocks.findIndex((block) => block.id === blockId);
        if (fromIndex < 0) return;
        const [block] = from.blocks.splice(fromIndex, 1);
        const target = from.id === to.id && fromIndex < toIndex ? toIndex - 1 : toIndex;
        to.blocks.splice(Math.max(0, Math.min(target, to.blocks.length)), 0, block);
      });
    },
    [edit],
  );

  const moveSection = useCallback(
    (sectionId: string, toIndex: number) => {
      edit((draft) => {
        const fromIndex = draft.sections.findIndex((section) => section.id === sectionId);
        if (fromIndex < 0) return;
        const [section] = draft.sections.splice(fromIndex, 1);
        const target = fromIndex < toIndex ? toIndex - 1 : toIndex;
        draft.sections.splice(Math.max(0, Math.min(target, draft.sections.length)), 0, section);
      });
    },
    [edit],
  );

  const addBlock = useCallback(
    (sectionId: string, afterBlockId?: string, kind: ResumeBlockKind = 'bullet') => {
      const block: EditBlock = { id: uid('blk'), kind, text: '', style: {} };
      edit((draft) => {
        const section = draft.sections.find((candidate) => candidate.id === sectionId);
        if (!section) return;
        const index = afterBlockId
          ? section.blocks.findIndex((candidate) => candidate.id === afterBlockId) + 1
          : section.blocks.length;
        section.blocks.splice(index, 0, block);
      });
      setSelectedBlockId(block.id);
    },
    [edit],
  );

  /** Enter: start a new line of the same kind right below, caret ready to type. */
  const splitBlock = useCallback(
    (sectionId: string, blockId: string) => {
      const block = doc.sections
        .find((section) => section.id === sectionId)
        ?.blocks.find((candidate) => candidate.id === blockId);
      const created: EditBlock = {
        id: uid('blk'),
        /* a heading followed by its bullets is the usual intent */
        kind: block?.kind === 'entry' ? 'bullet' : (block?.kind ?? 'bullet'),
        text: '',
        style: {},
      };
      edit((draft) => {
        const section = draft.sections.find((candidate) => candidate.id === sectionId);
        if (!section) return;
        const index = section.blocks.findIndex((candidate) => candidate.id === blockId);
        section.blocks.splice(Math.max(0, index + 1), 0, created);
      });
      setSelectedBlockId(created.id);
      requestFocus(created.id, 'end');
    },
    [doc.sections, edit, requestFocus],
  );

  /** The page read top to bottom — used by the ↑ ↓ keys. */
  const flatBlocks = useMemo(
    () => doc.sections.flatMap((section) => section.blocks.map((block) => ({ section, block }))),
    [doc.sections],
  );

  const focusSibling = useCallback(
    (blockId: string, direction: -1 | 1) => {
      const index = flatBlocks.findIndex((item) => item.block.id === blockId);
      const target = flatBlocks[index + direction];
      if (!target) return false;
      requestFocus(target.block.id, direction === 1 ? 'start' : 'end');
      setSelectedBlockId(target.block.id);
      return true;
    },
    [flatBlocks, requestFocus],
  );

  const addSection = useCallback(() => {
    const section: EditSection = { id: uid('sec'), title: 'New section', blocks: [] };
    edit((draft) => {
      draft.sections.push(section);
    });
    const block: EditBlock = { id: uid('blk'), kind: 'bullet', text: '', style: {} };
    live((draft) => {
      const target = draft.sections.find((candidate) => candidate.id === section.id);
      target?.blocks.push(block);
    });
    setSelectedBlockId(block.id);
  }, [edit, live]);

  const removeBlock = useCallback(
    (sectionId: string, blockId: string) => {
      const flatIndex = flatBlocks.findIndex((item) => item.block.id === blockId);
      const previous = flatIndex > 0 ? flatBlocks[flatIndex - 1].block.id : null;
      edit((draft) => {
        const section = draft.sections.find((candidate) => candidate.id === sectionId);
        if (!section) return;
        section.blocks = section.blocks.filter((block) => block.id !== blockId);
      });
      if (previous) {
        setSelectedBlockId(previous);
        requestFocus(previous, 'end');
      } else {
        setSelectedBlockId(null);
      }
    },
    [edit, flatBlocks, requestFocus],
  );

  const removeSection = useCallback(
    (sectionId: string) => {
      edit((draft) => {
        draft.sections = draft.sections.filter((section) => section.id !== sectionId);
      });
      setSelectedBlockId(null);
    },
    [edit],
  );

  const patchSelectedBlock = useCallback(
    (patch: Partial<EditBlock> & { style?: Partial<ResumeBlockStyle> }) => {
      if (!selectedBlockId) return;
      edit((draft) => {
        for (const section of draft.sections) {
          const block = section.blocks.find((candidate) => candidate.id === selectedBlockId);
          if (!block) continue;
          if (patch.kind) block.kind = patch.kind;
          if (patch.style) block.style = { ...block.style, ...patch.style };
          return;
        }
      });
    },
    [edit, selectedBlockId],
  );

  const duplicateBlock = useCallback(() => {
    if (!selected) return;
    const copy: EditBlock = {
      id: uid('blk'),
      kind: selected.block.kind,
      text: selected.block.text,
      style: { ...selected.block.style },
    };
    edit((draft) => {
      const section = draft.sections.find((candidate) => candidate.id === selected.section.id);
      if (!section) return;
      const index = section.blocks.findIndex((block) => block.id === selected.block.id);
      section.blocks.splice(index + 1, 0, copy);
    });
    setSelectedBlockId(copy.id);
  }, [edit, selected]);

  const step = useCallback(
    (direction: -1 | 1) => {
      if (!selected) return;
      const index = selected.section.blocks.findIndex((block) => block.id === selected.block.id);
      const target = index + direction;
      if (target < 0 || target >= selected.section.blocks.length) return;
      moveBlock(selected.section.id, selected.block.id, selected.section.id, direction === 1 ? target + 1 : target);
    },
    [moveBlock, selected],
  );

  /* --------------------------------- view --------------------------------- */

  const contactLine = doc.contacts.join(' | ');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ------------------------------- top bar ------------------------------ */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold">Editing resume</h2>
          {dirty ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              unsaved changes
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              saved
            </span>
          )}
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {totalPages} page{totalPages === 1 ? '' : 's'}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Click any text to edit · drag <GripVertical className="inline h-3 w-3" /> to reorder · Enter = new line
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
            Redo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!dirty || window.confirm('Discard your changes?')) onCancel();
            }}
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(toDocument(doc))} title="Save (Ctrl+S)">
            <Check className="h-4 w-4" />
            Save changes
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------- the page --------------------------- */}
        <div className="flex-1 overflow-y-auto bg-muted/40 p-4 sm:p-8 scrollbar-slim">
          <article className="mx-auto w-full max-w-[760px] rounded-lg bg-white px-8 py-9 text-neutral-900 shadow-md ring-1 ring-black/10">
            <EditableText
              as="h2"
              className="text-center text-[19px] font-bold leading-tight"
              value={doc.name}
              placeholder="Your name"
              onBegin={snapshot}
              onChange={(text) => live((draft) => void (draft.name = text))}
            />
            <EditableText
              as="p"
              className="mt-1 text-center text-[11.5px]"
              value={doc.headline}
              placeholder="Headline"
              onBegin={snapshot}
              onChange={(text) => live((draft) => void (draft.headline = text))}
            />
            <EditableText
              as="p"
              className="mt-1 text-center text-[10.5px] text-neutral-600"
              value={contactLine}
              placeholder="email | phone | linkedin"
              onBegin={snapshot}
              onChange={(text) =>
                live(
                  (draft) =>
                    void (draft.contacts = text
                      .split('|')
                      .map((part) => part.trim())
                      .filter(Boolean)),
                )
              }
            />

            {doc.sections.map((section, sectionIndex) => (
              <section
                key={section.id}
                className="mt-5"
                onDragOver={(event) => {
                  if (drag?.kind === 'section') {
                    event.preventDefault();
                    setDropHint({ sectionId: `section:${section.id}`, index: sectionIndex });
                  }
                }}
                onDrop={(event) => {
                  if (drag?.kind === 'section') {
                    event.preventDefault();
                    moveSection(drag.sectionId, sectionIndex + 1);
                    setDrag(null);
                    setDropHint(null);
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDrag({ kind: 'section', sectionId: section.id })}
                    onDragEnd={() => {
                      setDrag(null);
                      setDropHint(null);
                    }}
                    className="cursor-grab rounded p-0.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 active:cursor-grabbing"
                    title="Drag to reorder this section"
                    aria-label={`Reorder ${section.title}`}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1 border-b border-neutral-300 pb-1">
                    <EditableText
                      as="h3"
                      className="text-[11px] font-bold uppercase tracking-wide"
                      value={section.title}
                      placeholder="Section title"
                      onBegin={snapshot}
                      onChange={(text) =>
                        live((draft) => {
                          const target = draft.sections.find((candidate) => candidate.id === section.id);
                          if (target) target.title = text;
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the “${section.title}” section?`)) removeSection(section.id);
                    }}
                    className="rounded p-0.5 text-neutral-300 hover:bg-destructive/10 hover:text-destructive"
                    title="Delete section"
                    aria-label={`Delete ${section.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {section.blocks.map((block, blockIndex) => {
                  const isSelected = block.id === selectedBlockId;
                  return (
                    <div key={block.id}>
                      {(pageMarkers.get(block.id) ?? []).map((marker) => (
                        <div
                          key={marker.page}
                          className="my-3 flex items-center gap-2"
                          title="The PDF starts a new page here"
                        >
                          <span className="h-0 flex-1 border-t-2 border-dashed border-primary/50" />
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {marker.insideBlock
                              ? `Page ${marker.page} begins inside this line`
                              : `Page ${marker.page} starts here`}
                          </span>
                          <span className="h-0 flex-1 border-t-2 border-dashed border-primary/50" />
                        </div>
                      ))}

                      <DropLine
                        active={
                          dropHint?.sectionId === section.id && dropHint.index === blockIndex && drag?.kind === 'block'
                        }
                        onOver={() => {
                          if (drag?.kind === 'block') setDropHint({ sectionId: section.id, index: blockIndex });
                        }}
                        onDrop={() => {
                          if (drag?.kind === 'block') {
                            moveBlock(drag.sectionId, drag.blockId, section.id, blockIndex);
                          }
                          setDrag(null);
                          setDropHint(null);
                        }}
                      />
                      <div
                        className={cn(
                          'group relative flex items-start gap-1 rounded',
                          isSelected && 'bg-primary/5 ring-1 ring-primary/30',
                        )}
                        onClick={() => setSelectedBlockId(block.id)}
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={() => setDrag({ kind: 'block', sectionId: section.id, blockId: block.id })}
                          onDragEnd={() => {
                            setDrag(null);
                            setDropHint(null);
                          }}
                          className={cn(
                            'mt-1 cursor-grab rounded p-0.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 active:cursor-grabbing',
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                          )}
                          title="Drag to move"
                          aria-label="Drag to move"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>

                        {block.kind === 'bullet' ? (
                          <span
                            aria-hidden
                            className="mt-1 select-none pl-1 pr-1 text-[11.5px] leading-relaxed text-neutral-900"
                          >
                            -
                          </span>
                        ) : null}

                        <EditableText
                          as="p"
                          className={cn(
                            'mt-1 flex-1 whitespace-pre-line text-[11.5px] leading-relaxed',
                            block.kind === 'entry' && 'font-bold',
                            block.style.italic && 'italic',
                            block.style.bold && 'font-bold',
                            block.style.align === 'center' && 'text-center',
                            block.style.align === 'right' && 'text-right',
                          )}
                          value={block.text}
                          placeholder={block.kind === 'bullet' ? 'Bullet point…' : 'Type something…'}
                          singleLine={false}
                          focusRequest={focusRequest?.id === block.id ? focusRequest : null}
                          onBegin={() => {
                            setSelectedBlockId(block.id);
                            snapshot();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              splitBlock(section.id, block.id);
                              return;
                            }
                            if (event.key === 'Backspace' && block.text.length === 0) {
                              event.preventDefault();
                              removeBlock(section.id, block.id);
                              return;
                            }
                            if (event.key === 'ArrowUp' && caretAt('start')) {
                              if (focusSibling(block.id, -1)) event.preventDefault();
                              return;
                            }
                            if (event.key === 'ArrowDown' && caretAt('end')) {
                              if (focusSibling(block.id, 1)) event.preventDefault();
                            }
                          }}
                          onChange={(text) => {
                            live((draft) => {
                              for (const candidate of draft.sections) {
                                const target = candidate.blocks.find((item) => item.id === block.id);
                                if (target) {
                                  target.text = text.trimStart();
                                  return;
                                }
                              }
                            });
                          }}
                        />

                        {isSelected ? (
                          <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                            <IconButton label="Move up" onClick={() => step(-1)}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton label="Move down" onClick={() => step(1)}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton label="Delete" destructive onClick={() => removeBlock(section.id, block.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                <DropLine
                  active={
                    dropHint?.sectionId === section.id &&
                    dropHint.index === section.blocks.length &&
                    drag?.kind === 'block'
                  }
                  onOver={() => {
                    if (drag?.kind === 'block') {
                      setDropHint({ sectionId: section.id, index: section.blocks.length });
                    }
                  }}
                  onDrop={() => {
                    if (drag?.kind === 'block') {
                      moveBlock(drag.sectionId, drag.blockId, section.id, section.blocks.length);
                    }
                    setDrag(null);
                    setDropHint(null);
                  }}
                />

                <button
                  type="button"
                  onClick={() => addBlock(section.id)}
                  className="mt-1.5 flex items-center gap-1 rounded px-1 text-[10.5px] font-semibold text-neutral-400 hover:text-primary"
                >
                  <Plus className="h-3 w-3" />
                  Add line
                </button>
              </section>
            ))}

            <button
              type="button"
              onClick={addSection}
              className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-semibold text-neutral-400 hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Add section
            </button>
          </article>
        </div>

        {/* ----------------------------- side panel --------------------------- */}
        <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-border bg-card p-4 scrollbar-slim lg:block">
          <div>
            <h3 className="text-sm font-semibold">Selected line</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected ? `${selected.section.title} · ${selected.block.kind}` : 'Click a line on the page'}
            </p>
          </div>

          <div className={cn('space-y-3', !selected && 'pointer-events-none opacity-40')}>
            <div className="flex flex-wrap gap-1">
              {KIND_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={selected?.block.kind === option.value ? 'default' : 'outline'}
                  onClick={() => patchSelectedBlock({ kind: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="flex gap-1">
              <Button
                size="sm"
                variant={selected?.block.style.bold ? 'default' : 'outline'}
                onClick={() => patchSelectedBlock({ style: { bold: !selected?.block.style.bold } })}
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={selected?.block.style.italic ? 'default' : 'outline'}
                onClick={() => patchSelectedBlock({ style: { italic: !selected?.block.style.italic } })}
                title="Italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={selected?.block.style.align === 'left' ? 'default' : 'outline'}
                onClick={() => patchSelectedBlock({ style: { align: 'left' } })}
                title="Align left"
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={selected?.block.style.align === 'center' ? 'default' : 'outline'}
                onClick={() => patchSelectedBlock({ style: { align: 'center' } })}
                title="Align centre"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={selected?.block.style.align === 'right' ? 'default' : 'outline'}
                onClick={() => patchSelectedBlock({ style: { align: 'right' } })}
                title="Align right"
              >
                <AlignRight className="h-4 w-4" />
              </Button>
            </div>

            <label className="block text-xs font-medium text-muted-foreground">
              Size
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                value={String(selected?.block.style.size ?? '')}
                onChange={(event) =>
                  patchSelectedBlock({
                    style: { size: event.target.value ? Number(event.target.value) : undefined },
                  })
                }
              >
                {SIZE_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value ?? ''}>
                    {option.label}
                    {option.value ? ` (${option.value}pt)` : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={duplicateBlock}>
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => selected && removeBlock(selected.section.id, selected.block.id)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Sections</h3>
            <ul className="mt-2 space-y-1">
              {doc.sections.map((section, index) => (
                <li
                  key={section.id}
                  draggable
                  onDragStart={() => setDrag({ kind: 'section', sectionId: section.id })}
                  onDragEnd={() => setDrag(null)}
                  className="flex items-center gap-1 rounded border border-border px-2 py-1.5 text-xs"
                >
                  <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{section.title}</span>
                  <IconButton
                    label="Move up"
                    disabled={index === 0}
                    onClick={() => moveSection(section.id, index - 1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={index === doc.sections.length - 1}
                    onClick={() => moveSection(section.id, index + 2)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Delete section"
                    destructive
                    onClick={() => {
                      if (window.confirm(`Delete the “${section.title}” section?`)) removeSection(section.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={addSection}>
              <Plus className="h-4 w-4" />
              Add section
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Drag a row or the handle on the page to reorder.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Bits                                      */
/* -------------------------------------------------------------------------- */

function IconButton({
  children,
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30',
        destructive && 'hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {children}
    </button>
  );
}

function DropLine({
  active,
  onOver,
  onDrop,
}: {
  active: boolean;
  onOver: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        onOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn('h-2 rounded transition-colors', active ? 'bg-primary/60' : 'bg-transparent')}
    />
  );
}
