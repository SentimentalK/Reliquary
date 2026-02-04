import { useState } from 'react'
import { Loader2, Keyboard, Save } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useDevicesStore } from '@/stores/devices'
import { devicesApi } from '@/lib/api'
import { getKeyName } from '@/lib/utils'

export function DeviceConfigSheet() {
    const { selectedDevice, sheetOpen, closeSheet, updateDevice } = useDevicesStore()
    const [keycode, setKeycode] = useState(selectedDevice?.keycode ?? 61)
    const [isLearning, setIsLearning] = useState(false)

    // Update keycode when device changes
    useState(() => {
        if (selectedDevice?.keycode) {
            setKeycode(selectedDevice.keycode)
        }
    })

    // Push config mutation
    const pushConfigMutation = useMutation({
        mutationFn: async () => {
            if (!selectedDevice) return
            await devicesApi.pushConfig(selectedDevice.device_id, { keycode })
        },
        onSuccess: () => {
            if (selectedDevice) {
                // Optimistic update
                updateDevice(selectedDevice.device_id, { keycode })
            }
            closeSheet()
        },
    })

    // Learn hotkey mutation
    const learnMutation = useMutation({
        mutationFn: async () => {
            if (!selectedDevice) throw new Error('No device selected')
            setIsLearning(true)
            const result = await devicesApi.learnHotkeyAndWait(selectedDevice.device_id, 30)
            if (result.success && result.key_code !== undefined) {
                setKeycode(result.key_code)
                // Also update the device store
                updateDevice(selectedDevice.device_id, { keycode: result.key_code })
                return result.key_code
            }
            throw new Error(result.error || 'Failed to detect key')
        },
        onSettled: () => {
            setIsLearning(false)
        },
    })

    if (!selectedDevice) return null

    return (
        <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>{selectedDevice.device_id}</SheetTitle>
                    <SheetDescription>
                        用户: {selectedDevice.user_id}
                        {selectedDevice.connected && (
                            <span className="ml-2 text-green-500">● 在线</span>
                        )}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-8 space-y-6">
                    {/* Trigger Key */}
                    <div className="space-y-2">
                        <Label htmlFor="keycode">触发键</Label>
                        <div className="flex gap-2">
                            <Input
                                id="keycode"
                                type="number"
                                value={keycode}
                                onChange={(e) => setKeycode(parseInt(e.target.value) || 61)}
                                className="flex-1"
                            />
                            <Button
                                variant="outline"
                                onClick={() => learnMutation.mutate()}
                                disabled={isLearning || !selectedDevice.connected}
                            >
                                {isLearning ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        按下按键...
                                    </>
                                ) : (
                                    <>
                                        <Keyboard className="mr-2 h-4 w-4" />
                                        侦测
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            当前: {getKeyName(keycode)} (code: {keycode})
                        </p>
                    </div>

                    {/* Language (placeholder) */}
                    <div className="space-y-2">
                        <Label htmlFor="language">语言</Label>
                        <select
                            id="language"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            defaultValue="zh"
                        >
                            <option value="zh">中文</option>
                            <option value="en">English</option>
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                        <Button
                            className="flex-1"
                            onClick={() => pushConfigMutation.mutate()}
                            disabled={pushConfigMutation.isPending || !selectedDevice.connected}
                        >
                            {pushConfigMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            保存
                        </Button>
                        <Button
                            variant="outline"
                            onClick={closeSheet}
                        >
                            取消
                        </Button>
                    </div>

                    {!selectedDevice.connected && (
                        <p className="text-sm text-amber-500">
                            ⚠️ 设备离线，无法推送配置
                        </p>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
