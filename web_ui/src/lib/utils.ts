import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

/**
 * Format a timestamp to time only
 */
export function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

/**
 * Format milliseconds to human readable duration
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
}

/**
 * Get relative time from now
 */
export function getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return formatDate(dateStr)
}

/**
 * Common key code mappings for display
 */
export const KEY_CODE_NAMES: Record<number, string> = {
    // macOS key codes
    61: 'Right Option',
    58: 'Left Option',
    60: 'Right Shift',
    56: 'Left Shift',
    59: 'Left Control',
    62: 'Right Control',
    55: 'Left Command',
    54: 'Right Command',
    49: 'Space',
    // Windows virtual key codes
    0xa0: 'Left Shift',
    0xa1: 'Right Shift',
    0xa2: 'Left Ctrl',
    0xa3: 'Right Ctrl',
    0xa4: 'Left Alt',
    0xa5: 'Right Alt',
}

export function getKeyName(code: number): string {
    return KEY_CODE_NAMES[code] || `Key ${code}`
}
