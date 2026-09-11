import { PRODUCT_TYPES } from '../../investments-v2/types'

const fieldInput =
    'min-h-[40px] w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50'

export default function AccountProductTypeSelect({ value, onChange, id, disabled }) {
    return (
        <select
            id={id}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={fieldInput}
        >
            <option value="">Choose type</option>
            {PRODUCT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                    {type.label}
                </option>
            ))}
        </select>
    )
}
