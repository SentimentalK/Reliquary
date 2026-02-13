import { useState, useMemo } from 'react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { logsApi, type LogEntry } from '@/lib/api'
import { formatTime } from '@/lib/utils'

function LogEntryItem({ entry, isExpanded, onToggle, onDelete, isDeleting }: {
    entry: LogEntry
    isExpanded: boolean
    onToggle: () => void
    onDelete: (id: string) => void
    isDeleting: boolean
}) {
    const { t } = useTranslation()
    const steps = entry.transcription || []

    const rawStep = steps[0]
    const finalStep = steps[steps.length - 1]

    const rawText = rawStep?.text || ""
    const fixedText = finalStep?.text || t('history.empty')

    // --- CORE LOGIC: Client-side Length Check ---
    const discrepancy = useMemo(() => {
        const rawLen = rawText.length
        const fixLen = fixedText.length

        if (rawLen === 0) return { isSuspicious: false, label: "" }

        const diff = fixLen - rawLen
        const ratio = Math.abs(diff) / rawLen
        const percent = Math.round((Math.abs(diff) / rawLen) * 100)

        // Threshold: If difference is > 20%, flag it.
        const isSuspicious = ratio > 0.2

        let label = ""
        if (isSuspicious) {
            // Using logic from user request: +% Length (Hallucination?) or -% Length (Cutoff?)
            // We can add translation keys later if needed, hardcoding for now as requested
            label = diff > 0
                ? `+${percent}% Length (Hallucination?)`
                : `-${percent}% Length (Cutoff?)`
        }

        return { isSuspicious, label, percent }
    }, [rawText, fixedText])

    const totalLatency = entry.latency_stats?.total_ms || 0
    const durationStr = `${totalLatency}ms`

    return (
        <div className={`group relative flex gap-4 p-4 border-b border-border/40 hover:bg-muted/30 transition-colors ${discrepancy.isSuspicious ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>

            {/* Visual Indicator for Suspicious Records on the far left */}
            {discrepancy.isSuspicious && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r" title="Potential fix error detected"></div>
            )}

            {/* Timestamp Column */}
            <div className="w-24 flex-shrink-0 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">{formatTime(entry.timestamp)}</span>
                {discrepancy.isSuspicious && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded w-fit">
                        <AlertTriangle size={10} /> Check
                    </span>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-grow min-w-0">

                {/* Header / Preview Line */}
                <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={onToggle}
                >
                    <div className="flex gap-2 items-start">
                        <span className="mt-0.5 text-muted-foreground">
                            <Activity size={16} />
                        </span>
                        <p className={`text-sm font-medium leading-relaxed ${discrepancy.isSuspicious ? "text-foreground" : "text-muted-foreground"}`}>
                            {/* Show the final output as the preview */}
                            {fixedText}
                        </p>
                    </div>

                    <div className="ml-4 text-muted-foreground hover:text-foreground">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>

                {/* Metadata Line (Collapsed) */}
                {!isExpanded && (
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground pl-6">
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {durationStr}
                        </span>
                        <span>•</span>
                        <span>{steps.length} steps</span>
                    </div>
                )}

                {/* EXPANDED PIPELINE VIEW */}
                {isExpanded && (
                    <div className="mt-4 pl-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        {/* Render all steps */}
                        {steps.map((step, index) => {
                            const isLast = index === steps.length - 1
                            // Highlight logic applies to the last step if suspicious
                            const highlight = isLast && discrepancy.isSuspicious

                            return (
                                <div key={index} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wide">
                                            <span>{index + 1}. {step.step}</span>
                                            <span className="text-muted-foreground">({step.latency_ms}ms)</span>

                                            {highlight && (
                                                <span className="ml-2 text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                                                    <AlertTriangle size={12} /> {discrepancy.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={`p-3 rounded-md border text-sm font-mono transition-colors ${highlight
                                            ? "bg-amber-50 border-amber-200 text-foreground ring-1 ring-amber-100 dark:bg-amber-950/20 dark:border-amber-800 dark:ring-amber-900"
                                            : "bg-muted/50 border-border/50 text-muted-foreground"
                                        }`}>
                                        {step.text}
                                    </div>
                                </div>
                            )
                        })}

                        {/* Footer Metadata */}
                        <div className="pt-2 border-t border-border/50 flex items-end justify-between">
                            <div className="space-y-1 text-xs text-muted-foreground font-mono">
                                <p>{t('history.totalLatency')}: {totalLatency}ms</p>
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

    // Format date for API call
    const dateString = format(selectedDate, 'yyyy-MM-dd')

    // Fetch logs for selected date
    const { data, isLoading, error } = useQuery({
        queryKey: ['logs', dateString],
        queryFn: () => logsApi.getByDate(dateString),
        enabled: !!selectedDate,
    })

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (entryId: string) => logsApi.deleteEntry(entryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs', dateString] })
        },
    })

    const handleDelete = (entryId: string) => {
        if (window.confirm(t('history.confirmDelete'))) {
            deleteMutation.mutate(entryId)
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 pb-4 mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('history.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('history.subtitle')}</p>
                </div>

                {/* Date Picker */}
                <div className="flex items-center gap-2">
                    <DatePicker
                        date={selectedDate}
                        onDateChange={(date) => date && setSelectedDate(date)}
                        disabledAfter={new Date()}
                    />
                </div>
            </div>

            {/* Log List */}
            <Card>
                <CardContent className="p-0">
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
                        <div className="divide-y divide-border/40">
                            {data.entries.map((entry) => (
                                <LogEntryItem
                                    key={entry.id}
                                    entry={entry}
                                    isExpanded={expandedIds.has(entry.id)}
                                    onToggle={() => toggleExpanded(entry.id)}
                                    onDelete={handleDelete}
                                    isDeleting={deleteMutation.isPending && deleteMutation.variables === entry.id}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
