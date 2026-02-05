import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AudioWaveform, Loader2, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/lib/api'

type Mode = 'login' | 'register' | 'success'

export function Login() {
    const navigate = useNavigate()
    const { setAuth } = useAuthStore()
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
                throw new Error('无效的令牌')
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
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-3">
                        <AudioWaveform className="h-12 w-12 text-primary" />
                        <span className="text-4xl font-bold">Vortex</span>
                    </div>
                    <p className="mt-2 text-muted-foreground">智能语音输入系统</p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm shadow-xl">
                    {mode === 'login' && (
                        <>
                            <h2 className="text-xl font-semibold mb-6">登录</h2>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    loginMutation.mutate()
                                }}
                                className="space-y-4"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="token">认证令牌</Label>
                                    <div className="relative">
                                        <Input
                                            id="token"
                                            type={showToken ? 'text' : 'password'}
                                            placeholder="sk-vortex-..."
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
                                    <p className="text-xs text-muted-foreground">
                                        输入您的 Master Secret 令牌
                                    </p>
                                </div>

                                {loginMutation.error && (
                                    <p className="text-sm text-destructive">
                                        {(loginMutation.error as Error).message || '登录失败'}
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
                                    登录
                                </Button>
                            </form>

                            <div className="mt-6 text-center">
                                <button
                                    onClick={() => setMode('register')}
                                    className="text-sm text-primary hover:underline"
                                >
                                    没有账户？注册
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'register' && (
                        <>
                            <h2 className="text-xl font-semibold mb-6">注册新账户</h2>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    registerMutation.mutate()
                                }}
                                className="space-y-4"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="displayName">显示名称</Label>
                                    <Input
                                        id="displayName"
                                        placeholder="例如：Xinghan"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="inviteCode">邀请码</Label>
                                    <Input
                                        id="inviteCode"
                                        type="password"
                                        placeholder="输入邀请码"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        联系管理员获取邀请码
                                    </p>
                                </div>

                                {registerMutation.error && (
                                    <p className="text-sm text-destructive">
                                        {(registerMutation.error as Error).message || '注册失败'}
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
                                    注册
                                </Button>
                            </form>

                            <div className="mt-6 text-center">
                                <button
                                    onClick={() => setMode('login')}
                                    className="text-sm text-primary hover:underline"
                                >
                                    已有账户？登录
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
                                <h2 className="mt-4 text-xl font-semibold">注册成功！</h2>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    请保存您的 Master Secret，这是您唯一的登录凭证
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                        ⚠️ 重要：此令牌只显示一次，请妥善保存！
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
                                    我已保存，继续登录
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground">
                    Vortex v1.5 · Multi-User + BYOK
                </p>
            </div>
        </div>
    )
}
