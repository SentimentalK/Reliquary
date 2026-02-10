import { useState, useEffect } from 'react'
import { Loader2, Keyboard, Save, X, Monitor, Key, Globe, Settings, Smartphone } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useDevicesStore } from '@/stores/devices'
import { useAuthStore } from '@/stores/auth'
import { devicesApi } from '@/lib/api'
import { getKeyName } from '@/lib/utils'
import { getIntlLocale } from '@/lib/i18n-utils'

export function DeviceConfigSheet() {
    const { selectedDevice, sheetOpen, closeSheet, updateDevice } = useDevicesStore()
    const { user } = useAuthStore()
    const { t } = useTranslation()

    const [keycode, setKeycode] = useState(selectedDevice?.keycode ?? 61)
    const [language, setLanguage] = useState(selectedDevice?.language ?? '')
    const [pipeline, setPipeline] = useState(selectedDevice?.pipeline ?? 'raw_whisper')
    const [apiKey, setApiKey] = useState('')
    const [isLearning, setIsLearning] = useState(false)

    // Update state when device changes
    useEffect(() => {
        if (selectedDevice) {
            setKeycode(selectedDevice.keycode ?? 61)
            setLanguage(selectedDevice.language ?? '')
            setPipeline(selectedDevice.pipeline ?? 'raw_whisper')
            setApiKey('') // Don't show existing API key for security
        }
    }, [selectedDevice])

    // Push config mutation
    const pushConfigMutation = useMutation({
        mutationFn: async () => {
            if (!selectedDevice) return
            const config: { keycode: number; language: string; api_key?: string; pipeline?: string } = {
                keycode,
                language,
                pipeline,
            }
            if (apiKey) {
                config.api_key = apiKey
            }
            await devicesApi.pushConfig(selectedDevice.device_id, config)
        },
        onSuccess: () => {
            if (selectedDevice) {
                updateDevice(selectedDevice.device_id, { keycode, language, pipeline })
            }
            closeSheet()
        },
    })

    // Learn hotkey mutation
    const learnMutation = useMutation({
        mutationFn: async () => {
            if (!selectedDevice) throw new Error(t('config.errorNoDevice'))
            setIsLearning(true)
            const result = await devicesApi.learnHotkeyAndWait(selectedDevice.device_id, 30)
            if (result.success && result.key_code !== undefined) {
                setKeycode(result.key_code)
                updateDevice(selectedDevice.device_id, { keycode: result.key_code })
                return result.key_code
            }
            throw new Error(result.error || t('config.errorDetectFailed'))
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
                                {selectedDevice.platform === 'android' ? (
                                    <Smartphone className="h-5 w-5 text-primary" />
                                ) : (
                                    <Monitor className="h-5 w-5 text-primary" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold">{selectedDevice.device_id}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {selectedDevice.connected ? (
                                        <span className="text-green-500">● {t('config.statusOnline')}</span>
                                    ) : (
                                        <span className="text-muted-foreground">○ {t('config.statusOffline')}</span>
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
                                    <h3 className="font-medium">{t('config.userInfo')}</h3>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">{t('config.displayName')}</Label>
                                        <p className="text-sm font-medium">{user?.display_name || '-'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">{t('config.role')}</Label>
                                        <p className="text-sm font-medium capitalize">{user?.role || '-'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">{t('config.deviceId')}</Label>
                                        <p className="text-sm font-mono text-muted-foreground">{selectedDevice.device_id}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">{t('config.connectedAt')}</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {(() => {
                                                if (!selectedDevice.connected_at) return '-'
                                                const date = typeof selectedDevice.connected_at === 'number' || !isNaN(Number(selectedDevice.connected_at))
                                                    ? new Date(Number(selectedDevice.connected_at) * 1000)
                                                    : new Date(selectedDevice.connected_at)
                                                return date.toLocaleString(getIntlLocale())
                                            })()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Hotkey Settings - disabled for mobile */}
                            <div className={`rounded-xl border bg-card p-6 ${selectedDevice.platform === 'android' ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Keyboard className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">{t('config.hotkeySettings')}</h3>
                                    {selectedDevice.platform === 'android' && (
                                        <span className="text-xs text-muted-foreground ml-auto">{t('config.mobileNotSupported')}</span>
                                    )}
                                </div>
                                {selectedDevice.platform !== 'android' && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="keycode">{t('config.triggerKey')}</Label>
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
                                                            {t('config.pressKey')}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Keyboard className="mr-2 h-4 w-4" />
                                                            {t('config.detect')}
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {t('config.current')}: <span className="font-medium">{getKeyName(keycode)}</span> (code: {keycode})
                                            </p>
                                            <p className="text-xs text-amber-500 mt-1">
                                                {t('config.hotkeyWarning')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Language & Pipeline Settings */}
                            <div className="rounded-xl border bg-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Globe className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">{t('config.languageModel')}</h3>
                                </div>
                                <div className="grid gap-6 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="language">{t('config.recognitionLang')}</Label>
                                        <select
                                            id="language"
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <option value="">{t('config.langAuto')}</option>
                                            <option value="zh">{t('config.langZh')}</option>
                                            <option value="en">{t('config.langEn')}</option>
                                            <option value="ja">{t('config.langJa')}</option>
                                            <option value="ko">{t('config.langKo')}</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="pipeline">{t('config.pipeline')}</Label>
                                        <select
                                            id="pipeline"
                                            value={pipeline}
                                            onChange={(e) => setPipeline(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <option value="geo_reliquary_v1">Geo Reliquary (Standard)</option>
                                            <option value="raw_whisper">Raw Whisper (Debug)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* API Key (BYOK) */}
                            <div className="rounded-xl border bg-card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Key className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-medium">{t('config.apiKey')}</h3>
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
                                        {t('config.apiKeyDesc')}
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
                                    {t('config.save')}
                                </Button>
                                <Button variant="outline" size="lg" onClick={closeSheet}>
                                    {t('config.cancel')}
                                </Button>
                            </div>

                            {!selectedDevice.connected && (
                                <p className="text-center text-sm text-amber-500">
                                    {t('config.deviceOfflineWarning')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
