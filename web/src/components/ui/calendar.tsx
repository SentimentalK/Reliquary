"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { addMonths, subMonths, format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { getDateFnsLocale } from "@/lib/i18n-utils"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    const { t } = useTranslation()
    const locale = getDateFnsLocale()

    const [displayMonth, setDisplayMonth] = React.useState<Date>(
        props.defaultMonth || new Date()
    )

    // Generate year options (10 years back, 1 year forward)
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 12 }, (_, i) => currentYear - 10 + i)

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newYear = parseInt(e.target.value)
        const newDate = new Date(displayMonth)
        newDate.setFullYear(newYear)
        setDisplayMonth(newDate)
    }

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newMonth = parseInt(e.target.value)
        const newDate = new Date(displayMonth)
        newDate.setMonth(newMonth)
        setDisplayMonth(newDate)
    }

    const handlePrevMonth = () => {
        setDisplayMonth(subMonths(displayMonth, 1))
    }

    const handleNextMonth = () => {
        setDisplayMonth(addMonths(displayMonth, 1))
    }

    return (
        <DayPicker
            locale={locale}
            showOutsideDays={showOutsideDays}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            className={cn("p-3", className)}
            classNames={{
                months: "flex flex-col sm:flex-row gap-2",
                month: "flex flex-col gap-4",
                month_caption: "flex justify-center pt-1 relative items-center w-full",
                caption_label: "hidden",
                nav: "hidden", // Hide default navigation buttons
                month_grid: "w-full border-collapse space-x-1",
                weekdays: "flex",
                weekday:
                    "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
                week: "flex w-full mt-2",
                day: cn(
                    "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50",
                    props.mode === "range"
                        ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
                        : "[&:has([aria-selected])]:rounded-md"
                ),
                day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
                ),
                range_start: "day-range-start",
                range_end: "day-range-end",
                selected:
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                today: "bg-accent text-accent-foreground",
                outside:
                    "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                disabled: "text-muted-foreground opacity-50",
                range_middle:
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation }) => {
                    const Icon = orientation === "left" ? ChevronLeft : ChevronRight
                    return <Icon className="h-4 w-4" />
                },
                MonthCaption: () => (
                    <div className="flex items-center justify-between w-full">
                        <button
                            onClick={handlePrevMonth}
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                            )}
                            type="button"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>

                        <div className="flex items-center justify-center gap-2">
                            <select
                                value={displayMonth.getFullYear()}
                                onChange={handleYearChange}
                                className="h-7 rounded-md border border-input bg-background px-2 py-0 text-sm font-medium cursor-pointer hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                {years.map((year) => (
                                    <option key={year} value={year}>
                                        {year}{locale.code === 'zh-CN' ? '年' : ''}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={displayMonth.getMonth()}
                                onChange={handleMonthChange}
                                className="h-7 rounded-md border border-input bg-background px-2 py-0 text-sm font-medium cursor-pointer hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                {Array.from({ length: 12 }).map((_, index) => (
                                    <option key={index} value={index}>
                                        {format(new Date(2000, index, 1), t('common.monthFormat'), { locale })}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleNextMonth}
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                            )}
                            type="button"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                ),
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
