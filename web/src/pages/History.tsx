import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
    ChevronDown,
    ChevronUp,
    Trash2,
    AlertTriangle,
    Activity
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'
import { logsApi, type LogEntry } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import { analyzeQuality } from '@/lib/qualityCheck'

function LogEntryItem({ entry, isExpanded, onToggle, onDelete, isDeleting }: {
    entry: LogEntry
    isExpanded: boolean
    onToggle: () => void
    onDelete: (id: string) => void
    isDeleting: boolean
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

                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={isDeleting}
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
                )}
            </div>
        </div>
    )
}

export function History() {
    const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // Modal state: null = closed, 'all' = clear day, string = entry id
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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

        function connect() {
            ws = new WebSocket(`${protocol}://${location.host}/ws/logs`)
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
                reconnectTimer = setTimeout(connect, 3000)
            }
        }

        connect()

        return () => {
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
            <DeleteConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                title={isAll ? t('history.confirmClearDayTitle') : t('history.confirmDeleteTitle')}
                description={isAll ? t('history.confirmClearDayDesc') : t('history.confirmDeleteDesc')}
                confirmText={isAll ? t('history.confirmClearAll') : t('history.delete')}
                cancelText={t('history.cancel')}
                isLoading={isAll ? clearDayMutation.isPending : deleteMutation.isPending}
            />

            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 pb-4 mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('history.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('history.subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
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
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
