import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Copy, Check, Eye, EyeOff, AlertTriangle, Key } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/lib/api'
import { DeploymentSection } from '@/components/landing/DeploymentSection'

type Mode = 'login' | 'register' | 'success'

export function Login() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { setAuth } = useAuthStore()
    const { t } = useTranslation()

    const urlMode = searchParams.get('mode') as Mode
    const urlInvite = searchParams.get('invite')

    const [mode, setMode] = useState<Mode>(urlMode || 'login')

    // Login state
    const [loginToken, setLoginToken] = useState('')
    const [showToken, setShowToken] = useState(false)

    // Register state
    const [displayName, setDisplayName] = useState('')
    const [inviteCode, setInviteCode] = useState(urlInvite || '')

    // Success state
    const [generatedSecret, setGeneratedSecret] = useState('')
    const [copied, setCopied] = useState(false)
    const [hasCopiedRecord, setHasCopiedRecord] = useState(false)
    const [showCopyModal, setShowCopyModal] = useState(false)

    useEffect(() => {
        if (mode === 'register' && !inviteCode && !urlInvite) {
            setInviteCode('RELIQUARY-TRIAL-24H')
        }
    }, [mode, inviteCode, urlInvite])

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
        setHasCopiedRecord(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const proceedToLogin = () => {
        setLoginToken(generatedSecret)
        setMode('login')
    }

    const handleEnterSystem = () => {
        if (!hasCopiedRecord) {
            setShowCopyModal(true)
            return
        }
        proceedToLogin()
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
                                    <p className="text-xs text-muted-foreground pt-1">{t('login.inviteCodeHint')}</p>
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
                        <div className="space-y-8 animate-in fade-in duration-500">
                            {/* Header */}
                            <div className="text-center">
                                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                                    <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                                </div>
                                <h2 className="mt-4 text-2xl font-bold tracking-tight">{t('login.successTitle')}</h2>
                                <p className="mt-2 text-muted-foreground">
                                    {t('login.successDesc')}
                                </p>
                            </div>

                            {/* Steps Container */}
                            <div className="space-y-8 text-left">
                                {/* Step 1: Save Token */}
                                <div className="space-y-3">
                                    <h3 className="text-lg font-bold text-foreground">{t('login.success.step1Title')}</h3>
                                    <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-200 dark:border-amber-500/20">
                                        {t('login.success.step1Desc')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 rounded-lg bg-muted border border-border px-4 py-3 font-mono text-sm break-all font-semibold">
                                            {generatedSecret}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-11 w-11 shrink-0"
                                            onClick={copyToClipboard}
                                        >
                                            {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                                        </Button>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-border/50" />

                                {/* Step 2: Download Client */}
                                <div className="space-y-3">
                                    <h3 className="text-lg font-bold text-foreground">{t('login.success.step2Title')}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {t('login.success.step2Desc')}
                                    </p>
                                    <div className="rounded-xl border bg-background/50 overflow-hidden text-left relative -mx-2 px-2 pb-2">
                                        <DeploymentSection tab="client" hideHeader />
                                    </div>
                                </div>

                                <div className="h-px w-full bg-border/50" />

                                {/* Step 3: Prepare API Key */}
                                <div className="space-y-3">
                                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                        {t('login.success.step3Title')}
                                    </h3>
                                    <div className="flex gap-3 text-sm text-muted-foreground bg-secondary/30 p-4 rounded-lg border border-border/50">
                                        <Key className="w-5 h-5 shrink-0 text-primary mt-0.5" />
                                        <p>{t('login.success.step3Desc')}</p>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={handleEnterSystem}
                                size="lg"
                                className="w-full text-base font-bold shadow-lg"
                            >
                                {t('login.success.enterSystem')}
                            </Button>

                            {/* Copy Modal Enforcement */}
                            {showCopyModal && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                                    <div className="w-full max-w-sm rounded-xl bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-200 border border-border">
                                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-4">
                                            <AlertTriangle className="h-6 w-6" />
                                            <h3 className="text-lg font-bold">{t('login.success.copyModalTitle')}</h3>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-6">
                                            {t('login.success.copyModalDesc')}
                                        </p>
                                        <div className="flex flex-col gap-3">
                                            <Button
                                                onClick={() => {
                                                    setShowCopyModal(false)
                                                    copyToClipboard()
                                                    proceedToLogin()
                                                }}
                                                className="w-full font-bold bg-amber-600 hover:bg-amber-700 text-white"
                                            >
                                                <Copy className="mr-2 h-4 w-4" />
                                                {t('login.success.forceCopy')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={proceedToLogin}
                                                className="w-full text-muted-foreground hover:text-foreground"
                                            >
                                                {t('login.success.manualSaved')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
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
