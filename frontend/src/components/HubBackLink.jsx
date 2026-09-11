import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { paperBackLink } from './appUi'

/**
 * Back navigation to a hub/landing route (Investments, Investec Banking, etc.).
 */
export default function HubBackLink({ to, label, className = '' }) {
    if (!to || !label) return null
    return (
        <Link to={to} className={`-ml-1 pl-1 ${paperBackLink} ${className}`.trim()}>
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span>Back to {label}</span>
        </Link>
    )
}
