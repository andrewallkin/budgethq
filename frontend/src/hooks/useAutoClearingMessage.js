import { useState, useEffect } from 'react'

/** Message string that clears to '' after `delayMs` (default 8s). Resets timer when message changes. */
export function useAutoClearingMessage(delayMs = 8000) {
    const [message, setMessage] = useState('')

    useEffect(() => {
        if (!message) return
        const id = setTimeout(() => setMessage(''), delayMs)
        return () => clearTimeout(id)
    }, [message, delayMs])

    return [message, setMessage]
}
