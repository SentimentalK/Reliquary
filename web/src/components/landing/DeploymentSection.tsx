import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Monitor, Smartphone, Cloud, Code2, Server, Shield, Command, Download, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TerminalWindow } from './TerminalWindow'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react';

export type TabType = 'client' | 'server'
type PlatformType = 'mac' | 'win' | 'android' | 'ios'
type ServerType = 'docker' | 'prod' | 'trial'

interface DeploymentSectionProps {
    tab?: TabType
    onTabChange?: (tab: TabType) => void
}

export function DeploymentSection({ tab, onTabChange }: DeploymentSectionProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [internalTab, setInternalTab] = useState<TabType>('client')
    const [platform, setPlatform] = useState<PlatformType>('mac')
    const [serverMode, setServerMode] = useState<ServerType>('docker')

    // Use prop if available, otherwise internal state
    const activeTab = tab !== undefined ? tab : internalTab

    const handleTabChange = (newTab: TabType) => {
        if (onTabChange) {
            onTabChange(newTab)
        } else {
            setInternalTab(newTab)
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
    }

    // Effect to update platform/mode when tab changes (optional, but good UX)
    // If user clicks "Download Client", we might want to reset to Mac?
    // Not critical for now, let's keep it simple.

    return (
        <section id="deployment" className="container mx-auto px-4 py-24 space-y-12">
            <div className="text-center space-y-4">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    {t('landing.deployment.title')}
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    {t('landing.deployment.subtitle')}
                </p>
            </div>

            <div className="max-w-6xl mx-auto">
                {/* Main Tabs */}
                {/* Main Tabs - Refined Style */}
                <div className="flex justify-center mb-12">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => handleTabChange('client')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 border",
                                activeTab === 'client'
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 border-primary"
                                    : "bg-background text-muted-foreground border-border/40 hover:text-foreground hover:border-border/80 hover:bg-muted/30"
                            )}
                        >
                            <Monitor className="h-4 w-4" />
                            {t('landing.deployment.tabs.client')}
                        </button>
                        <button
                            onClick={() => handleTabChange('server')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 border",
                                activeTab === 'server'
                                    ? "bg-background text-foreground shadow-xl border-border/50 scale-105"
                                    : "bg-background text-muted-foreground border-border/40 hover:text-foreground hover:border-border/80 hover:bg-muted/30"
                            )}
                        >
                            <Server className="h-4 w-4" />
                            {t('landing.deployment.tabs.server')}
                        </button>
                    </div>
                </div>

                <div className="grid md:grid-cols-[280px_1fr] gap-8 items-start">
                    {/* Sidebar */}
                    <div className="space-y-2">
                        {activeTab === 'client' ? (
                            <>
                                <h3 className="px-4 pb-2 text-lg font-bold text-foreground uppercase tracking-wider">
                                    {t('landing.deployment.platform')}
                                </h3>
                                <Button
                                    variant={platform === 'mac' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base"
                                    onClick={() => setPlatform('mac')}
                                >
                                    <Command className="mr-3 h-5 w-5" /> {t('landing.deployment.platforms.mac')}
                                </Button>
                                <Button
                                    variant={platform === 'win' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base"
                                    onClick={() => setPlatform('win')}
                                >
                                    <Monitor className="mr-3 h-5 w-5" /> {t('landing.deployment.platforms.win')}
                                </Button>
                                <Button
                                    variant={platform === 'android' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base"
                                    onClick={() => setPlatform('android')}
                                >
                                    <Smartphone className="mr-3 h-5 w-5" /> {t('landing.deployment.platforms.android')}
                                </Button>
                                <Button
                                    variant={platform === 'ios' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base opacity-70"
                                    onClick={() => setPlatform('ios')}
                                >
                                    <Smartphone className="mr-3 h-5 w-5" /> {t('landing.deployment.platforms.ios')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <h3 className="px-4 pb-2 text-lg font-bold text-foreground uppercase tracking-wider">
                                    {t('landing.deployment.method')}
                                </h3>
                                <Button
                                    variant={serverMode === 'docker' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base"
                                    onClick={() => setServerMode('docker')}
                                >
                                    <Code2 className="mr-3 h-5 w-5" />
                                    {t('landing.deployment.methods.docker')}
                                </Button>
                                <Button
                                    variant={serverMode === 'prod' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base"
                                    onClick={() => setServerMode('prod')}
                                >
                                    <Shield className="mr-3 h-5 w-5" />
                                    {t('landing.deployment.methods.prod')}
                                </Button>
                                <Button
                                    variant={serverMode === 'trial' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start h-12 text-base"
                                    onClick={() => setServerMode('trial')}
                                >
                                    <Cloud className="mr-3 h-5 w-5" />
                                    {t('landing.deployment.methods.trial')}
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Terminal Area */}
                    <div className="min-h-[360px]">
                        {activeTab === 'client' && (
                            <>
                                {platform === 'mac' && (
                                    <>
                                        <div className="mb-6">
                                            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                                                {t('landing.deployment.steps.install')}
                                            </h4>
                                            <TerminalWindow
                                                showCopy
                                                className="bg-background border-border shadow-lg"
                                                headerClassName="bg-muted/30"
                                                onCopy={() => copyToClipboard('brew tap sentimentalk/tap && brew install reliquary')}
                                            >
                                                <div className="text-muted-foreground mb-4 select-none italic">
                                                    # {t('landing.deployment.tips.client.mac')}
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-green-500">➜</span>
                                                    <span className="text-blue-400">~</span>
                                                    <span>brew tap sentimentalk/tap && brew install reliquary</span>
                                                </div>
                                                <div className="text-muted-foreground/70 mt-3 select-none">
                                                    Updating Homebrew...<br />
                                                    ==&gt; <span className="text-foreground font-bold">Auto-updated Homebrew!</span><br />
                                                    ==&gt; <span className="text-green-500 font-bold">Downloading https://ghcr.io/v2/homebrew/core/reliquary...</span><br />
                                                    🍺  reliquary was successfully installed!
                                                </div>
                                            </TerminalWindow>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                                                {t('landing.deployment.steps.usage')}
                                            </h4>
                                            <div className="group relative">
                                                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
                                                <TerminalWindow
                                                    showCopy
                                                    className="relative bg-zinc-950 border-zinc-900 text-zinc-50 shadow-2xl dark:bg-zinc-50 dark:text-zinc-950 dark:border-zinc-200"
                                                    headerClassName="bg-zinc-900 border-zinc-800 dark:bg-zinc-100 dark:border-zinc-200"
                                                    onCopy={() => copyToClipboard('reliquary')}
                                                >
                                                    <div className="text-zinc-500 mb-4 select-none italic dark:text-zinc-400">
                                                        # {t('landing.deployment.tips.client.mac_usage')}
                                                    </div>
                                                    <div className="flex gap-2 font-medium">
                                                        <span className="text-green-500">➜</span>
                                                        <span className="text-blue-500">~</span>
                                                        <span>reliquary</span>
                                                    </div>
                                                    <div className="text-green-500/80 mt-3 font-medium dark:text-green-600/90 space-y-1">
                                                        <div className="flex gap-2">
                                                            <span>✔</span>
                                                            <span>Reliquary Client Started...</span>
                                                        </div>
                                                        <div className="flex gap-2 text-zinc-400 dark:text-zinc-500">
                                                            <span>?</span>
                                                            <span>{t('landing.deployment.tips.client.mac_usage_step1')}: <span className="text-zinc-500 dark:text-zinc-400">https://reliquary.sentimentalk.com</span></span>
                                                        </div>
                                                        <div className="flex gap-2 text-zinc-400 dark:text-zinc-500">
                                                            <span>?</span>
                                                            <span>{t('landing.deployment.tips.client.mac_usage_step2')}: <span className="text-zinc-500 dark:text-zinc-400">********</span></span>
                                                        </div>
                                                        <div className="flex gap-2 text-zinc-500 dark:text-zinc-400 mt-2">
                                                            <span>Listening on localhost:8080...</span>
                                                        </div>
                                                    </div>
                                                </TerminalWindow>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {platform === 'win' && (
                                    <TerminalWindow
                                        title="PowerShell"
                                        showCopy
                                        onCopy={() => copyToClipboard('scoop bucket add sentimentalk https://github.com/sentimentalk/scoop-bucket\nscoop install reliquary')}
                                    >
                                        <div className="text-muted-foreground mb-4 select-none italic">
                                            # {t('landing.deployment.tips.client.win')}
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-blue-400">PS C:\&gt;</span>
                                            <span>scoop bucket add sentimentalk https://github.com/sentimentalk/scoop-bucket</span>
                                        </div>
                                        <div className="text-muted-foreground/70 mb-3 select-none">
                                            Checking repo... ok<br />
                                            The sentimentalk bucket was added successfully.
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-blue-400">PS C:\&gt;</span>
                                            <span>scoop install reliquary</span>
                                        </div>
                                        <div className="text-muted-foreground/70 mt-3 select-none">
                                            Installing 'reliquary' (1.0.0) [64bit]<br />
                                            Reliquary installed successfully!
                                        </div>
                                    </TerminalWindow>
                                )}
                                {platform === 'android' && (
                                    <TerminalWindow title="Android Debug Bridge">
                                        <div className="text-muted-foreground mb-4 select-none italic">
                                            # {t('landing.deployment.tips.client.android')}
                                        </div>
                                        <div className="text-muted-foreground/70">
                                            <span className="text-yellow-500"># Android client available on GitHub Releases</span><br /><br />
                                            1. Enable "Install from Unknown Sources"<br />
                                            2. Download the latest APK<br /><br />
                                            <a
                                                href="https://github.com/sentimentalk/reliquary/releases"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-primary hover:underline underline-offset-4"
                                            >
                                                &gt; Go to GitHub Releases
                                            </a>
                                        </div>
                                    </TerminalWindow>
                                )}
                                {platform === 'ios' && (
                                    <TerminalWindow title="iOS Sideload">
                                        <div className="text-muted-foreground mb-4 select-none italic">
                                            # {t('landing.deployment.tips.client.ios')}
                                        </div>
                                        <div className="text-muted-foreground/90 space-y-2 font-mono text-sm leading-relaxed">
                                            {t('landing.deployment.tips.client.ios_steps').split('\n').map((step, i) => (
                                                <div key={i} className="flex gap-2">
                                                    <span className="text-blue-400 select-none">[{i + 1}]</span>
                                                    <span>{step}</span>
                                                </div>
                                            ))}
                                            <div className="pt-4">
                                                <a
                                                    href="https://github.com/sentimentalk/reliquary/releases"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-primary hover:underline underline-offset-4 flex items-center gap-2"
                                                >
                                                    <Download className="h-4 w-4" />
                                                    Download .ipa from GitHub
                                                </a>
                                            </div>
                                        </div>
                                    </TerminalWindow>
                                )}
                            </>
                        )}

                        {activeTab === 'server' && (
                            <>
                                {serverMode === 'docker' && (
                                    <TerminalWindow
                                        showCopy
                                        onCopy={() => copyToClipboard('git clone https://github.com/sentimentalk/reliquary.git\ncd reliquary\ndocker compose up -d')}
                                    >
                                        <div className="text-muted-foreground mb-4 select-none italic">
                                            # {t('landing.deployment.tips.server.docker')}
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-green-500">➜</span>
                                            <span>git clone https://github.com/sentimentalk/reliquary.git</span>
                                        </div>
                                        <div className="text-muted-foreground/70 mb-3 select-none">
                                            Cloning into 'reliquary'...<br />
                                            done.
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-green-500">➜</span>
                                            <span>cd reliquary && docker compose up -d</span>
                                        </div>
                                        <div className="text-green-500/80 mt-3 select-none">
                                            ✔ Container reliquary-backend  Started<br />
                                            ✔ Container reliquary-frontend Started
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-border/10">
                                            <span className="text-blue-400"># Web Interface:</span> http://localhost:3000<br />
                                            <span className="text-blue-400"># Server API:</span> http://localhost:8080
                                        </div>
                                    </TerminalWindow>
                                )}
                                {serverMode === 'prod' && (
                                    <TerminalWindow
                                        showCopy
                                        onCopy={() => copyToClipboard('cp .env.example .env\nvim .env\ndocker compose -f docker-compose.prod.yml up -d')}
                                    >
                                        <div className="text-muted-foreground mb-4 select-none italic">
                                            # {t('landing.deployment.tips.server.prod')}
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-green-500">➜</span>
                                            <span>cp .env.example .env</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-green-500">➜</span>
                                            <span>vim .env</span>
                                        </div>
                                        <div className="text-muted-foreground/70 mb-3 select-none">
                                            # Edit SECRET_KEY, Postgres password, etc.
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-green-500">➜</span>
                                            <span>docker compose -f docker-compose.prod.yml up -d</span>
                                        </div>
                                        <div className="text-green-500/80 mt-3 select-none">
                                            ✔ Container reliquary-db      Started<br />
                                            ✔ Container reliquary-server  Started<br />
                                            ✔ Container reliquary-web     Started
                                        </div>
                                    </TerminalWindow>
                                )}
                                {serverMode === 'trial' && (
                                    <TerminalWindow title="Trial Info">
                                        <div className="text-foreground/90 space-y-4 font-sans p-2">
                                            <h4 className="text-lg font-bold flex items-center gap-2 text-primary">
                                                <Cloud className="h-5 w-5" />
                                                {t('landing.deployment.tips.trial.title')}
                                            </h4>

                                            <div className="space-y-2 text-muted-foreground">
                                                <p>{t('landing.deployment.tips.trial.desc')}</p>

                                                <p className="flex flex-wrap items-center gap-2">
                                                    {t('landing.deployment.tips.trial.inviteLabel')}
                                                    <code className="text-rose-500 px-2 py-0.5 rounded font-mono font-bold">
                                                        reliquary-1day-demo
                                                    </code>
                                                </p>

                                                <div className="flex items-start gap-3 text-rose-600 bg-rose-50/50 p-4 rounded-lg border border-rose-200/60 shadow-inner">
                                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm md:text-base leading-relaxed font-medium">
                                                        {t('landing.deployment.tips.trial.warning')}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="pt-4">
                                                <Button
                                                    className="w-full sm:w-auto"
                                                    onClick={() => window.open('/#/login', '_self')}
                                                >
                                                    {t('landing.deployment.tips.trial.action')}
                                                </Button>
                                            </div>
                                        </div>
                                    </TerminalWindow>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}
