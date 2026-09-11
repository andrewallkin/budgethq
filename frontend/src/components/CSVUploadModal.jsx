import { useState, useRef } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react'
import axios from 'axios'
import { ModalPortal, paperEyebrow, paperDivider } from './appUi'

const BASE_REQUIRED_COLUMNS = ['jse_ticker', 'etf_name', 'region', 'shares']
const ROW_TICKER_OK = /^[A-Z0-9:.\-^]+$/

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`

export default function CSVUploadModal({
    isOpen,
    onClose,
    onSuccess,
    portfolioId = null,
    requireJsePrefix = true,
    etfOnlyMode = true,
    allocationOptional = false,
}) {
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState([])
    const [errors, setErrors] = useState([])
    const [uploading, setUploading] = useState(false)
    const [result, setResult] = useState(null)
    const fileInputRef = useRef(null)

    const resetState = () => {
        setFile(null)
        setPreview([])
        setErrors([])
        setResult(null)
    }

    const handleClose = () => {
        resetState()
        onClose()
    }

    const parseCSV = (text) => {
        const lines = text.trim().split('\n')
        if (lines.length < 2) {
            return { headers: [], rows: [], error: 'CSV must have a header row and at least one data row' }
        }

        const headers = lines[0].split(',').map((h) => {
            const t = h.trim().toLowerCase()
            return t === 'ticker' ? 'jse_ticker' : t
        })
        const rows = []

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map((v) => v.trim())
            if (values.length === headers.length) {
                const row = {}
                headers.forEach((h, idx) => {
                    row[h] = values[idx]
                })
                rows.push(row)
            }
        }

        return { headers, rows, error: null }
    }

    const validateCSV = (headers, rows) => {
        const validationErrors = []

        const requiredCols = allocationOptional
            ? BASE_REQUIRED_COLUMNS
            : [...BASE_REQUIRED_COLUMNS, 'target_percentage']

        const missingCols = requiredCols.filter((col) => !headers.includes(col))
        if (missingCols.length > 0) {
            const labels = missingCols.map((col) => (col === 'jse_ticker' ? 'ticker' : col))
            validationErrors.push(`Missing required columns: ${labels.join(', ')}`)
        }

        rows.forEach((row, idx) => {
            const rowNum = idx + 2

            const tickerRaw = (row.jse_ticker || '').trim()
            if (!tickerRaw) {
                validationErrors.push(`Row ${rowNum}: Ticker is required`)
            } else if (requireJsePrefix && !tickerRaw.startsWith('JSE:')) {
                validationErrors.push(
                    `Row ${rowNum}: Invalid ticker format. Must start with "JSE:" (e.g., JSE:STX40)`
                )
            } else if (!requireJsePrefix) {
                const u = tickerRaw.toUpperCase()
                if (!ROW_TICKER_OK.test(u) || u.length > 64) {
                    validationErrors.push(`Row ${rowNum}: Invalid ticker characters or length`)
                }
            }

            const nameLabel = etfOnlyMode ? 'ETF name' : 'Instrument name'
            if (!row.etf_name) {
                validationErrors.push(`Row ${rowNum}: ${nameLabel} is required`)
            }

            const sharesStr = row.shares?.trim()
            if (sharesStr && sharesStr !== '') {
                const shares = parseFloat(sharesStr)
                if (isNaN(shares) || shares < 0) {
                    validationErrors.push(`Row ${rowNum}: Shares must be a non-negative number or blank`)
                }
            }

            const hasTargetCol = headers.includes('target_percentage')
            const targetRaw = hasTargetCol ? row.target_percentage : ''

            let targetPct
            if (
                !hasTargetCol ||
                targetRaw === undefined ||
                targetRaw === null ||
                String(targetRaw).trim() === ''
            ) {
                targetPct = allocationOptional ? 0 : NaN
            } else {
                targetPct = parseFloat(targetRaw)
            }
            if (isNaN(targetPct) || targetPct < 0 || targetPct > 100) {
                validationErrors.push(`Row ${rowNum}: Target percentage must be between 0 and 100`)
            }
        })

        if (!allocationOptional) {
            const totalTarget = rows.reduce((sum, row) => sum + (parseFloat(row.target_percentage) || 0), 0)
            if (Math.abs(totalTarget - 100) > 0.5) {
                validationErrors.push(
                    `Warning: Target percentages sum to ${totalTarget.toFixed(1)}% (should be 100%)`
                )
            }
        }

        return validationErrors
    }

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        if (!selectedFile.name.endsWith('.csv')) {
            setErrors(['Please select a CSV file'])
            return
        }

        setFile(selectedFile)
        setErrors([])
        setResult(null)

        const reader = new FileReader()
        reader.onload = (event) => {
            const text = event.target?.result
            const { headers, rows, error } = parseCSV(text)

            if (error) {
                setErrors([error])
                setPreview([])
                return
            }

            const validationErrors = validateCSV(headers, rows)
            setErrors(validationErrors.filter((e) => !e.startsWith('Warning:')))

            setPreview(rows.slice(0, 5))
        }
        reader.readAsText(selectedFile)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        const droppedFile = e.dataTransfer.files?.[0]
        if (droppedFile) {
            handleFileSelect({ target: { files: [droppedFile] } })
        }
    }

    const handleUpload = async () => {
        if (!file || errors.length > 0) return

        setUploading(true)
        setResult(null)

        const formData = new FormData()
        formData.append('file', file)

        try {
            const response = await axios.post('/api/etf/bulk-import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                ...(portfolioId ? { params: { portfolio_id: portfolioId } } : {}),
            })
            setResult(response.data)
            if (response.data.created > 0 || response.data.updated > 0) {
                onSuccess?.()
            }
        } catch (err) {
            setResult({
                created: 0,
                updated: 0,
                failed: 0,
                errors: [err.response?.data?.detail || 'Upload failed'],
            })
        } finally {
            setUploading(false)
        }
    }

    const downloadTemplate = () => {
        let template
        if (allocationOptional) {
            if (requireJsePrefix) {
                template = `ticker,etf_name,region,shares
