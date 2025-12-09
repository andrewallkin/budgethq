import { useState, useRef } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react'
import axios from 'axios'

const REQUIRED_COLUMNS = ['jse_ticker', 'etf_name', 'region', 'shares', 'target_percentage']

export default function CSVUploadModal({ isOpen, onClose, onSuccess }) {
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

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        const rows = []

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim())
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

        // Check required columns
        const missingCols = REQUIRED_COLUMNS.filter(col => !headers.includes(col))
        if (missingCols.length > 0) {
            validationErrors.push(`Missing required columns: ${missingCols.join(', ')}`)
        }

        // Validate each row
        rows.forEach((row, idx) => {
            const rowNum = idx + 2 // Account for header row and 0-index

            if (!row.jse_ticker || !row.jse_ticker.startsWith('JSE:')) {
                validationErrors.push(`Row ${rowNum}: Invalid ticker format. Must start with "JSE:" (e.g., JSE:STX40)`)
            }

            if (!row.etf_name) {
                validationErrors.push(`Row ${rowNum}: ETF name is required`)
            }

            // Allow empty shares (for ETFs you plan to buy) or 0+
            const sharesStr = row.shares?.trim()
            if (sharesStr && sharesStr !== '') {
                const shares = parseFloat(sharesStr)
                if (isNaN(shares) || shares < 0) {
                    validationErrors.push(`Row ${rowNum}: Shares must be a non-negative number or blank`)
                }
            }

            const targetPct = parseFloat(row.target_percentage)
            if (isNaN(targetPct) || targetPct < 0 || targetPct > 100) {
                validationErrors.push(`Row ${rowNum}: Target percentage must be between 0 and 100`)
            }
        })

        // Check if target percentages sum to ~100%
        const totalTarget = rows.reduce((sum, row) => sum + (parseFloat(row.target_percentage) || 0), 0)
        if (Math.abs(totalTarget - 100) > 0.5) {
            validationErrors.push(`Warning: Target percentages sum to ${totalTarget.toFixed(1)}% (should be 100%)`)
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
            setErrors(validationErrors.filter(e => !e.startsWith('Warning:')))
            
            // Show preview (first 5 rows)
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
                headers: { 'Content-Type': 'multipart/form-data' }
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
                errors: [err.response?.data?.detail || 'Upload failed']
            })
        } finally {
            setUploading(false)
        }
    }

    const downloadTemplate = () => {
        const template = `jse_ticker,etf_name,region,shares,target_percentage
JSE:STX40,Satrix Top 40,South Africa,10.5,40
JSE:STXNDQ,Satrix Nasdaq 100,USA,5.25,30
JSE:SYGWD,Sygnia Itrix MSCI World,Global,8.0,30`

        const blob = new Blob([template], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'etf_holdings_template.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Import ETF Holdings
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Upload a CSV to create new holdings or update existing ones
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {/* Template Download */}
                    <button
                        onClick={downloadTemplate}
                        className="mb-4 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        <Download className="w-4 h-4" />
                        Download CSV template
                    </button>

                    {/* Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                            file
                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'
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
                                <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                                <div className="text-left">
                                    <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Upload className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
                                <p className="text-gray-600 dark:text-gray-300 font-medium">
                                    Drop your CSV file here or click to browse
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Required: jse_ticker, etf_name, region, shares, target_percentage
                                </p>
                            </>
                        )}
                    </div>

                    {/* Validation Errors */}
                    {errors.length > 0 && (
                        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-2">
                                <AlertCircle className="w-5 h-5" />
                                Validation Errors
                            </div>
                            <ul className="text-sm text-red-600 dark:text-red-300 space-y-1">
                                {errors.map((err, i) => (
                                    <li key={i}>• {err}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Preview Table */}
                    {preview.length > 0 && errors.length === 0 && (
                        <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Preview (first {preview.length} rows)
                            </h3>
                            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300">Ticker</th>
                                            <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300">Name</th>
                                            <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300">Region</th>
                                            <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">Shares</th>
                                            <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">Target %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {preview.map((row, i) => (
                                            <tr key={i} className="bg-white dark:bg-gray-800">
                                                <td className="px-3 py-2 font-mono text-gray-900 dark:text-white">
                                                    {row.jse_ticker}
                                                </td>
                                                <td className="px-3 py-2 text-gray-900 dark:text-white">
                                                    {row.etf_name}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                                                    {row.region}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                                                    {row.shares}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                                                    {row.target_percentage}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Upload Result */}
                    {result && (
                        <div className={`mt-4 p-4 rounded-lg ${
                            (result.created > 0 || result.updated > 0) && result.failed === 0
                                ? 'bg-green-50 dark:bg-green-900/20'
                                : result.failed > 0
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                    : 'bg-red-50 dark:bg-red-900/20'
                        }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {(result.created > 0 || result.updated > 0) ? (
                                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                )}
                                <span className="font-medium text-gray-900 dark:text-white">
                                    Import Complete
                                </span>
                            </div>
                            {result.created > 0 && (
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    ✓ Created: <strong>{result.created}</strong> new holdings
                                </p>
                            )}
                            {result.updated > 0 && (
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    ✓ Updated: <strong>{result.updated}</strong> existing holdings
                                </p>
                            )}
                            {result.added_to_sheet > 0 && (
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    ✓ Added to Google Sheet: <strong>{result.added_to_sheet}</strong> ETFs
                                </p>
                            )}
                            {result.failed > 0 && (
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    ⚠ Failed: <strong>{result.failed}</strong> rows
                                </p>
                            )}
                            {result.errors?.length > 0 && (
                                <ul className="mt-2 text-sm text-red-600 dark:text-red-300 space-y-1">
                                    {result.errors.map((err, i) => (
                                        <li key={i}>• {err}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        {result?.created > 0 || result?.updated > 0 ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <button
                            onClick={handleUpload}
                            disabled={!file || errors.length > 0 || uploading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {uploading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Import Holdings
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

