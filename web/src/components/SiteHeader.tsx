import { Logo } from '@/components/Logo'
import { LogIn, Globe, Moon, Sun, Laptop } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n-utils'

export function SiteHeader() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const location = useLocation()
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

    // Hide login button if we are already on login page
    const isLoginPage = location.pathname.startsWith('/login')

    return (
        <header className="fixed top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-8 mx-auto">
                <div
                    className="flex items-center gap-2 font-bold text-xl tracking-tighter cursor-pointer"
                    onClick={() => navigate('/')}
                >
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

                    {!isLoginPage && (
                        <>
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
                        </>
                    )}
                </nav>
            </div>
        </header>
    )
}
