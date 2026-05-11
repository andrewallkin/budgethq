import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import axios from 'axios'
import TFSAPortfolio from './TFSAPortfolio'

export default function InvestmentPortfolioPage() {
    const { portfolioSlug } = useParams()
    const [loading, setLoading] = useState(true)
    const [portfolio, setPortfolio] = useState(null)
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        const loadPortfolio = async () => {
            setLoading(true)
            setNotFound(false)
            try {
                const res = await axios.get(`/api/investments/slug/${portfolioSlug}`)
                setPortfolio(res.data)
            } catch (err) {
                if (err.response?.status === 404) {
                    setNotFound(true)
                }
            } finally {
                setLoading(false)
            }
        }
        if (portfolioSlug) {
            loadPortfolio()
        }
    }, [portfolioSlug])

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading portfolio...</div>
    }
    if (notFound) {
        return <Navigate to="/investments" replace />
    }
    if (!portfolio) return null

    const showTargetAllocation = Boolean(
        portfolio.is_default_tfsa || portfolio.target_allocation_enabled !== false
    )

    return (
        <TFSAPortfolio
            portfolioId={portfolio.id}
            portfolioName={portfolio.name}
            currencyCode={portfolio.currency_code || 'ZAR'}
            isTfsa={portfolio.is_default_tfsa}
            showTargetAllocation={showTargetAllocation}
            onPortfolioMetaUpdated={(data) =>
                setPortfolio((p) =>
                    p && data.id === p.id
                        ? {
                              ...p,
                              name: data.name ?? p.name,
                              currency_code: data.currency_code ?? p.currency_code,
                              target_allocation_enabled:
                                  data.target_allocation_enabled ?? p.target_allocation_enabled,
                          }
                        : p
                )}
        />
    )
}
