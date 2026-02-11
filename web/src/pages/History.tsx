import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { MessageSquare, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { logsApi, type LogEntry } from '@/lib/api'
import { formatTime } from '@/lib/utils'

function LogEntryItem({ entry, isExpanded, onToggle }: {
    entry: LogEntry
    isExpanded: boolean
    onToggle: () => void
}) {
    const { t } = useTranslation()
    const steps = entry.transcription || []

    // Last step is the final output (shown in collapsed card)
    const finalStep = steps.length > 0 ? steps[steps.length - 1] : null
    const primaryText = finalStep?.text || t('history.empty')

    // Multiple steps means chain pipeline
    const hasMultipleSteps = steps.length > 1

    // Latency stats
    const totalLatency = entry.latency_stats?.total_ms

    return (
        <div className="border-b last:border-0">
            <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={onToggle}
            >
                {/* Time */}
                <div className="flex-shrink-0 w-20 text-sm text-muted-foreground">
                    {formatTime(entry.timestamp)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                        <p className="text-sm leading-relaxed break-words">
                            {primaryText}
                        </p>
                    </div>

                    {/* Meta - shown in collapsed view */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {totalLatency && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {totalLatency}ms
                            </span>
                        )}
                        {hasMultipleSteps && (
                            <span className="text-blue-500">
                                {steps.length} steps
                            </span>
                        )}
                    </div>
                </div>

                {/* Expand toggle */}
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-0">
                    <div className="ml-[5.5rem] rounded-lg bg-muted/50 p-4 text-sm space-y-3">
                        {/* Show all pipeline step outputs in order */}
                        {steps.map((step, index) => (
                            <div key={index}>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground text-xs font-mono">
                                        {index + 1}. {step.step}
                                    </span>
                                    {step.latency_ms > 0 && (
                                        <span className="text-muted-foreground text-xs">
                                            ({step.latency_ms}ms)
                                        </span>
                                    )}
                                </div>
                                <p className={`mt-1 ${index === steps.length - 1 ? '' : 'text-amber-600 dark:text-amber-400'}`}>
                                    {step.text}
                                </p>
                            </div>
                        ))}

                        {/* Meta info */}
                        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                            {totalLatency && (
                                <div>{t('history.totalLatency')}: {totalLatency}ms</div>
                            )}
                            {entry.audio_path && (
                                <div className="font-mono truncate">
                                    Audio Path: {entry.audio_path}
                                </div>
                            )}
                            <div className="font-mono">ID: {entry.id}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


export function History() {
    const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const { t } = useTranslation()

    // Format date for API call
    const dateString = format(selectedDate, 'yyyy-MM-dd')

    // Fetch logs for selected date
    const { data, isLoading, error } = useQuery({
        queryKey: ['logs', dateString],
        queryFn: () => logsApi.getByDate(dateString),
        enabled: !!selectedDate,
    })

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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('history.title')}</h1>
                    <p className="text-muted-foreground">
                        {t('history.subtitle')}
                    </p>
                </div>

                {/* Date Picker */}
                <DatePicker
                    date={selectedDate}
                    onDateChange={(date) => date && setSelectedDate(date)}
                    disabledAfter={new Date()}
                />
            </div>

            {/* Log List */}
            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex gap-3">
                                    <Skeleton className="h-4 w-20" />
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
                        <div>
                            {data.entries.map((entry) => (
                                <LogEntryItem
                                    key={entry.id}
                                    entry={entry}
                                    isExpanded={expandedIds.has(entry.id)}
                                    onToggle={() => toggleExpanded(entry.id)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
