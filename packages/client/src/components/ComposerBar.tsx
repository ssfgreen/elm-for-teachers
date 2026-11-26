/**
 * The row under the chat box, as in Claude's composer: "+" on the left (add files from the
 * computer as context for the model: a curriculum PDF, a worksheet to adapt, slides); on the
 * right the model picker ("GPT-6 Sol  Medium"), whose menu lists the models the study allows
 * and, for a reasoning model, how hard it thinks, then two icons named on hover: whether the
 * assistant suggests or edits (EditModeMenu) and Spyglass on or off.
 */
import { Fragment, useCallback, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { Effort, ModelChoice } from '@edw/shared';
import type { AssistantMode } from '../state/assistantMode';
import { EditModeMenu } from './EditModeMenu';
import { SpyglassToggle } from './SpyglassToggle';
import { useDismiss } from './useDismiss';
import { REFERENCE_ACCEPT } from '../import/reference';
import { MakeSlot } from './slots/slots';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { menuItemClass, menuNameClass } from './ExportMenu';

export const EFFORTS: { id: Effort; label: string; hint: string }[] = [
  { id: 'low', label: 'Low', hint: 'Quicker answers' },
  { id: 'medium', label: 'Medium', hint: 'The default' },
  { id: 'high', label: 'High', hint: 'Thinks for longer' },
];

const groupClass = 'relative flex min-w-0 items-center';
/** The model menu's lines: the export menu's, in a smaller size. */
const itemClass = cn(menuItemClass, 'justify-start text-md');
const menuHeadClass = 'px-2.5 pt-1.5 pb-0.75 text-2xs font-semibold tracking-wide text-muted-foreground uppercase';

export interface ComposerBarProps {
  /** Files picked with "+", to add to the chat as context for the model. */
  onAddFiles?: (files: File[]) => void;
  /** The models to choose from; the picker is hidden with fewer than two. */
  models?: ModelChoice[];
  model?: string;
  effort?: Effort;
  onModelChange?: (model: string, effort: Effort) => void;
  /** Whether the assistant edits, suggests or tracks changes (EditModeMenu); hidden without `onEditModeChange`. */
  editMode?: AssistantMode;
  onEditModeChange?: (mode: AssistantMode) => void;
  /** Spyglass on or off (SpyglassToggle); hidden without `onSpyglassChange`. */
  spyglass?: boolean;
  onSpyglassChange?: (on: boolean) => void;
  disabled?: boolean;
}

export function ComposerBar({ onAddFiles, models = [], model, effort = 'medium', onModelChange, editMode = 'suggest', onEditModeChange, spyglass = true, onSpyglassChange, disabled }: ComposerBarProps) {
  const [menu, setMenu] = useState<'model' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setMenu(null), []);
  useDismiss(menu !== null, ref, close);
  const current = models.find((m) => m.id === model) ?? models[0];
  const toggle = (which: 'model') => setMenu((m) => (m === which ? null : which));

  return (
    <div className={cn('mt-1.5 mb-1 flex min-h-7 flex-wrap items-center gap-1 px-0.5 text-sm text-foreground-2')} ref={ref}>
      {onAddFiles && (
        <div className={groupClass}>
          <Button
            variant="bar"
            size="icon"
            aria-label="Add files"
            title="Add files for the assistant to use: a PDF, Word, PowerPoint or text file"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            <Plus size={16} aria-hidden="true" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={REFERENCE_ACCEPT}
            aria-label="Files to add"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) onAddFiles(files);
            }}
          />
        </div>
      )}
      {/* On the right: the model, then the mode and Spyglass as icons. */}
      <div className="ml-auto flex min-w-0 items-center gap-0.5">
        {current && models.length > 1 && onModelChange && (
          <div className={groupClass}>
            <Button
              variant="bar"
              aria-label={`Model: ${current.label}${current.reasoning ? ` ${EFFORTS.find((x) => x.id === effort)?.label ?? ''}` : ''}`}
              aria-haspopup="menu"
              aria-expanded={menu === 'model'}
              disabled={disabled}
              onClick={() => toggle('model')}
            >
              <span className="truncate">{current.label}</span>
              {current.reasoning && <span className="text-muted-foreground">{EFFORTS.find((x) => x.id === effort)?.label}</span>}
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
            {menu === 'model' && (
              <div
                className="absolute right-0 bottom-full z-40 mb-1 w-62.5 rounded-md border border-border bg-card p-1 shadow-float"
                role="menu"
                aria-label="Model"
              >
                <div className="max-h-65 overflow-y-auto">
                  {models.map((m, i) => (
                    <Fragment key={m.id}>
                      {(i === 0 || m.group !== models[i - 1]!.group) && <div className={menuHeadClass}>{m.group ?? 'Model'}</div>}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={m.id === current.id}
                      className={itemClass}
                      onClick={() => {
                        onModelChange(m.id, effort);
                        if (!m.reasoning) setMenu(null);
                      }}
                    >
                      <span className={cn(menuNameClass, 'flex-1')}>{m.label}</span>
                      {!m.reasoning && <span className="text-xs text-muted-foreground">no thinking</span>}
                      {m.id === current.id && <Check size={14} aria-hidden="true" />}
                    </button>
                    </Fragment>
                  ))}
                </div>
                {current.reasoning && (
                  <>
                    <div className={menuHeadClass}>Thinking</div>
                    {EFFORTS.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={x.id === effort}
                        className={itemClass}
                        onClick={() => {
                          onModelChange(current.id, x.id);
                          setMenu(null);
                        }}
                      >
                        <span className={cn(menuNameClass, 'flex-1')}>{x.label}</span>
                        <span className="text-xs text-muted-foreground">{x.hint}</span>
                        {x.id === effort && <Check size={14} aria-hidden="true" />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {onEditModeChange && <EditModeMenu mode={editMode} onChange={onEditModeChange} disabled={disabled} />}
        {onSpyglassChange && <SpyglassToggle on={spyglass} onChange={onSpyglassChange} disabled={disabled} />}
      </div>
      {/* The make kit's cards for this bar, on their own line below it. */}
      <MakeSlot zone="composer" />
    </div>
  );
}
