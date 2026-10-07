import { useState, type FormEvent, type Ref } from 'react'
import { IconAlert, IconArrowRight, IconCheck, IconKey, IconMic, IconSparkles, IconUndo } from '../../components/icons'
import { useI18n } from '../../i18n/context'
import type { DictKey } from '../../i18n/dict'
import { cn } from '../../lib/cn'
import { formatDuration } from '../../lib/format'
import type { VoiceUi } from './saleState'
import { BAR_COUNT, type VoiceEngine } from './voice/controller'

const ENGINE_LABELS: Record<Exclude<VoiceEngine, ''>, DictKey> = {
  live: 'engine_live',
  record: 'engine_record',
  browser: 'engine_browser',
}

const STATE_LABELS: Record<VoiceUi['state'], DictKey> = {
  idle: 'voice_idle',
  starting: 'voice_starting',
  listening: 'voice_listening',
  processing: 'voice_processing',
  done: 'voice_idle',
}

interface VoiceCardProps {
  voice: VoiceUi
  engine: VoiceEngine
  canUndo: boolean
  demo: boolean
  onToggle: () => void
  onUndo: () => void
  onSendText: (text: string) => void
  cardRef: Ref<HTMLElement>
  waveRef: Ref<HTMLDivElement>
  /** Inside a dialog that already says what it is (the phone's sheet): no title of its own. */
  headless?: boolean
}

export function VoiceCard({
  voice,
  engine,
  canUndo,
  demo,
  onToggle,
  onUndo,
  onSendText,
  cardRef,
  waveRef,
  headless,
}: VoiceCardProps) {
  const { t } = useI18n()
  const [command, setCommand] = useState('')
  const busy = voice.state === 'starting' || voice.state === 'processing'
  const recording = voice.state === 'listening'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = command.trim()
    if (!text || busy || recording) return
    setCommand('')
    onSendText(text)
  }

  return (
    <section
      ref={cardRef}
      className={cn('voice-card', `is-${voice.state}`)}
      aria-labelledby={headless ? undefined : 'voice-title'}
      aria-label={headless ? t('voice_assistant') : undefined}
    >
      <div className="voice-glow" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {!headless && (
            <div className="flex min-w-0 items-center gap-2">
              <IconSparkles size={20} className="shrink-0" />
              <h2 id="voice-title" className="font-semibold">
                {t('voice_assistant')}
              </h2>
            </div>
          )}
          {engine && (
            <span className="engine-chip ml-auto">
              <span className={cn('engine-dot', recording && 'is-live')} />
              {t(ENGINE_LABELS[engine])}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center gap-5">
          <button
            type="button"
            className="mic-btn"
            onClick={onToggle}
            disabled={busy}
            aria-label={recording ? t('voice_stop') : t('voice_start')}
            aria-pressed={recording}
          >
            <span className="mic-ring" />
            <span className="mic-ring mic-ring-2" />
            {busy ? (
              <span className="mic-spinner" />
            ) : recording ? (
              <span className="block size-6 rounded-md bg-current" />
            ) : (
              <IconMic size={32} strokeWidth={2.2} />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug" aria-live="polite">
              {t(STATE_LABELS[voice.state])}
            </p>
            <div ref={waveRef} className="wave mt-3" aria-hidden="true">
              {Array.from({ length: BAR_COUNT }, (_, index) => (
                <span key={index} data-bar="" />
              ))}
            </div>
            {recording ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-white/75">
                <span className="rec-dot" />
                <span className="tabular">{formatDuration(voice.seconds)}</span>
                <span className="opacity-70 pointer-coarse:hidden">· {t('voice_shortcut_stop')}</span>
              </p>
            ) : (
              (voice.state === 'idle' || voice.state === 'done') && (
                <p className="mt-2 flex items-center gap-2 text-xs text-white/75 pointer-coarse:hidden">
                  <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white ring-1 ring-white/25">
                    Space
                  </kbd>
                  {t('voice_start')}
                </p>
              )
            )}
          </div>
        </div>

        {voice.caption && (voice.state === 'listening' || voice.state === 'processing') && (
          <div className="bubble mt-4">
            <p className="mb-1 text-[11px] uppercase tracking-wider text-white/60">{t('voice_heard')}</p>
            <p className="text-sm leading-relaxed">“{voice.caption}”</p>
            {voice.state === 'processing' && <div className="shimmer-line mt-2" />}
          </div>
        )}

        {voice.state === 'done' && (
          <div className="bubble mt-4" aria-live="polite">
            <div className="flex items-start gap-2">
              <span className="ai-dot">
                <IconCheck size={14} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{voice.reply}</p>
                {voice.transcript && (
                  <p className="mt-1 text-xs text-white/70">
                    {t('voice_you_said')}: <span className="italic">“{voice.transcript}”</span>
                  </p>
                )}
                {voice.unmatched.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-white/80">{t('voice_unmatched')}:</span>
                    {voice.unmatched.map((word) => (
                      <span key={word} className="unmatched-chip">
                        {word}
                      </span>
                    ))}
                  </div>
                )}
                {voice.submit && <p className="mt-2 text-xs font-medium text-amber-200">{t('voice_submit_hint')}</p>}
              </div>
              {canUndo && (
                <button type="button" className="undo-btn" onClick={onUndo}>
                  <IconUndo size={14} strokeWidth={2.5} />
                  {t('undo')}
                </button>
              )}
            </div>
            {voice.resultEngine && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-white/50">
                {voice.resultEngine === 'gemini' ? t('engine_gemini') : t('engine_local')}
              </p>
            )}
          </div>
        )}

        {voice.error && (
          <div className="voice-error mt-4" role="alert">
            <IconAlert size={16} className="shrink-0" />
            <span>{voice.error}</span>
          </div>
        )}

        <form className="command mt-4" onSubmit={submit}>
          <input
            type="text"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder={t('type_command')}
            aria-label={t('type_command')}
            autoComplete="off"
            disabled={voice.state === 'processing'}
          />
          <button type="submit" disabled={!command.trim() || busy || recording} aria-label={t('send')}>
            <IconArrowRight size={16} strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-white/70">{t('voice_example')}</p>
        {demo && (
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-100">
            <IconKey size={14} className="mt-0.5 shrink-0" />
            {t('voice_demo_note')}
          </p>
        )}
      </div>
    </section>
  )
}
