import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { Loader2 } from 'lucide-react'
import { useInvestmentsV2Optional } from '../investments-v2/InvestmentsV2Provider'
import { sheetsAccountId } from '../investments-v2/sheetsAccounts'
import TFSAPortfolio from './TFSAPortfolio'

export default function InvestmentPortfolioPage({
    hubBackLink = { to: '/investments', label: 'Investments' },
    notFoundTo = '/investments',
}) {
    const { portfolioSlug } = useParams()
    const navigate = useNavigate()
    const investmentsV2 = useInvestmentsV2Optional()
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
        return (
            <div className="mx-auto flex max-w-[1080px] items-center justify-center py-12 text-[var(--paper-muted)]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                Loading portfolio…
            </div>
        )
    }
    if (notFound) {
        return <Navigate to={notFoundTo} replace />
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
            hubBackLink={hubBackLink}
            onPortfolioDeleted={async () => {
                if (investmentsV2 && portfolio?.id != null) {
                    investmentsV2.removeAccount(sheetsAccountId(portfolio.id))
                    await investmentsV2.refreshAccounts()
                }
                navigate(hubBackLink?.to || notFoundTo)
            }}
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
