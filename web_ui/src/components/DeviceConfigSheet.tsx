import { useState, useEffect } from 'react'
import { Loader2, Keyboard, Save, X, Monitor, Key, Globe, Settings } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useDevicesStore } from '@/stores/devices'
import { useAuthStore } from '@/stores/auth'
import { devicesApi } from '@/lib/api'
import { getKeyName } from '@/lib/utils'

export function DeviceConfigSheet() {
    const { selectedDevice, sheetOpen, closeSheet, updateDevice } = useDevicesStore()
    const { user } = useAuthStore()

    const [keycode, setKeycode] = useState(selectedDevice?.keycode ?? 61)
    const [language, setLanguage] = useState(selectedDevice?.language ?? 'zh')
    const [apiKey, setApiKey] = useState('')
    const [isLearning, setIsLearning] = useState(false)

    // Update state when device changes
    useEffect(() => {
        if (selectedDevice) {
            setKeycode(selectedDevice.keycode ?? 61)
            setLanguage(selectedDevice.language ?? 'zh')
        }
    }, [selectedDevice])

    // Push config mutation
    const pushConfigMutation = useMutation({
        mutationFn: async () => {
            if (!selectedDevice) return
            const config: { keycode: number; language: string; api_key?: string } = {
                keycode,
                language,
            }
            if (apiKey) {
                config.api_key = apiKey
            }
            await devicesApi.pushConfig(selectedDevice.device_id, config)
        },
        onSuccess: () => {
            if (selectedDevice) {
                updateDevice(selectedDevice.device_id, { keycode, language })
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
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${sheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={closeSheet}
            />

            {/* Bottom Sheet */}
            <div
                className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${sheetOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
                style={{ top: '48px' }}
            >
                <div className="h-full rounded-t-3xl bg-background border-t shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b px-6 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                <Monitor className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold">{selectedDevice.device_id}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {selectedDevice.connected ? (
                                        <span className="text-green-500">● 在线</span>
                                    ) : (
                                        <span className="text-muted-foreground">○ 离线</span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={closeSheet}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                        <div className="mx-auto max-w-2xl space-y-8">
                            {/* User Info Section (Read-only) */}
                            <div className="rounded-xl border bg-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Settings className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">用户信息</h3>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">显示名称</Label>
                                        <p className="text-sm font-medium">{user?.display_name || '-'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">角色</Label>
                                        <p className="text-sm font-medium capitalize">{user?.role || '-'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">设备 ID</Label>
                                        <p className="text-sm font-mono text-muted-foreground">{selectedDevice.device_id}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">连接时间</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {selectedDevice.connected_at
                                                ? new Date(selectedDevice.connected_at).toLocaleString('zh-CN')
                                                : '-'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Hotkey Settings */}
                            <div className="rounded-xl border bg-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Keyboard className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">快捷键设置</h3>
                                </div>
                                <div className="space-y-4">
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
                                            当前: <span className="font-medium">{getKeyName(keycode)}</span> (code: {keycode})
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Language Settings */}
                            <div className="rounded-xl border bg-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Globe className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">语言设置</h3>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="language">识别语言</Label>
                                    <select
                                        id="language"
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="zh">中文</option>
                                        <option value="en">English</option>
                                        <option value="ja">日本語</option>
                                        <option value="ko">한국어</option>
                                    </select>
                                </div>
                            </div>

                            {/* API Key (BYOK) */}
                            <div className="rounded-xl border bg-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Key className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">API 密钥 (BYOK)</h3>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="apiKey">Groq API Key</Label>
                                    <Input
                                        id="apiKey"
                                        type="password"
                                        placeholder="gsk_..."
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        className="font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        可选：使用自己的 Groq API Key 进行语音识别
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <Button
                                    className="flex-1"
                                    size="lg"
                                    onClick={() => pushConfigMutation.mutate()}
                                    disabled={pushConfigMutation.isPending || !selectedDevice.connected}
                                >
                                    {pushConfigMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    保存配置
                                </Button>
                                <Button variant="outline" size="lg" onClick={closeSheet}>
                                    取消
                                </Button>
                            </div>

                            {!selectedDevice.connected && (
                                <p className="text-center text-sm text-amber-500">
                                    ⚠️ 设备离线，无法推送配置
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
