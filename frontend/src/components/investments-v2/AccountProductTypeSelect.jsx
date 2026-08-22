import { PRODUCT_TYPES } from '../../investments-v2/types'

export default function AccountProductTypeSelect({ value, onChange, id, disabled }) {
    return (
        <select
            id={id}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
