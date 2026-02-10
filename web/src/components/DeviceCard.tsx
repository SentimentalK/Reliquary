import { Laptop, Keyboard, Smartphone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { getKeyName } from '@/lib/utils'
import { useDevicesStore, type Device } from '@/stores/devices'
import { useAuthStore } from '@/stores/auth'

interface DeviceCardProps {
    device: Device
}

export function DeviceCard({ device }: DeviceCardProps) {
    const { openSheet } = useDevicesStore()
    const { user } = useAuthStore()

    return (
        <Card
            className={`group relative cursor-pointer transition-all hover:shadow-xl ${device.connected ? 'border-green-500/50' : 'border-muted'
                }`}
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
                        {device.platform === 'android' ? (
                            <Smartphone className="h-6 w-6" />
                        ) : (
                            <Laptop className="h-6 w-6" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base break-words">
                            {device.device_id}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground break-words">
                            {(user && user.id === device.user_id ? user.display_name : device.display_name) || device.user_id}
                        </p>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div className="space-y-2 text-sm">
                    {/* Hotkey - hidden for mobile devices */}
                    {device.platform !== 'android' && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1">
                                <Keyboard className="h-4 w-4" />
                                热键
                            </span>
                            <span className="font-mono">
                                {device.keycode ? getKeyName(device.keycode) : 'Right Option'}
                            </span>
                        </div>
                    )}

                    {/* Connection Time */}
                    {device.connected_at && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">建立连接</span>
                            <span>
                                {(() => {
                                    if (!device.connected_at) return '-'
                                    // Handle Unix timestamp (seconds) vs ISO string
                                    const date = typeof device.connected_at === 'number' || !isNaN(Number(device.connected_at))
                                        ? new Date(Number(device.connected_at) * 1000)
                                        : new Date(device.connected_at)
                                    return date.toLocaleString('zh-CN')
                                })()}
                            </span>
                        </div>
                    )}
                </div>

                {/* Action Button - Always visible */}
                <div className="mt-4">
                    <Button variant="secondary" size="sm" className="w-full">
                        配置设备
                    </Button>
                </div>
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
