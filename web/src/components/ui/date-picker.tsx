"use client"

import * as React from "react"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
    date: Date | undefined
    onDateChange: (date: Date | undefined) => void
    placeholder?: string
    className?: string
    /**
     * Disable dates after this date
     */
    disabledAfter?: Date
}

export function DatePicker({
    date,
    onDateChange,
    placeholder = "选择日期",
    className,
    disabledAfter,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    const handleSelect = (selectedDate: Date | undefined) => {
        onDateChange(selectedDate)
        setOpen(false)
    }

    // Build disabled matcher for dates after disabledAfter
    const disabled = disabledAfter ? { after: disabledAfter } : undefined

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? (
                        format(date, "yyyy年MM月dd日", { locale: zhCN })
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    disabled={disabled}
                    defaultMonth={date}
                    autoFocus
                />
            </PopoverContent>
        </Popover>
    )
}
