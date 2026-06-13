import { Braces } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'

export function JsonSchemaSection() {
  const [config, update] = useConfig()

  const isValid = !config.jsonSchema || (() => {
    try { JSON.parse(config.jsonSchema); return true } catch { return false }
  })()

  return (
    <Accordion title="Structured Output" icon={<Braces className="w-4 h-4 text-orange-500" />}>
      <div>
        <textarea
          value={config.jsonSchema}
          onChange={e => update({ jsonSchema: e.target.value })}
          rows={6}
          className={`w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono ${
            !isValid ? 'border-red-400' : 'border-gray-300'
          }`}
          placeholder={'{\n  "name": "mon_schema",\n  "schema": {\n    "type": "object"\n  }\n}'}
        />
        {!isValid && <p className="text-xs text-red-500 mt-1">JSON invalide</p>}
        <p className="text-xs text-gray-500 mt-1">
          Si renseigné, active le Structured Output (response_format) dans la requête au LLM.
        </p>
      </div>
    </Accordion>
  )
}
