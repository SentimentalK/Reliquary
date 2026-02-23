import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
    ChevronDown,
    ChevronUp,
    Trash2,
    AlertTriangle,
    Activity,
    Download,
    RotateCcw,
    KeyRound
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { ActionModal } from '@/components/ActionModal'
import { logsApi, type LogEntry } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { formatTime } from '@/lib/utils'
import { analyzeQuality } from '@/lib/qualityCheck'

function LogEntryItem({ entry, isExpanded, onToggle, onDelete, isDeleting, onRetry, isRetrying }: {
    entry: LogEntry
    isExpanded: boolean
    onToggle: () => void
    onDelete: (id: string) => void
    isDeleting: boolean
    onRetry: (id: string) => void
    isRetrying: boolean
}) {
    const { t } = useTranslation()
    const steps = Array.isArray(entry.transcription) ? entry.transcription : []

    const rawStep = steps[0]
    const finalStep = steps[steps.length - 1]

    const rawText = rawStep?.text || ""
    const fixedText = finalStep?.text || t('history.empty')

    // --- LATENCY LOGIC ---
    const recognitionTime = steps.reduce((sum, step) => sum + (step.latency_ms || 0), 0)
    const totalLatency = entry.latency_stats?.total_ms || 0
    const speakingTime = Math.max(0, totalLatency - recognitionTime)

    // --- QUALITY CHECK LOGIC ---
    const quality = useMemo(() => {
        return analyzeQuality(rawText, fixedText)
    }, [rawText, fixedText])

    const getStatusColors = () => {
        if (quality.status === 'red') {
            return {
                bg: "bg-red-50/50 hover:bg-red-50/80 dark:bg-red-950/20",
                border: "bg-red-500",
                badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                text: "text-red-700 dark:text-red-400",
                highlight: "bg-red-50 border-red-200 text-foreground ring-1 ring-red-100 dark:bg-red-950/20 dark:border-red-900 dark:ring-red-900"
            }
        }
        if (quality.status === 'yellow') {
            return {
                bg: "bg-amber-50/30 hover:bg-amber-50/50 dark:bg-amber-950/10",
                border: "bg-amber-500",
                badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                text: "text-amber-700 dark:text-amber-400",
                highlight: "bg-amber-50 border-amber-200 text-foreground ring-1 ring-amber-100 dark:bg-amber-950/20 dark:border-amber-900 dark:ring-amber-900"
            }
        }
        return {
            bg: "hover:bg-muted/30",
            border: "",
            badge: "",
            text: "",
            highlight: ""
        }
    }

    const colors = getStatusColors()
    const isSuspicious = quality.status !== 'ok'

    return (
        <div className={`group relative flex gap-4 p-4 border-b border-border/40 transition-colors ${colors.bg}`}>
            {isSuspicious && (
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r ${colors.border}`} title={quality.msg}></div>
            )}

            <div className="w-24 flex-shrink-0 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">{formatTime(entry.timestamp)}</span>
                {isSuspicious && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${colors.badge}`}>
                        <AlertTriangle size={10} /> Check
                    </span>
                )}
            </div>

            <div className="flex-grow min-w-0">
                <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={onToggle}
                >
                    <div className="flex gap-2 items-start">
                        <span className="mt-0.5 text-muted-foreground">
                            <Activity size={16} />
                        </span>
                        <p className={`text-sm font-medium leading-relaxed ${isSuspicious ? "text-foreground" : "text-muted-foreground"}`}>
                            {fixedText}
                        </p>
                    </div>

                    <div className="ml-4 text-muted-foreground hover:text-foreground">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>

                {!isExpanded && (
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground pl-6">
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {recognitionTime}ms
                        </span>
                        <span>•</span>
                        <span>{steps.length} steps</span>
                    </div>
                )}

                {isExpanded && (
                    <div className="mt-4 pl-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        {steps.map((step, index) => {
                            const isLast = index === steps.length - 1
                            const highlight = isLast && isSuspicious

                            return (
                                <div key={index} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wide">
                                            <span>{index + 1}. {step.step}</span>
                                            <span className="text-muted-foreground">({step.latency_ms}ms)</span>

                                            {highlight && (
                                                <span className={`ml-2 font-bold flex items-center gap-1 ${colors.text}`}>
                                                    <AlertTriangle size={12} /> {quality.msg}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={`p-3 rounded-md border text-sm font-mono transition-colors ${highlight
                                        ? colors.highlight
                                        : "bg-muted/50 border-border/50 text-muted-foreground"
                                        }`}>
                                        {step.text}
                                    </div>
                                </div>
                            )
                        })}

                        <div className="pt-2 border-t border-border/50 flex items-end justify-between">
                            <div className="space-y-1 text-xs text-muted-foreground font-mono">
                                <p>
                                    Total: {totalLatency}ms
                                    <span className="text-muted-foreground/70 ml-1">
                                        (Speaking: ~{speakingTime}ms, Recognition: {recognitionTime}ms)
                                    </span>
                                </p>
                                {entry.audio_path && (
                                    <p title={entry.audio_path} className="truncate max-w-md">Audio Path: {entry.audio_path}</p>
                                )}
                                <p>ID: {entry.id}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isRetrying || isDeleting}
                                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 h-8 px-2"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRetry(entry.id)
                                    }}
                                >
                                    <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${isRetrying ? 'animate-spin' : ''}`} />
                                    {isRetrying ? t('history.retrying') : t('history.retry')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isDeleting || isRetrying}
                                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-8 px-2"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onDelete(entry.id)
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    {isDeleting ? '...' : t('history.delete')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

const GROQ_KEY_STORAGE = 'reliquary_groq_api_key'

export function History() {
    const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [isExporting, setIsExporting] = useState(false)
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // Modal state: null = closed, 'all' = clear day, string = entry id
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

    // API key dialog state for retry
    const [apiKeyDialog, setApiKeyDialog] = useState<{ entryId: string } | null>(null)
    const [apiKeyInput, setApiKeyInput] = useState('')

    const dateString = format(selectedDate, 'yyyy-MM-dd')

    const { data, isLoading, error } = useQuery({
        queryKey: ['logs', dateString],
        queryFn: () => logsApi.getByDate(dateString),
        enabled: !!selectedDate,
    })

    // WebSocket subscription for real-time log push
    const dateRef = useRef(dateString)
    dateRef.current = dateString

    useEffect(() => {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
        let ws: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let alive = true

        function connect() {
            if (!alive) return
            const token = useAuthStore.getState().token
            if (!token) return
            ws = new WebSocket(`${protocol}://${location.host}/ws/logs?token=${encodeURIComponent(token)}`)
            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data)
                    if (msg.type === 'new_entry' && msg.entry) {
                        // Check if the entry's date matches the selected date
                        const ts: string = msg.entry.timestamp || ''
                        const entryDate = ts.slice(0, 10) // YYYY-MM-DD from ISO
                        if (entryDate === dateRef.current) {
                            queryClient.setQueryData(
                                ['logs', dateRef.current],
                                (old: any) => {
                                    if (!old) return { entries: [msg.entry], date: dateRef.current, count: 1 }
                                    // Dedup: skip if this entry ID is already in the list
                                    if (old.entries?.some((e: any) => e.id === msg.entry.id)) return old
                                    return {
                                        ...old,
                                        entries: [msg.entry, ...old.entries],
                                        count: (old.count || 0) + 1,
                                    }
                                }
                            )
                        }
                    }
                } catch { /* ignore parse errors */ }
            }
            ws.onclose = () => {
                if (!alive) return
                reconnectTimer = setTimeout(connect, 3000)
            }
        }

        connect()

        return () => {
            alive = false
            if (reconnectTimer) clearTimeout(reconnectTimer)
            ws?.close()
        }
    }, [queryClient])

    // Single entry delete
    const deleteMutation = useMutation({
        mutationFn: (entryId: string) => logsApi.deleteEntry(entryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs', dateString] })
        },
    })

    // Retry entry pipeline
    const retryMutation = useMutation({
        mutationFn: ({ entryId, apiKey }: { entryId: string; apiKey: string }) =>
            logsApi.retryEntry(entryId, apiKey),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs', dateString] })
        },
        onError: () => {
            // Clear cached key so user can re-enter on next attempt
            localStorage.removeItem(GROQ_KEY_STORAGE)
        },
    })

    const handleRetry = (entryId: string) => {
        const cached = localStorage.getItem(GROQ_KEY_STORAGE)
        if (cached) {
            retryMutation.mutate({ entryId, apiKey: cached })
        } else {
            setApiKeyInput('')
            setApiKeyDialog({ entryId })
        }
    }

    const handleApiKeySubmit = () => {
        if (!apiKeyDialog || !apiKeyInput.trim()) return
        localStorage.setItem(GROQ_KEY_STORAGE, apiKeyInput.trim())
        retryMutation.mutate({ entryId: apiKeyDialog.entryId, apiKey: apiKeyInput.trim() })
        setApiKeyDialog(null)
    }

    // Clear day (all entries)
    const clearDayMutation = useMutation({
        mutationFn: (date: string) => logsApi.clearDay(date),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs', dateString] })
        },
    })

    const handleDeleteRequest = (target: string) => {
        setDeleteTarget(target)
    }

    const handleConfirmDelete = () => {
        if (!deleteTarget) return

        if (deleteTarget === 'all') {
            clearDayMutation.mutate(dateString, {
                onSettled: () => setDeleteTarget(null),
            })
        } else {
            deleteMutation.mutate(deleteTarget, {
                onSettled: () => setDeleteTarget(null),
            })
        }
    }

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const isAll = deleteTarget === 'all'

    return (
        <div className="space-y-6">
            {/* Delete Confirmation Modal */}
            <ActionModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                title={isAll ? t('history.confirmClearDayTitle') : t('history.confirmDeleteTitle')}
                description={isAll ? t('history.confirmClearDayDesc') : t('history.confirmDeleteDesc')}
                confirmText={isAll ? t('history.confirmClearAll') : t('history.delete')}
                cancelText={t('history.cancel')}
                isLoading={isAll ? clearDayMutation.isPending : deleteMutation.isPending}
            />

            {/* API Key Dialog */}
            {apiKeyDialog && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setApiKeyDialog(null)}
                >
                    <div
                        className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-border animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center text-center space-y-3">
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-full text-blue-600 dark:text-blue-400 ring-4 ring-blue-50/50 dark:ring-blue-950/20">
                                <KeyRound size={28} strokeWidth={2} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-foreground">{t('history.apiKeyTitle')}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed px-2">{t('history.apiKeyDesc')}</p>
                            </div>
                        </div>
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleApiKeySubmit()}
                            placeholder="gsk_..."
                            autoFocus
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <p className="text-xs text-muted-foreground text-center">{t('history.apiKeyLocal')}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <Button variant="outline" onClick={() => setApiKeyDialog(null)} className="rounded-xl">
                                {t('history.cancel')}
                            </Button>
                            <Button
                                onClick={handleApiKeySubmit}
                                disabled={!apiKeyInput.trim()}
                                className="rounded-xl"
                            >
                                {t('history.retry')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 pb-4 mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('history.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('history.subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Export All Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                            setIsExporting(true)
                            try {
                                await logsApi.exportData()
                            } catch (e) {
                                console.error('[Export]', e)
                            } finally {
                                setIsExporting(false)
                            }
                        }}
                        disabled={isExporting}
                    >
                        <Download className={`h-4 w-4 mr-1.5 ${isExporting ? 'animate-bounce' : ''}`} />
                        {t('history.exportAll')}
                    </Button>

                    {/* Clear Day Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRequest('all')}
                        disabled={!data?.entries?.length}
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                    >
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        {t('history.clearDay')}
                    </Button>

                    {/* Date Picker */}
                    <DatePicker
                        date={selectedDate}
                        onDateChange={(date) => date && setSelectedDate(date)}
                        disabledAfter={new Date()}
                    />
                </div>
            </div>

            {/* Log List */}
            <div className="bg-background rounded-lg">
                {isLoading ? (
                    <div className="p-4 space-y-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-3">
                                <Skeleton className="h-4 w-24" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-3 w-1/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-muted-foreground">
                        {t('history.errorLoad')}
                    </div>
                ) : !data?.entries?.length ? (
                    <div className="p-8 text-center text-muted-foreground">
                        {dateString} {t('history.noRecords')}
                    </div>
                ) : (
                    <div className="divide-y divide-border/40 border-b border-border/40">
                        {data.entries.map((entry) => (
                            <LogEntryItem
                                key={entry.id}
                                entry={entry}
                                isExpanded={expandedIds.has(entry.id)}
                                onToggle={() => toggleExpanded(entry.id)}
                                onDelete={handleDeleteRequest}
                                isDeleting={deleteMutation.isPending && deleteMutation.variables === entry.id}
                                onRetry={handleRetry}
                                isRetrying={retryMutation.isPending && retryMutation.variables?.entryId === entry.id}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
