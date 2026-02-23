import { Logo } from '@/components/Logo'
import {
    ArrowRight,
    Hexagon,
    TimerOff,
    StarOff,
    WifiOff,
    CloudOff,
    Zap
} from 'lucide-react'
import { SiteHeader } from '@/components/SiteHeader'
import { DeploymentSection } from '@/components/landing/DeploymentSection'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

export default function LandingPage() {
    const [deploymentTab, setDeploymentTab] = useState<'client' | 'server'>('client')
    const { t } = useTranslation()
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
            {/* Background Gradients */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-background">
                <div className="absolute top-0 z-[-2] h-screen w-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"></div>
                <div className="absolute bottom-0 left-0 z-[-2] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]"></div>
                <div className="absolute top-1/2 right-0 z-[-2] h-[500px] w-[500px] rounded-full bg-secondary/10 blur-[120px]"></div>
            </div>

            {/* Navbar */}
            <SiteHeader />

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

                                <div className="flex flex-col sm:flex-row gap-4 items-center justify-start mt-8">
                                    <button
                                        className="w-full sm:w-auto bg-primary text-primary-foreground px-10 py-4 rounded-2xl font-bold text-[16px] hover:bg-primary/95 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 shadow-xl flex items-center justify-center gap-3 relative overflow-hidden group"
                                        onClick={() => navigate('/login?mode=register&invite=RELIQUARY-TRIAL-24H')}
                                    >
                                        <div className="absolute inset-0 bg-white/20 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-700 ease-in-out"></div>
                                        <Zap className="w-5 h-5 fill-primary-foreground relative z-10" />
                                        <span className="relative z-10">{t('landing.hero.trial')}</span>
                                    </button>
                                    <button
                                        className="w-full sm:w-auto bg-transparent text-muted-foreground hover:text-foreground font-medium text-[16px] transition flex items-center justify-center gap-2 px-6 py-4 group"
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

                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center mb-10 w-full">
                            <button
                                className="w-full sm:w-auto bg-white text-zinc-950 px-12 py-5 rounded-2xl font-bold text-[18px] hover:bg-zinc-100 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-white/20 transition-all duration-300 shadow-xl flex items-center justify-center gap-3 relative overflow-hidden group"
                                onClick={() => navigate('/login?mode=register&invite=RELIQUARY-TRIAL-24H')}
                            >
                                <div className="absolute inset-0 bg-zinc-950/10 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-700 ease-in-out"></div>
                                <Zap className="w-6 h-6 fill-zinc-950 text-zinc-950 relative z-10" />
                                <span className="relative z-10 tracking-wide">{t('landing.cta.button')}</span>
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
