import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { pipelineConfigApi, type StepSchema } from '@/lib/api'


/** Parse raw keywords text into clean array (max 10) */
function parseKeywords(text: string): string[] {
    return text
        .split(/[\n,;，；]+/)
        .map(l => l.trim())
        .filter(Boolean)
        .slice(0, 10)
}

/** Convert keywords array from server into editable text */
function keywordsToText(keywords: string[]): string {
    return keywords.join('\n')
}


export function PipelineConfig() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const [selectedStep, setSelectedStep] = useState<string>('')
    const [localConfig, setLocalConfig] = useState<Record<string, { keywordsText: string; user_prompt: string }>>({})
    const [hasChanges, setHasChanges] = useState(false)

    // Fetch schema (all configurable steps)
    const { data: schemaData, isLoading: schemaLoading } = useQuery({
        queryKey: ['pipeline-config-schema'],
        queryFn: pipelineConfigApi.getSchema,
    })

    // Fetch user config
    const { data: configData, isLoading: configLoading } = useQuery({
        queryKey: ['pipeline-config'],
        queryFn: pipelineConfigApi.get,
    })

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (config: Record<string, { keywordsText: string; user_prompt: string }>) => {
            const apiConfig: Record<string, { keywords: string[]; user_prompt: string }> = {}
            for (const [stepName, sc] of Object.entries(config)) {
                apiConfig[stepName] = {
                    keywords: parseKeywords(sc.keywordsText),
                    user_prompt: sc.user_prompt,
                }
            }
            return pipelineConfigApi.update(apiConfig)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-config'] })
            setHasChanges(false)
        },
    })

    const steps = schemaData?.steps || {}
    const stepNames = Object.keys(steps)

    // Auto-select first step
    useEffect(() => {
        if (stepNames.length > 0 && !selectedStep) {
            setSelectedStep(stepNames[0])
        }
    }, [stepNames, selectedStep])

    // Initialize local config from server
    useEffect(() => {
        if (configData?.config) {
            const converted: Record<string, { keywordsText: string; user_prompt: string }> = {}
            for (const [stepName, sc] of Object.entries(configData.config)) {
                converted[stepName] = {
                    keywordsText: keywordsToText(sc.keywords),
                    user_prompt: sc.user_prompt,
                }
            }
            setLocalConfig(converted)
        }
    }, [configData])

    const currentStep: StepSchema | undefined = steps[selectedStep]
    const currentConfig = localConfig[selectedStep] || { keywordsText: '', user_prompt: '' }

    const keywordCount = currentConfig.keywordsText
        .split(/[\n,;，；]+/)
        .map(l => l.trim())
        .filter(Boolean)
        .length

    const updateField = (field: 'keywordsText' | 'user_prompt', value: string) => {
        setLocalConfig(prev => ({
            ...prev,
            [selectedStep]: {
                ...currentConfig,
                [field]: value,
            },
        }))
        setHasChanges(true)
    }

    const handleSave = () => saveMutation.mutate(localConfig)
    const handleDiscard = () => {
        if (configData?.config) {
            const converted: Record<string, { keywordsText: string; user_prompt: string }> = {}
            for (const [stepName, sc] of Object.entries(configData.config)) {
                converted[stepName] = {
                    keywordsText: keywordsToText(sc.keywords),
                    user_prompt: sc.user_prompt,
                }
            }
            setLocalConfig(converted)
        }
        setHasChanges(false)
    }

    const isLoading = schemaLoading || configLoading

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{t('pipelineConfig.title')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('pipelineConfig.subtitle')}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        onClick={handleDiscard}
                        disabled={!hasChanges}
                    >
                        Discard
                    </button>
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || saveMutation.isPending}
                        className="gap-2 shadow-sm"
                    >
                        {saveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {t('pipelineConfig.save')}
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : stepNames.length === 0 ? (
                <div className="py-24 text-center text-muted-foreground">
                    {t('pipelineConfig.noPipelines')}
                </div>
            ) : (
                <div className="max-w-5xl">
                    {/* Step Selector Dropdown */}
                    <div className="mb-8 w-full md:w-1/2 lg:w-1/3">
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Select Pipeline Step
                        </label>
                        <div className="relative">
                            <select
                                className="block w-full appearance-none bg-muted/50 border-0 hover:bg-muted text-foreground text-lg font-medium py-3 px-4 rounded-xl focus:ring-2 focus:ring-muted-foreground/20 focus:bg-background transition-all cursor-pointer"
                                value={selectedStep}
                                onChange={(e) => setSelectedStep(e.target.value)}
                            >
                                {stepNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Configuration for selected step */}
                    {currentStep && (
                        <div className="space-y-10">
                            {/* System Prompt (Read-Only) */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                    System Prompt
                                    <span className="text-muted-foreground font-normal text-xs">(Read-only)</span>
                                </h3>
                                <div className="bg-muted/50 rounded-xl p-6 font-mono text-sm leading-relaxed text-muted-foreground border border-border/50 max-h-72 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap">{currentStep.system_prompt}</pre>
                                </div>
                            </div>

                            {/* Keywords */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-end">
                                    <label className="text-sm font-medium text-foreground">
                                        {t('pipelineConfig.keywords')}
                                    </label>
                                    <span className="text-xs text-muted-foreground">{keywordCount}/10</span>
                                </div>
                                <div className="relative group">
                                    <textarea
                                        rows={5}
                                        className="block w-full rounded-xl bg-muted/50 border-0 text-foreground placeholder:text-muted-foreground focus:ring-0 focus:bg-muted transition-colors duration-200 p-4 font-mono text-sm resize-none"
                                        placeholder={t('pipelineConfig.keywordsPlaceholder')}
                                        value={currentConfig.keywordsText}
                                        onChange={(e) => updateField('keywordsText', e.target.value)}
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 rounded-b-xl" />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t('pipelineConfig.keywordsDesc')}
                                </p>
                            </div>

                            {/* Custom Rules */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-foreground">
                                    {t('pipelineConfig.userPrompt')}
                                </label>
                                <div className="relative group">
                                    <textarea
                                        rows={3}
                                        className="block w-full rounded-xl bg-muted/50 border-0 text-foreground placeholder:text-muted-foreground focus:ring-0 focus:bg-muted transition-colors duration-200 p-4 text-sm resize-none"
                                        placeholder={t('pipelineConfig.userPromptPlaceholder')}
                                        value={currentConfig.user_prompt}
                                        onChange={(e) => updateField('user_prompt', e.target.value)}
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 rounded-b-xl" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Save feedback */}
                    {saveMutation.isSuccess && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-4">
                            {t('pipelineConfig.saved')}
                        </p>
                    )}
                    {saveMutation.isError && (
                        <p className="text-sm text-destructive mt-4">
                            {t('pipelineConfig.saveFailed')}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
