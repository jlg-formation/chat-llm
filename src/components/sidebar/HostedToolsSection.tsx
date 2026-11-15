import { Globe } from 'lucide-react'
import { Accordion } from './Accordion'
import { Toggle } from './Toggle'
import { useConfig } from '../../store/configStore'
import {
  IMAGE_TOOL_MODELS,
  IMAGE_TOOL_SIZES,
  imageGenerationAvailable,
  imageGenerationProviderAvailable,
  webSearchAvailable,
} from '../../services/llm/helpers'
import { getImagePricing } from '../../services/imagePricing'

export function HostedToolsSection() {
  const [config, update] = useConfig()
  const available = webSearchAvailable(config)
  const imageAvailable = imageGenerationAvailable(config)
  const imageProviderOk = imageGenerationProviderAvailable(config)
  const imageModelLabel = (m: string) => {
    const p = getImagePricing(m)
    if (!p) return m
    return `${m} — $${p.textInputPerMillion.toFixed(2)}/$${p.imageInputPerMillion.toFixed(2)}/$${p.imageOutputPerMillion.toFixed(2)} /Mtok`
  }

  return (
    <Accordion title="Outils hébergés" icon={<Globe className="w-4 h-4 text-indigo-500" />}>
      <div className="space-y-3">
        <div
          className={`flex items-start justify-between gap-3 ${available ? '' : 'opacity-50 pointer-events-none'}`}
          aria-disabled={!available}
        >
          <div>
            <p className="text-sm text-gray-700">Recherche web</p>
            <p className="text-xs text-gray-400">
              Exécutée par le fournisseur. Facturée à chaque recherche.
            </p>
          </div>
          <Toggle
            checked={config.hostedTools.webSearch}
            onChange={() =>
              update({
                hostedTools: {
                  ...config.hostedTools,
                  webSearch: !config.hostedTools.webSearch,
                },
              })
            }
            color="teal"
          />
        </div>
        {!available && (
          <p className="text-xs text-amber-600">
            Disponible avec OpenAI (API Responses) et Anthropic (API Messages).
          </p>
        )}

        <div
          className={`space-y-2 ${imageAvailable ? '' : 'opacity-50 pointer-events-none'}`}
          aria-disabled={!imageAvailable}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-700">Génération d'images</p>
              <p className="text-xs text-gray-400">
                Le modèle crée une image si la demande s'y prête.
              </p>
            </div>
            <Toggle
              checked={config.hostedTools.imageGeneration}
              onChange={() =>
                update({
                  hostedTools: {
                    ...config.hostedTools,
                    imageGeneration: !config.hostedTools.imageGeneration,
                  },
                })
              }
              color="teal"
            />
          </div>
          <label className="block text-xs text-gray-500">
            Modèle d'image
            <select
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
              value={config.hostedTools.imageModel}
              disabled={!imageAvailable}
              onChange={(e) =>
                update({
                  hostedTools: {
                    ...config.hostedTools,
                    imageModel: e.target.value,
                  },
                })
              }
            >
              {IMAGE_TOOL_MODELS.map((m) => (
                <option key={m} value={m}>
                  {imageModelLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-gray-500">
            Taille (largeur × hauteur)
            <select
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
              value={config.hostedTools.imageSize}
              disabled={!imageAvailable}
              onChange={(e) =>
                update({
                  hostedTools: {
                    ...config.hostedTools,
                    imageSize: e.target.value,
                  },
                })
              }
            >
              {IMAGE_TOOL_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('x', ' × ')}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!imageAvailable && (
          <p className="text-xs text-amber-600">
            {imageProviderOk
              ? "Modèle principal non compatible avec l'outil image. Choisissez un modèle de la liste blanche."
              : 'Disponible avec OpenAI (API Responses).'}
          </p>
        )}
      </div>
    </Accordion>
  )
}
