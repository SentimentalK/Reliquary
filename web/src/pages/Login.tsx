import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/lib/api'

type Mode = 'login' | 'register' | 'success'

export function Login() {
    const navigate = useNavigate()
    const { setAuth } = useAuthStore()
    const { t } = useTranslation()
    const [mode, setMode] = useState<Mode>('login')

    // Login state
    const [loginToken, setLoginToken] = useState('')
    const [showToken, setShowToken] = useState(false)

    // Register state
    const [displayName, setDisplayName] = useState('')
    const [inviteCode, setInviteCode] = useState('')

    // Success state
    const [generatedSecret, setGeneratedSecret] = useState('')
    const [copied, setCopied] = useState(false)

    // Login mutation
    const loginMutation = useMutation({
        mutationFn: async () => {
            const result = await authApi.verify(loginToken)
            if (!result.valid || !result.user) {
                throw new Error(t('login.errorToken'))
            }
            return result.user
        },
        onSuccess: (user) => {
            setAuth(loginToken, {
                id: user.id,
                display_name: user.display_name,
                role: user.role as 'user' | 'admin',
                created_at: user.created_at,
            })
            navigate('/')
        },
    })

    // Register mutation
    const registerMutation = useMutation({
        mutationFn: async () => {
            const result = await authApi.register({
                display_name: displayName,
                invite_code: inviteCode,
            })
            return result
        },
        onSuccess: (result) => {
            setGeneratedSecret(result.master_secret)
            setMode('success')
        },
    })

    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(generatedSecret)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const proceedToLogin = () => {
        setLoginToken(generatedSecret)
        setMode('login')
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
            <div className="w-full max-w-md space-y-8 p-8">
                {/* Logo */}
                {/* Logo - Side by Side */}
                <div className="flex items-center gap-6 px-2">
                    <Logo className="h-32 w-32 shrink-0 drop-shadow-xl dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
                    <div className="flex flex-col">
                        <span className="text-5xl font-bold tracking-tight">Reliquary</span>
                        <p className="mt-2 text-lg text-muted-foreground">{t('login.slogan')}</p>
                    </div>
                </div>

                {/* Card */}
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm shadow-xl">
                    {mode === 'login' && (
                        <>
                            <h2 className="text-xl font-semibold mb-6">{t('login.title')}</h2>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    loginMutation.mutate()
                                }}
                                className="space-y-4"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="token">{t('login.tokenLabel')}</Label>
                                    <div className="relative">
                                        <Input
                                            id="token"
                                            type={showToken ? 'text' : 'password'}
                                            placeholder={t('login.tokenPlaceholder')}
                                            value={loginToken}
                                            onChange={(e) => setLoginToken(e.target.value)}
                                            className="pr-10 font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(!showToken)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>

                                </div>

                                {loginMutation.error && (
                                    <p className="text-sm text-destructive">
                                        {(loginMutation.error as Error).message || t('login.errorFailed')}
                                    </p>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={!loginToken || loginMutation.isPending}
                                >
                                    {loginMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {t('login.submit')}
                                </Button>
                            </form>

                            <div className="mt-6 text-center">
                                <button
                                    onClick={() => setMode('register')}
                                    className="text-sm text-primary hover:underline"
                                >
                                    {t('login.registerLink')}
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'register' && (
                        <>
                            <h2 className="text-xl font-semibold mb-6">{t('login.registerTitle')}</h2>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    registerMutation.mutate()
                                }}
                                className="space-y-4"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="displayName">{t('login.displayNameLabel')}</Label>
                                    <Input
                                        id="displayName"
                                        placeholder={t('login.displayNamePlaceholder')}
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="inviteCode">{t('login.inviteCodeLabel')}</Label>
                                    <Input
                                        id="inviteCode"
                                        type="text"
                                        placeholder={t('login.inviteCodePlaceholder')}
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                    />

                                </div>

                                {registerMutation.error && (
                                    <p className="text-sm text-destructive">
                                        {(registerMutation.error as any)?.response?.data?.detail
                                            || (registerMutation.error as Error).message
                                            || t('login.errorRegister')}
                                    </p>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={!displayName || !inviteCode || registerMutation.isPending}
                                >
                                    {registerMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {t('login.registerSubmit')}
                                </Button>
                            </form>

                            <div className="mt-6 text-center">
                                <button
                                    onClick={() => setMode('login')}
                                    className="text-sm text-primary hover:underline"
                                >
                                    {t('login.loginLink')}
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'success' && (
                        <>
                            <div className="text-center mb-6">
                                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                                    <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                                </div>
                                <h2 className="mt-4 text-xl font-semibold">{t('login.successTitle')}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {t('login.successDesc')}
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                        {t('login.tokenWarning')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-sm break-all">
                                            {generatedSecret}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={copyToClipboard}
                                        >
                                            {copied ? (
                                                <Check className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                <Button onClick={proceedToLogin} className="w-full">
                                    {t('login.saveAndLogin')}
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground">
                    Reliquary v1.0.0
                </p>
            </div>
        </div>
    )
}