JSE:STX40,Satrix Top 40,South Africa,10.5
JSE:STXNDQ,Satrix Nasdaq 100,USA,5.25`
            } else {
                template = `ticker,etf_name,region,shares
NASDAQ:AAPL,Apple Inc.,USA,2
NYSE:KO,Coca-Cola,USA,5`
            }
        } else if (requireJsePrefix) {
            template = `ticker,etf_name,region,shares,target_percentage
JSE:STX40,Satrix Top 40,South Africa,10.5,40
JSE:STXNDQ,Satrix Nasdaq 100,USA,5.25,30
JSE:SYGWD,Sygnia Itrix MSCI World,Global,8.0,30`
        } else {
            template = `ticker,etf_name,region,shares,target_percentage
NASDAQ:AAPL,Apple Inc.,USA,2,100
NYSE:KO,Coca-Cola,USA,,0`
        }
        const blob = new Blob([template], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = etfOnlyMode ? 'etf_holdings_template.csv' : 'portfolio_holdings_template.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    if (!isOpen) return null

    const titleId = 'csv-upload-modal-title'

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div>
                        <h2 id={titleId} className="text-lg font-semibold text-[var(--paper-ink)]">
                            {etfOnlyMode ? 'Import ETF Holdings' : 'Import holdings'}
                        </h2>
                        <p className={`mt-1 ${paperEyebrow}`}>
                            Upload a CSV to create new holdings or update existing ones
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-5 sm:p-6">
                    <button
                        type="button"
                        onClick={downloadTemplate}
                        className="mb-4 inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--paper-accent)] hover:underline focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                    >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download CSV template
                    </button>

                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                        className={`cursor-pointer rounded-md border-2 border-dashed p-8 text-center transition-colors ${
                            file
                                ? 'border-[var(--paper-olive)] bg-[var(--paper-olive)]/10'
                                : 'border-[var(--paper-line)] hover:border-[var(--paper-accent)]'
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {file ? (
                            <div className="flex items-center justify-center gap-3">
                                <FileText className="h-8 w-8 text-[var(--paper-olive)]" aria-hidden="true" />
                                <div className="text-left">
                                    <p className="font-medium text-[var(--paper-ink)]">{file.name}</p>
                                    <p className="text-sm text-[var(--paper-muted)]">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Upload
                                    className="mx-auto mb-3 h-12 w-12 text-[var(--paper-muted)]"
                                    aria-hidden="true"
                                />
                                <p className="font-medium text-[var(--paper-ink)]">
                                    Drop your CSV file here or click to browse
                                </p>
                                <p className="mt-1 space-y-1 text-sm text-[var(--paper-muted)]">
                                    <span className="block">
                                        Required: ticker, etf_name, region, shares
                                        {!allocationOptional && '. Also target_percentage.'}
                                    </span>
                                    {requireJsePrefix ? (
                                        <span className="block text-xs">
                                            Tickers must be JSE symbols with the JSE: prefix (e.g. JSE:STX40).
                                        </span>
                                    ) : (
                                        <span className="block text-xs">
                                            Tickers must be valid Google Finance symbols (e.g. NASDAQ:AAPL).
                                        </span>
                                    )}
                                </p>
                            </>
                        )}
                    </div>

                    {errors.length > 0 && (
                        <div
                            role="alert"
                            className="mt-4 rounded-md border border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/10 p-4"
                        >
                            <div className="mb-2 flex items-center gap-2 font-medium text-[var(--paper-brick)]">
                                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                                Validation Errors
                            </div>
                            <ul className="space-y-1 text-sm text-[var(--paper-brick)]">
                                {errors.map((err, i) => (
                                    <li key={i}>• {err}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {preview.length > 0 && errors.length === 0 && (
                        <div className="mt-4">
                            <h3 className="mb-2 text-sm font-semibold text-[var(--paper-ink)]">
                                Preview (first {preview.length} rows)
                            </h3>
                            <div className="overflow-x-auto rounded-md border border-[var(--paper-line)]">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--paper-line)] bg-[var(--paper-canvas)]">
                                            <th className="px-3 py-2 text-left text-[var(--paper-muted)]">Ticker</th>
                                            <th className="px-3 py-2 text-left text-[var(--paper-muted)]">Name</th>
                                            <th className="px-3 py-2 text-left text-[var(--paper-muted)]">Region</th>
                                            <th className="px-3 py-2 text-right text-[var(--paper-muted)]">Shares</th>
                                            <th className="px-3 py-2 text-right text-[var(--paper-muted)]">
                                                Target %
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className={paperDivider}>
                                        {preview.map((row, i) => (
                                            <tr key={i}>
                                                <td className="px-3 py-2 font-mono text-[var(--paper-ink)]">
                                                    {row.jse_ticker}
                                                </td>
                                                <td className="px-3 py-2 text-[var(--paper-ink)]">{row.etf_name}</td>
                                                <td className="px-3 py-2 text-[var(--paper-muted)]">{row.region}</td>
                                                <td className="px-3 py-2 text-right text-[var(--paper-ink)]">
                                                    {row.shares}
                                                </td>
                                                <td className="px-3 py-2 text-right text-[var(--paper-ink)]">
                                                    {allocationOptional &&
                                                    (!row.target_percentage ||
                                                        String(row.target_percentage).trim() === '')
                                                        ? '—'
                                                        : `${String(row.target_percentage)}%`}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div
                            className={`mt-4 rounded-md border p-4 ${
                                (result.created > 0 || result.updated > 0) && result.failed === 0
                                    ? 'border-[var(--paper-olive)]/30 bg-[var(--paper-olive)]/10'
                                    : result.failed > 0
                                      ? 'border-[var(--paper-accent)]/30 bg-[var(--paper-accent)]/10'
                                      : 'border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/10'
                            }`}
                        >
                            <div className="mb-2 flex items-center gap-2">
                                {result.created > 0 || result.updated > 0 ? (
                                    <CheckCircle className="h-5 w-5 text-[var(--paper-olive)]" aria-hidden="true" />
                                ) : (
                                    <AlertCircle className="h-5 w-5 text-[var(--paper-brick)]" aria-hidden="true" />
                                )}
                                <span className="font-medium text-[var(--paper-ink)]">Import Complete</span>
                            </div>
                            {result.created > 0 && (
                                <p className="text-sm text-[var(--paper-muted)]">
                                    ✓ Created: <strong className="text-[var(--paper-ink)]">{result.created}</strong>{' '}
                                    new holdings
                                </p>
                            )}
                            {result.updated > 0 && (
                                <p className="text-sm text-[var(--paper-muted)]">
                                    ✓ Updated: <strong className="text-[var(--paper-ink)]">{result.updated}</strong>{' '}
                                    existing holdings
                                </p>
                            )}
                            {result.added_to_sheet > 0 && (
                                <p className="text-sm text-[var(--paper-muted)]">
                                    ✓ Added to Google Sheet:{' '}
                                    <strong className="text-[var(--paper-ink)]">{result.added_to_sheet}</strong>{' '}
                                    tickers
                                </p>
                            )}
                            {result.failed > 0 && (
                                <p className="text-sm text-[var(--paper-muted)]">
                                    ⚠ Failed: <strong className="text-[var(--paper-ink)]">{result.failed}</strong> rows
                                </p>
                            )}
                            {result.errors?.length > 0 && (
                                <ul className="mt-2 space-y-1 text-sm text-[var(--paper-brick)]">
                                    {result.errors.map((err, i) => (
                                        <li key={i}>• {err}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <button type="button" onClick={handleClose} className={btnGhost}>
                        {result?.created > 0 || result?.updated > 0 ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <button
                            type="button"
                            onClick={handleUpload}
                            disabled={!file || errors.length > 0 || uploading}
                            className={btnPrimary}
                        >
                            {uploading ? (
                                <>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--paper-card)]/30 border-t-[var(--paper-card)]" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-4 w-4" aria-hidden="true" />
                                    Import
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
        </ModalPortal>
    )
}
