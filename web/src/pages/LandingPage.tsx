import { Logo } from '@/components/Logo'
import {
    LogIn,
    Globe,
    Moon,
    Sun,
    Laptop,
    ArrowRight,
    Hexagon,
    TimerOff,
    StarOff,
    WifiOff,
    CloudOff,
    ServerOff,
    Play
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeploymentSection } from '@/components/landing/DeploymentSection'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n-utils'
import { useState } from 'react'

export default function LandingPage() {
    const [deploymentTab, setDeploymentTab] = useState<'client' | 'server'>('client')
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const { isAuthenticated } = useAuthStore()
    const { theme, setTheme } = useThemeStore()

    const cycleTheme = () => {
        if (theme === 'light') setTheme('dark')
        else if (theme === 'dark') setTheme('system')
        else setTheme('light')
    }

    const toggleLanguage = () => {
        const currentIndex = SUPPORTED_LANGUAGES.indexOf(i18n.language)
        const nextIndex = (currentIndex + 1) % SUPPORTED_LANGUAGES.length
        i18n.changeLanguage(SUPPORTED_LANGUAGES[nextIndex])
    }

    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
            {/* Background Gradients */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-background">
                <div className="absolute top-0 z-[-2] h-screen w-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"></div>
                <div className="absolute bottom-0 left-0 z-[-2] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]"></div>
                <div className="absolute top-1/2 right-0 z-[-2] h-[500px] w-[500px] rounded-full bg-secondary/10 blur-[120px]"></div>
            </div>

            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-8">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tighter">
                        {/* 32px Navbar Logo */}
                        <div className="relative h-8 w-8 flex items-center justify-center">
                            <Logo variant="nav" className="h-full w-full drop-shadow-md" />
                        </div>
                        Reliquary
                    </div>
                    <nav className="flex items-center gap-2 sm:gap-4">
                        <a href="https://github.com/sentimentalk/reliquary" target="_blank" rel="noreferrer" className="hidden sm:flex text-sm font-medium hover:text-primary transition-colors items-center gap-1">
                            GitHub
                        </a>
                        <a href="https://discord.gg/rWtHcMvb" target="_blank" rel="noreferrer" className="hidden sm:flex text-sm font-medium hover:text-primary transition-colors items-center gap-1">
                            Discord
                        </a>
                        <a href="https://github.com/sentimentalk/reliquary#readme" target="_blank" rel="noreferrer" className="hidden sm:flex text-sm font-medium hover:text-primary transition-colors items-center gap-1">
                            Docs
                        </a>

                        {/* Utilities Toggles */}
                        <div className="flex items-center gap-1 ml-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={toggleLanguage}>
                                <Globe className="h-4 w-4" />
                                <span className="sr-only">{t('layout.toggleLanguage')}</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={cycleTheme}>
                                <ThemeIcon className="h-4 w-4" />
                                <span className="sr-only">{t('layout.theme')}</span>
                            </Button>
                        </div>

                        <div className="h-4 w-[1px] bg-border mx-1"></div>
                        {isAuthenticated ? (
                            <Button variant="ghost" size="sm" className="h-8 gap-2" onClick={() => navigate('/dashboard')}>
                                <LogIn className="h-4 w-4" />
                                {t('layout.dashboard')}
                            </Button>
                        ) : (
                            <Button variant="ghost" size="sm" className="h-8 gap-2" onClick={() => navigate('/login')}>
                                <LogIn className="h-4 w-4" />
                                Login
                            </Button>
                        )}
                    </nav>
                </div>
            </header>

            <main className="flex flex-col w-full">
                {/* 第一屏：最新 Hero Section */}
                <header className="pt-32 pb-20 sm:pt-40 sm:pb-24 px-4 overflow-hidden bg-background">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid md:grid-cols-2 gap-16 items-center">
                            {/* 左侧：文案与 CTA */}
                            <div className="text-left w-full">
                                <h1 className="text-5xl sm:text-[56px] font-black tracking-tight text-foreground mb-8 leading-[1.15] whitespace-pre-line">
                                    {t('landing.hero.title')}
                                </h1>

                                <div className="pl-5 border-l-4 border-primary mb-10 space-y-6">
                                    <div className="space-y-3">
                                        <p
                                            className="text-[18px] md:text-[20px] font-bold text-foreground leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: t('landing.hero.quote1') }}
                                        />
                                        <p
                                            className="text-[18px] md:text-[20px] font-bold text-foreground leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: t('landing.hero.quote2') }}
                                        />
                                        <p
                                            className="text-[18px] md:text-[20px] font-bold text-foreground leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: t('landing.hero.quote3') }}
                                        />
                                    </div>
                                    <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md">
                                        {t('landing.hero.desc')}
                                    </p>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 items-center">
                                    <button
                                        className="w-full sm:w-auto bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-medium text-[15px] hover:bg-primary/90 transition shadow-md flex items-center justify-center gap-2"
                                        onClick={() => navigate('/login?mode=register&invite=RELIQUARY-TRIAL-24H')}
                                    >
                                        <Play className="w-4 h-4 fill-primary-foreground" /> {t('landing.hero.trial')}
                                    </button>
                                    <button
                                        className="w-full sm:w-auto bg-transparent text-muted-foreground hover:text-foreground font-medium text-[15px] transition flex items-center justify-center gap-2 px-4 py-3.5 group"
                                        onClick={() => {
                                            setDeploymentTab('server')
                                            document.getElementById('deployment')?.scrollIntoView({ behavior: 'smooth' })
                                        }}
                                    >
                                        {t('landing.hero.guide')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>
                            </div>

                            {/* 右侧：图形系统 */}
                            <div className="relative flex justify-center items-center mt-12 md:mt-0 w-full h-[400px]">
                                {/* 1. 最外层：还原带圆角、向右倾斜的六边形 */}
                                <Hexagon className="absolute z-0 w-[340px] h-[340px] text-muted-foreground/20 stroke-[0.5] transform rotate-12" />

                                {/* 2. 核心 Logo */}
                                <div className="absolute z-20 w-[220px] h-[220px]">
                                    <Logo variant="default" className="w-full h-full drop-shadow-2xl dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform duration-500" />
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* 第二屏：痛点揭露 */}
                <section className="py-20 bg-muted/30 border-t border-border/40">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold mb-4 text-foreground">{t('landing.painPoints.title')}</h2>
                            <p className="text-muted-foreground">{t('landing.painPoints.subtitle')}</p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {(t('landing.painPoints.items', { returnObjects: true }) as Array<{ title: string, desc: string }>).map((item, i) => {
                                const Icon = [TimerOff, StarOff, WifiOff, CloudOff][i]
                                return (
                                    <div key={i} className="p-8 rounded-xl bg-card border border-border/50 hover:border-border transition shadow-sm">
                                        <Icon className="w-6 h-6 mb-4 text-foreground" />
                                        <h3 className="text-xl font-bold mb-3 text-foreground">{item.title}</h3>
                                        <p className="text-muted-foreground leading-relaxed text-sm">
                                            {item.desc}
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* 第三屏：改良版A - 副文填充法 */}
                <section className="py-24 bg-background border-t border-border/40">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid md:grid-cols-12 gap-12 lg:gap-16">

                            <div className="md:col-span-4 relative">
                                <div className="sticky top-24">
                                    <h2
                                        className="text-3xl lg:text-[36px] font-black text-foreground leading-[1.2] tracking-tight mb-6"
                                        dangerouslySetInnerHTML={{ __html: t('landing.solution.title') }}
                                    />
                                    <p className="text-sm text-muted-foreground font-medium leading-relaxed pr-4">
                                        {t('landing.solution.subtitle')}
                                    </p>
                                </div>
                            </div>

                            <div className="md:col-span-8 space-y-16">
                                {(t('landing.solution.items', { returnObjects: true }) as Array<{ title: string, desc: string }>).map((item, i) => (
                                    <div key={i} className={`relative ${i > 0 ? 'pt-10 border-t border-border/40' : ''}`}>
                                        <div className="text-sm font-bold tracking-widest text-muted-foreground mb-3 font-mono">
                                            / 0{i + 1}
                                        </div>
                                        <h3
                                            className="text-2xl font-bold mb-4 text-foreground"
                                            dangerouslySetInnerHTML={{ __html: item.title }}
                                        />
                                        <p className="text-muted-foreground leading-relaxed text-[16px]">
                                            {item.desc}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 第四屏：从这里开始 -> DeploymentSection */}
                <section className="bg-muted/30 border-t border-border/40">
                    <DeploymentSection tab={deploymentTab} onTabChange={setDeploymentTab} />
                </section>

                {/* 底部 CTA */}
                <section className="py-20 bg-zinc-950 text-zinc-50 text-center dark:bg-zinc-900 border-t border-border/40">
                    <div className="max-w-3xl mx-auto px-4 flex flex-col items-center">
                        <h2 className="text-3xl font-bold mb-6">{t('landing.cta.title')}</h2>
                        <p className="text-zinc-400 mb-8 text-lg">{t('landing.cta.desc')}</p>

                        <div className="flex flex-col sm:flex-row gap-4 items-center mb-8">
                            <button
                                className="w-full sm:w-auto bg-primary text-primary-foreground px-8 py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition shadow-lg flex items-center justify-center gap-2"
                                onClick={() => navigate('/login?mode=register&invite=RELIQUARY-TRIAL-24H')}
                            >
                                <Play className="w-5 h-5 fill-primary-foreground" /> {t('landing.hero.trial')}
                            </button>
                            <button
                                className="w-full sm:w-auto bg-zinc-800 text-zinc-100 hover:text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-zinc-700 transition shadow-lg flex items-center justify-center gap-2"
                                onClick={() => {
                                    setDeploymentTab('server')
                                    document.getElementById('deployment')?.scrollIntoView({ behavior: 'smooth' })
                                }}
                            >
                                <ServerOff className="w-5 h-5" /> {t('landing.hero.guide')}
                            </button>
                        </div>

                        <div className="text-sm text-zinc-400 w-full max-w-xl text-left space-y-2 border border-zinc-800 bg-zinc-950/50 p-5 rounded-lg">
                            <p dangerouslySetInnerHTML={{ __html: t('landing.cta.disclaimer1') }} />
                            <p dangerouslySetInnerHTML={{ __html: t('landing.cta.disclaimer2') }} />
                            <p dangerouslySetInnerHTML={{ __html: t('landing.cta.disclaimer3') }} />
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-border/40 bg-background/50 backdrop-blur py-8 mt-24">
                <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left text-sm text-muted-foreground">
                    <div className="flex flex-col md:flex-row gap-2">
                        <p>{t('landing.footer.copyright')}</p>
                        <a
                            href="https://github.com/sentimentalk/reliquary/blob/main/LICENSE"
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-foreground underline underline-offset-4"
                        >
                            {t('landing.footer.license')}
                        </a>
                    </div>
                    <div className="flex gap-6">
                        <a href="https://discord.gg/rWtHcMvb" target="_blank" rel="noreferrer" className="hover:text-foreground">Discord</a>
                        <a href="#" className="hover:text-foreground">{t('landing.footer.privacy')}</a>
                        <a href="#" className="hover:text-foreground">{t('landing.footer.terms')}</a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
