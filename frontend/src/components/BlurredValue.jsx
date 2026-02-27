import { useAuth } from '../context/AuthContext'

/**
 * Wraps sensitive values (currency, numbers) and blurs them when the user
 * has enabled "Blur sensitive values" in Settings (e.g. for screen sharing).
 */
export default function BlurredValue({ children, as: Component = 'span', className = '', ...props }) {
    const { blurSensitiveValues } = useAuth()

    const blurStyle = blurSensitiveValues
        ? { filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }
        : undefined

    return (
        <Component className={className} style={blurStyle} {...props}>
            {children}
        </Component>
    )
}
