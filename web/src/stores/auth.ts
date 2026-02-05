import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
    id: string
    display_name: string
    role: 'user' | 'admin'
    created_at: string
}

interface AuthState {
    token: string | null
    user: User | null
    isAuthenticated: boolean
    setAuth: (token: string, user: User) => void
    logout: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            user: null,
            isAuthenticated: false,

            setAuth: (token, user) =>
                set({
                    token,
                    user,
                    isAuthenticated: true,
                }),

            logout: () =>
                set({
                    token: null,
                    user: null,
                    isAuthenticated: false,
                }),
        }),
        {
            name: 'vortex-auth',
        }
    )
)
