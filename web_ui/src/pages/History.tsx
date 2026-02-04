import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, MessageSquare, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { logsApi, type LogEntry } from '@/lib/api'
import { formatTime, formatDuration } from '@/lib/utils'

function LogEntryItem({ entry, isExpanded, onToggle }: {
    entry: LogEntry
    isExpanded: boolean
    onToggle: () => void
}) {
    const finalText = entry.result?.final_text || entry.pipeline_trace?.post_process_fix || '(空)'
    const rawText = entry.pipeline_trace?.raw_whisper_output
    const duration = entry.input_context?.audio_meta?.duration_ms
    const latency = entry.result?.latency_ms

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
                            {finalText}
                        </p>
                    </div>

                    {/* Meta */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {duration && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(duration)}
                            </span>
                        )}
                        {latency && (
                            <span>延迟 {latency}ms</span>
                        )}
                        <span className="font-mono">{entry.device_id}</span>
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
                        {rawText && rawText !== finalText && (
                            <div>
                                <span className="text-muted-foreground">原始识别:</span>
                                <p className="mt-1 font-mono text-amber-600 dark:text-amber-400">
                                    {rawText}
                                </p>
                            </div>
                        )}
                        <div>
                            <span className="text-muted-foreground">Pipeline Trace:</span>
                            <pre className="mt-1 text-xs overflow-x-auto">
                                {JSON.stringify(entry.pipeline_trace, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export function History() {
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date()
        return today.toISOString().split('T')[0]
    })
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    // Fetch logs for selected date
    const { data, isLoading, error } = useQuery({
        queryKey: ['logs', selectedDate],
        queryFn: () => logsApi.getByDate(selectedDate),
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

    // Generate date options (last 7 days)
    const dateOptions = Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - i)
        return date.toISOString().split('T')[0]
    })

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">时光机</h1>
                    <p className="text-muted-foreground">
                        查看语音识别历史记录
                    </p>
                </div>

                {/* Date Selector */}
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        {dateOptions.map((date) => (
                            <option key={date} value={date}>
                                {date === dateOptions[0] ? '今天' : date}
                            </option>
                        ))}
                    </select>
                </div>
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
                            加载失败，请检查后端 API
                        </div>
                    ) : !data?.entries?.length ? (
                        <div className="p-8 text-center text-muted-foreground">
                            {selectedDate} 暂无记录
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
