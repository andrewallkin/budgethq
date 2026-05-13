import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/**
 * Back navigation to a hub/landing route (Investments, Investec Banking, etc.).
 */
export default function HubBackLink({ to, label, className = '' }) {
    if (!to || !label) return null
    return (
        <Link
            to={to}
            className={`inline-flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white ${className}`}
        >
            <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden />
            <span>Back to {label}</span>
        </Link>
    )
}
