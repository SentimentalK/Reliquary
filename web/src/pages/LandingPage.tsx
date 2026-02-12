import { Logo } from '@/components/Logo'
import {
    Mic,
    BrainCircuit,
    ShieldCheck,
    Workflow,
    Zap,
    Container,
    Terminal,
    ArrowRight,
    Download,
    LogIn,
    Globe,
    Moon,
    Sun,
    Laptop
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n-utils'

export default function LandingPage() {
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

    const features = [
        {
            icon: Mic,
            title: t('landing.features.mic.title'),
            titleEn: "Uninterrupted Thought Flow",
            desc: t('landing.features.mic.desc')
        },
        {
            icon: ShieldCheck,
            title: t('landing.features.sovereignty.title'),
            titleEn: "Digital Sovereignty",
            desc: t('landing.features.sovereignty.desc')
        },
        {
            icon: Workflow,
            title: t('landing.features.pipeline.title'),
            titleEn: "Pipeline Architecture",
            desc: t('landing.features.pipeline.desc')
        },
        {
            icon: Zap,
            title: t('landing.features.lightweight.title'),
            titleEn: "Lightweight & Ubiquitous",
            desc: t('landing.features.lightweight.desc')
        },
        {
            icon: BrainCircuit,
            title: t('landing.features.speed.title'),
            titleEn: "Groq Powered Speed",
            desc: t('landing.features.speed.desc')
        },
        {
            icon: Container,
            title: t('landing.features.docker.title'),
            titleEn: "One-Click Fortress",
            desc: t('landing.features.docker.desc')
        }
    ]

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
                        <a href="#" className="hidden sm:flex text-sm font-medium hover:text-primary transition-colors items-center gap-1">
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

            <main className="container mx-auto px-4 py-16 md:py-24 lg:py-32">
                {/* Hero Section */}
                <div className="flex flex-col items-center text-center space-y-8 mb-24">
                    <div className="inline-flex items-center rounded-full border border-primary/20 bg-secondary/50 px-3 py-1 text-sm font-medium text-secondary-foreground backdrop-blur-sm mb-4">
                        <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                        {t('landing.version')}
                    </div>

                    {/* Prominent Logo & Name */}
                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative group flex justify-center items-center mb-2">
                            {/* Glow backdrop */}
                            <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-700"></div>

                            {/* Main Logo Image */}
                            <Logo variant="default" className="relative z-10 h-32 w-32 sm:h-40 sm:w-40 md:h-48 md:w-48 drop-shadow-2xl dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform duration-500 ease-out" />
                        </div>

                        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl text-foreground">
                            {t('landing.heroTitle')}
                        </h1>

                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl text-foreground max-w-4xl mx-auto">
                            {t('landing.heroSubtitle')} <span className="text-primary ml-2">{t('landing.heroSubtitleStrong')}</span>
                        </h2>
                    </div>

                    <p className="max-w-[700px] text-lg text-muted-foreground md:text-xl pt-4">
                        {t('landing.heroDesc')}
                        <br className="hidden sm:inline" />
                        {t('landing.heroDesc2')}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4">
                        <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                            <Download className="mr-2 h-5 w-5" />
                            {t('landing.download')}
                        </Button>
                        <Button variant="outline" size="lg" className="h-12 px-8 text-base bg-background/50 backdrop-blur-sm hover:bg-accent/50 hover:scale-105 transition-transform">
                            <Terminal className="mr-2 h-5 w-5" />
                            {t('landing.docker')}
                        </Button>
                    </div>

                    {/* Terminal Preview Hint */}
                    <div className="pt-8 w-full max-w-3xl mx-auto opacity-70 hover:opacity-100 transition-opacity duration-500">
                        <div className="rounded-lg border bg-card/50 backdrop-blur text-left overflow-hidden shadow-2xl">
                            <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
                                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                                <div className="h-3 w-3 rounded-full bg-green-500/80" />
                                <span className="ml-2 text-xs text-muted-foreground font-mono">bash — 80x24</span>
                            </div>
                            <div className="p-4 font-mono text-sm text-muted-foreground">
                                <div className="flex gap-2">
                                    <span className="text-primary">➜</span>
                                    <span className="text-foreground">docker compose up -d</span>
                                </div>
                                <div className="mt-2 text-green-400">✔ Container reliquary-server  Started</div>
                                <div className="text-green-400">✔ Container reliquary-web     Started</div>
                                <div className="mt-2 text-foreground/80">
                                    Server running at http://localhost:8080<br />
                                    Web Interface ready at http://localhost:3000
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature, index) => (
                        <Card key={index} className="group relative overflow-hidden border-primary/10 bg-card/40 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
                            <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                            <CardHeader>
                                <feature.icon className="h-10 w-10 text-primary mb-2" />
                                <CardTitle className="text-xl">{feature.title}</CardTitle>
                                <CardDescription className="font-mono text-xs uppercase tracking-wider text-primary/70">
                                    {feature.titleEn}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="relative z-10">
                                <p className="text-muted-foreground leading-relaxed">
                                    {feature.desc}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Bottom CTA */}
                <div className="mt-32 text-center space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">{t('landing.ready')}</h2>
                    <p className="text-muted-foreground">{t('landing.community')}</p>
                    <Button variant="link" size="lg" className="text-primary" onClick={() => window.open('https://github.com/sentimentalk/reliquary', '_blank')}>
                        {t('landing.sourceCode')} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
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
                        <a href="#" className="hover:text-foreground">{t('landing.footer.privacy')}</a>
                        <a href="#" className="hover:text-foreground">{t('landing.footer.terms')}</a>
                        {/* <a href="#" className="hover:text-foreground">{t('landing.footer.twitter')}</a> */}
                    </div>
                </div>
            </footer>
        </div>
    )
}
