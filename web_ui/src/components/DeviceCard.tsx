import { useState } from 'react'
import { Laptop, Keyboard, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { getKeyName, getRelativeTime } from '@/lib/utils'
import { useDevicesStore, type Device } from '@/stores/devices'

interface DeviceCardProps {
    device: Device
}

export function DeviceCard({ device }: DeviceCardProps) {
    const { openSheet } = useDevicesStore()
    const [isHovered, setIsHovered] = useState(false)

    return (
        <Card
            className={`group relative cursor-pointer transition-all hover:shadow-lg ${device.connected ? 'border-green-500/50' : 'border-muted'
                }`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => openSheet(device)}
        >
            {/* Status Indicator */}
            <div className="absolute right-4 top-4">
                <div
                    className={`h-3 w-3 rounded-full ${device.connected
                            ? 'bg-green-500 animate-pulse-dot'
                            : 'bg-muted-foreground/30'
                        }`}
                />
            </div>

            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                        <Laptop className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">
                            {device.device_id}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground truncate">
                            {device.user_id}
                        </p>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div className="space-y-2 text-sm">
                    {/* Hotkey */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Keyboard className="h-4 w-4" />
                            热键
                        </span>
                        <span className="font-mono">
                            {device.keycode ? getKeyName(device.keycode) : 'Right Option'}
                        </span>
                    </div>

                    {/* Last seen */}
                    {device.connected_at && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">连接时间</span>
                            <span>{getRelativeTime(device.connected_at)}</span>
                        </div>
                    )}
                </div>

                {/* Hover Action */}
                {isHovered && (
                    <div className="mt-4">
                        <Button variant="secondary" size="sm" className="w-full">
                            配置设备
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export function DeviceCardSkeleton() {
    return (
        <Card className="animate-pulse">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-muted" />
                        <div className="h-3 w-24 rounded bg-muted" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-muted" />
                    <div className="h-4 w-3/4 rounded bg-muted" />
                </div>
            </CardContent>
        </Card>
    )
}
