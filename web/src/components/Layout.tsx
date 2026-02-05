import { NavLink, useNavigate } from 'react-router-dom'
import {
    Monitor,
    History,
    Sun,
    Moon,
    Laptop,
    AudioWaveform,
    LogOut,
    User,
} from 'lucide-react'
import { Button } from './ui/button'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'

interface LayoutProps {
    children: React.ReactNode
}

const navItems = [
    { to: '/', icon: Monitor, label: '设备' },
    { to: '/history', icon: History, label: '记录' },
]

export function Layout({ children }: LayoutProps) {
    const navigate = useNavigate()
    const { theme, setTheme } = useThemeStore()
    const { user, logout } = useAuthStore()

    const cycleTheme = () => {
        if (theme === 'light') setTheme('dark')
        else if (theme === 'dark') setTheme('system')
        else setTheme('light')
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
                    <AudioWaveform className="h-8 w-8 text-primary" />
                    <span className="hidden text-xl font-bold md:block">Vortex</span>
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
                            <span className="hidden md:block">退出登录</span>
                        </Button>
                    </div>
                )}

                {/* Theme Toggle */}
                <div className="border-t p-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={cycleTheme}
                        className="w-full justify-start gap-3"
                    >
                        <ThemeIcon className="h-5 w-5" />
                        <span className="hidden md:block">
                            {theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}
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

