import React from 'react'
import { cn } from '@/lib/utils'
import { Copy, Check } from 'lucide-react'

interface TerminalWindowProps {
    className?: string
    title?: string
    children: React.ReactNode
    showCopy?: boolean
    onCopy?: () => void
    headerClassName?: string
}

export function TerminalWindow({
    className,
    title = 'bash — 80x24',
    children,
    showCopy = false,
    headerClassName,
    onCopy
}: TerminalWindowProps) {
    const [copied, setCopied] = React.useState(false)

    const handleCopy = () => {
        if (onCopy) {
            onCopy()
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <div className={cn("rounded-lg border bg-card text-card-foreground text-left overflow-hidden shadow-xl font-mono text-sm", className)}>
            <div className={cn("flex items-center justify-between border-b bg-muted/50 px-4 py-2.5", headerClassName)}>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <div className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <div className="text-xs text-muted-foreground font-medium select-none">
                    {title}
                </div>
                <div className="w-14 flex justify-end">
                    {showCopy && (
                        <button
                            onClick={handleCopy}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Copy to clipboard"
                        >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                    )}
                </div>
            </div>
            <div className="p-6 overflow-x-auto">
                {children}
            </div>
        </div>
    )
}
