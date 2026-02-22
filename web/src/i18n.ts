import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import zh from './locales/zh.json'

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            zh: { translation: zh },
        },
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            // Priority: Query string -> User's saved preference -> Browser navigator language
            order: ['queryString', 'localStorage', 'cookie', 'navigator'],
            caches: ['localStorage', 'cookie'],
        }
    })

// Custom logic to handle zh-CN, zh-TW, etc. from browser detection
i18n.on('languageChanged', (lng) => {
    if (lng && lng.toLowerCase().startsWith('zh') && lng !== 'zh') {
        i18n.changeLanguage('zh')
    } else if (lng && !lng.startsWith('en') && !lng.startsWith('zh')) {
        // Fallback to English for any unsupported languages
        i18n.changeLanguage('en')
    }
})

export default i18n
