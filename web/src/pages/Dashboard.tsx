import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Monitor, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeviceCard, DeviceCardSkeleton } from '@/components/DeviceCard'
import { DeviceConfigSheet } from '@/components/DeviceConfigSheet'
import { Button } from '@/components/ui/button'
import { useDevicesStore, type Device } from '@/stores/devices'
import { devicesApi } from '@/lib/api'

export function Dashboard() {
    const { devices, setDevices } = useDevicesStore()
    const { t } = useTranslation()

    // Fetch devices
    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['devices'],
        queryFn: () => devicesApi.list(),
        refetchInterval: 10000, // Refetch every 10 seconds for status updates
    })

    // Update store when data changes
    useEffect(() => {
        if (data?.devices) {
            const enrichedDevices: Device[] = data.devices.map((d) => ({
                ...d, // Spread all fields from API (including keycode, language, etc.)
                connected: true,
            }))
            setDevices(enrichedDevices)
        }
    }, [data, setDevices])

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
                    <p className="text-muted-foreground">
                        {t('dashboard.subtitle')}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isRefetching}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    {t('dashboard.refresh')}
                </Button>
            </div>

            {/* Device Grid */}
            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                    {[1, 2, 3].map((i) => (
                        <DeviceCardSkeleton key={i} />
                    ))}
                </div>
            ) : devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                    <Monitor className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">{t('dashboard.noDevices')}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('dashboard.noDevicesDesc')}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
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
