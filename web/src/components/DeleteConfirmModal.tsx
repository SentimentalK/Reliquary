import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DeleteConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    isLoading?: boolean
}

export function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Delete',
    cancelText = 'Cancel',
    isLoading = false,
}: DeleteConfirmModalProps) {
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-6 border border-border scale-100 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon + Text */}
                <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-full text-red-600 dark:text-red-400 ring-4 ring-red-50/50 dark:ring-red-950/20">
                        <AlertTriangle size={28} strokeWidth={2} />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold text-foreground">
                            {title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed px-2">
                            {description}
                        </p>
                    </div>
                </div>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isLoading}
                        className="rounded-xl"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="rounded-xl shadow-sm"
                    >
                        {isLoading ? '...' : confirmText}
                    </Button>
                </div>
            </div>
        </div>
    )
}
