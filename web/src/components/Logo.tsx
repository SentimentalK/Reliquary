import { cn } from '@/lib/utils'

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'nav' | 'favicon'
    className?: string
}

export function Logo({ variant = 'default', className, ...props }: LogoProps) {
    if (variant === 'favicon') {
        return (
            <div className={cn("relative flex items-center justify-center", className)} {...props}>
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                    <g className="stroke-foreground" fill="none" strokeLinejoin="round" strokeLinecap="round">
                        <polygon points="50,10 84.64,30 84.64,70 50,90 15.36,70 15.36,30" className="fill-background stroke-[6px]" />
                        <line x1="50" y1="50" x2="50" y2="90" className="stroke-[6px]" />
                        <line x1="50" y1="50" x2="15.36" y2="30" className="stroke-[6px]" />
                        <line x1="50" y1="50" x2="84.64" y2="30" className="stroke-[6px]" />
                        <polygon points="50,22 67,32 50,42 33,32" className="stroke-[5px]" />
                        <polygon points="26,46 40,54 40,70 26,62" className="stroke-[5px]" />
                        <polygon points="74,46 60,54 60,70 74,62" className="stroke-[5px]" />
                        <circle cx="50" cy="50" r="15" className="fill-background stroke-none" />
                        <circle cx="50" cy="50" r="11" className="stroke-[6px]" />
                        <circle cx="50" cy="50" r="3" className="fill-foreground stroke-none" />
                    </g>
                </svg>
            </div>
        )
    }

    if (variant === 'nav') {
        return (
            <div className={cn("relative flex items-center justify-center", className)} {...props}>
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                    <g className="stroke-foreground" fill="none" strokeLinejoin="round" strokeLinecap="round">
                        <polygon points="50,10 84.64,30 84.64,70 50,90 15.36,70 15.36,30" className="fill-background stroke-2" />
                        <line x1="50" y1="50" x2="50" y2="90" className="stroke-2" />
                        <line x1="50" y1="50" x2="15.36" y2="30" className="stroke-2" />
                        <line x1="50" y1="50" x2="84.64" y2="30" className="stroke-2" />

                        <polygon points="50,42 29.22,30 50,18 70.78,30" strokeWidth="1.5" />
                        <polygon points="50,36 39.61,30 50,24 60.39,30" strokeWidth="1.2" />
                        <polygon points="50,31.5 47.4,30 50,28.5 52.6,30" className="fill-foreground stroke-none" />

                        <polygon points="43.07,54 22.29,42 22.29,66 43.07,78" strokeWidth="1.5" />
                        <polygon points="37.87,57 27.48,51 27.48,63 37.87,69" strokeWidth="1.2" />
                        <polygon points="33.98,59.25 31.38,57.75 31.38,60.75 33.98,62.25" className="fill-foreground stroke-none" />

                        <polygon points="56.93,54 77.71,42 77.71,66 56.93,78" strokeWidth="1.5" />
                        <polygon points="62.13,57 72.52,51 72.52,63 62.13,69" strokeWidth="1.2" />
                        <polygon points="66.02,59.25 68.62,57.75 68.62,60.75 66.02,62.25" className="fill-foreground stroke-none" />

                        <circle cx="50" cy="50" r="13.5" className="fill-background" strokeWidth="1.5" />
                        <circle cx="50" cy="50" r="9.5" strokeWidth="1.5" strokeDasharray="3 3" />
                        <circle cx="50" cy="50" r="5.5" strokeWidth="1.5" />
                        <polygon points="50,47 53,51.5 47,51.5" className="fill-foreground stroke-none" />
                    </g>
                </svg>
            </div>
        )
    }

    // Default variant - The main refined logo from the user's latest LandingPage snippet
    // Adapted to be theme-aware: Black lines -> stroke-foreground, White fills -> fill-background/fill-foreground
    return (
        <div className={cn("relative flex items-center justify-center", className)} {...props}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full">
                <g className="stroke-foreground" fill="none" strokeLinejoin="round" strokeLinecap="round">
                    <polygon points="50,10 84.64,30 84.64,70 50,90 15.36,70 15.36,30" className="fill-background stroke-2" />
                    <line x1="50" y1="50" x2="50" y2="90" className="stroke-2" />
                    <line x1="50" y1="50" x2="15.36" y2="30" className="stroke-2" />
                    <line x1="50" y1="50" x2="84.64" y2="30" className="stroke-2" />

                    <polygon points="50,46 22.29,30 50,14 77.71,30" className="stroke-[1.5px]" />
                    <polygon points="50,42 29.22,30 50,18 70.78,30" className="stroke-[1.2px]" />
                    <polygon points="50,38 36.14,30 50,22 63.86,30" className="stroke-1" />
                    <polygon points="50,34 43.07,30 50,26 56.93,30" className="stroke-[0.8px]" />
                    <polygon points="50,31 48.27,30 50,29 51.73,30" className="fill-foreground stroke-none" />

                    <polygon points="46.54,52 18.82,36 18.82,68 46.54,84" className="stroke-[1.5px]" />
                    <polygon points="43.07,54 22.29,42 22.29,66 43.07,78" className="stroke-[1.2px]" />
                    <polygon points="39.61,56 25.75,48 25.75,64 39.61,72" className="stroke-1" />
                    <polygon points="36.14,58 29.22,54 29.22,62 36.14,66" className="stroke-[0.8px]" />
                    <polygon points="33.55,59.5 31.81,58.5 31.81,60.5 33.55,61.5" className="fill-foreground stroke-none" />

                    <polygon points="53.46,52 81.18,36 81.18,68 53.46,84" className="stroke-[1.5px]" />
                    <polygon points="56.93,54 77.71,42 77.71,66 56.93,78" className="stroke-[1.2px]" />
                    <polygon points="60.39,56 74.25,48 74.25,64 60.39,72" className="stroke-1" />
                    <polygon points="63.86,58 70.78,54 70.78,62 63.86,66" className="stroke-[0.8px]" />
                    <polygon points="66.45,59.5 68.19,58.5 68.19,60.5 66.45,61.5" className="fill-foreground stroke-none" />

                    <circle cx="50" cy="50" r="13.5" className="fill-background stroke-2" />
                    <circle cx="50" cy="50" r="9.5" className="stroke-[1.5px]" strokeDasharray="2 2.5" />
                    <circle cx="50" cy="50" r="6" className="stroke-[1.5px]" />
                    <polygon points="50,46 53.5,52 46.5,52" className="fill-foreground stroke-none" />
                </g>
            </svg>
        </div>
    )
}
