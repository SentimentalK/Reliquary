import { NavLink, useNavigate, Link } from 'react-router-dom'
import { Logo } from './Logo'
import {
    Monitor,
    History,
    Sun,
    Moon,
    Laptop,
    LogOut,
    User,
    Globe,
    Settings2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n-utils'

interface LayoutProps {
    children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
    const navigate = useNavigate()
    const { theme, setTheme } = useThemeStore()
    const { user, logout } = useAuthStore()
    const { t, i18n } = useTranslation()

    const navItems = [
        { to: '/dashboard', icon: Monitor, label: t('nav.devices') },
        { to: '/history', icon: History, label: t('nav.history') },
        { to: '/pipeline-config', icon: Settings2, label: t('nav.pipelineConfig') },
    ]

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

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col border-r bg-card/50 backdrop-blur-sm md:w-64">
                {/* Logo */}
                <div className="flex h-16 items-center gap-2 border-b px-4">
                    <Link to="/" className="flex items-center gap-2">
                        <Logo variant="nav" className="h-8 w-8 text-primary" />
                        <span className="hidden text-xl font-bold md:block">Reliquary</span>
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1 p-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent ${isActive
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground'
                                }`
                            }
                        >
                            <item.icon className="h-5 w-5" />
                            <span className="hidden md:block">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* User Info */}
                {user && (
                    <div className="border-t p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                                <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className="hidden md:block">
                                <p className="text-sm font-medium">{user.display_name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden md:block">{t('layout.logout')}</span>
                        </Button>
                    </div>
                )}

                {/* Theme & Language Toggle */}
                <div className="border-t p-4 space-y-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={cycleTheme}
                        className="w-full justify-start gap-3"
                    >
                        <ThemeIcon className="h-5 w-5" />
                        <span className="hidden md:block">
                            {t('layout.theme')}
                        </span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleLanguage}
                        className="w-full justify-start gap-3"
                    >
                        <Globe className="h-5 w-5" />
                        <span className="hidden md:block">
                            {t('layout.toggleLanguage')}
                        </span>
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="ml-16 flex-1 md:ml-64">
                <div className="container py-6">
                    {children}
                </div>
            </main>
        </div>
    )
}


