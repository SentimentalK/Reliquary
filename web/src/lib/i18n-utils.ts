import { type Locale } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import i18n from '@/i18n'

export const dateFnsLocaleMap: Record<string, Locale> = {
    en: enUS,
    zh: zhCN,
}

export const intlLocaleMap: Record<string, string> = {
    en: 'en-US',
    zh: 'zh-CN',
}

export const SUPPORTED_LANGUAGES = ['en', 'zh']

export const getDateFnsLocale = (): Locale => {
    return dateFnsLocaleMap[i18n.language] || enUS
}

export const getIntlLocale = (): string => {
    return intlLocaleMap[i18n.language] || 'en-US'
}
