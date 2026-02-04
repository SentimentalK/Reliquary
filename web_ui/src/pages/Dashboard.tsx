import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Monitor, RefreshCw } from 'lucide-react'
import { DeviceCard, DeviceCardSkeleton } from '@/components/DeviceCard'
import { DeviceConfigSheet } from '@/components/DeviceConfigSheet'
import { Button } from '@/components/ui/button'
import { useDevicesStore, type Device } from '@/stores/devices'
import { devicesApi } from '@/lib/api'

export function Dashboard() {
    const { devices, setDevices } = useDevicesStore()

    // Fetch devices
    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['devices'],
        queryFn: devicesApi.list,
        refetchInterval: 10000, // Refetch every 10 seconds for status updates
    })

    // Update store when data changes
    useEffect(() => {
        if (data?.devices) {
            const enrichedDevices: Device[] = data.devices.map((d) => ({
                device_id: d.device_id,
                user_id: d.user_id,
                connected: true,
                connected_at: d.connected_at,
            }))
            setDevices(enrichedDevices)
        }
    }, [data, setDevices])

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">设备管理</h1>
                    <p className="text-muted-foreground">
                        管理已连接的 Vortex 客户端
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isRefetching}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    刷新
                </Button>
            </div>

            {/* Device Grid */}
            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <DeviceCardSkeleton key={i} />
                    ))}
                </div>
            ) : devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                    <Monitor className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">暂无设备</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        启动 Vortex 客户端后，设备会自动出现在这里
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {devices.map((device) => (
                        <DeviceCard key={device.device_id} device={device} />
                    ))}
                </div>
            )}

            {/* Config Sheet */}
            <DeviceConfigSheet />
        </div>
    )
}
