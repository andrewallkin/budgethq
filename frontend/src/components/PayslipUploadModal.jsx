import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, FileText, AlertCircle, Loader, KeyRound } from 'lucide-react'
import axios from 'axios'
import PayslipReviewModal from './PayslipReviewModal'

const btnBase = 'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput = 'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

export default function PayslipUploadModal({ isOpen, onClose, onSuccess, initialMonth, initialYear, isUpdate = false, hasOpenAIKey = true }) {
    const [file, setFile] = useState(null)
    const [month, setMonth] = useState(initialMonth || new Date().getMonth() + 1)
    const [year, setYear] = useState(initialYear || new Date().getFullYear())
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)
    const [extractedData, setExtractedData] = useState(null)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const fileInputRef = useRef(null)
    const [dragActive, setDragActive] = useState(false)

    const resetState = () => {
        setFile(null)
        setError('')
        setExtractedData(null)
        setShowReviewModal(false)
    }

    const handleClose = () => {
        if (!uploading) {
            resetState()
            onClose()
        }
    }

    const handleDrag = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true)
        } else if (e.type === "dragleave") {
            setDragActive(false)
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0])
        }
    }

    const handleFileInputChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0])
        }
    }

    const handleFileSelect = (selectedFile) => {
        setError('')
        setExtractedData(null)

        if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
            setError('Please select a PDF file')
            return
        }

        if (selectedFile.size > 10 * 1024 * 1024) {
            setError('File size must be less than 10MB')
            return
        }

        setFile(selectedFile)
    }

    const handleUpload = async () => {
        if (!file) {
            setError('Please select a file')
            return
        }

        if (month < 1 || month > 12) {
            setError('Please select a valid month')
            return
        }

        setUploading(true)
        setError('')

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('year', year.toString())
            formData.append('month', month.toString())

            const response = await axios.post('/api/payslip/extract-preview', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })

            setExtractedData(response.data)
            setShowReviewModal(true)

        } catch (err) {
            console.error('Extraction error:', err)
            const errorMsg = err.response?.data?.detail || 'Failed to extract payslip data'
            setError(errorMsg)
        } finally {
            setUploading(false)
        }
    }

    const handleConfirmReview = async (confirmedData) => {
        try {
            const response = await axios.post('/api/payslip/confirm-upload', {
                ...confirmedData,
                year,
                month,
                temp_file_id: extractedData.temp_file_id,
            })

            setShowReviewModal(false)
            
            if (onSuccess) {
                onSuccess(response.data)
            }
            
            handleClose()
        } catch (err) {
            console.error('Save error:', err)
            console.error('Error response:', err.response?.data)
            const errorMsg = err.response?.data?.detail || 'Failed to save payslip'
            setError(errorMsg)
            setShowReviewModal(false)
        }
    }

    if (!isOpen) return null

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ]

    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="payslip-upload-title"
                className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <h2 id="payslip-upload-title" className="text-lg font-semibold text-[var(--paper-ink)]">
                        {isUpdate ? 'Update Payslip' : 'Upload Payslip'}
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={uploading}
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[calc(90vh-140px)] space-y-6 overflow-y-auto p-5 text-[var(--paper-ink)] sm:p-6">
                    {/* Month/Year Selection */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm text-[var(--paper-ink)]">
                                Month
                            </label>
                            <select
                                value={month}
                                onChange={(e) => setMonth(parseInt(e.target.value))}
                                disabled={uploading}
                                className={fieldInput}
                            >
                                {monthNames.map((name, idx) => (
                                    <option key={idx + 1} value={idx + 1}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm text-[var(--paper-ink)]">
                                Year
                            </label>
                            <select
                                value={year}
                                onChange={(e) => setYear(parseInt(e.target.value))}
                                disabled={uploading}
                                className={fieldInput}
                            >
                                {years.map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {!hasOpenAIKey ? (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="rounded-full border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                                <KeyRound className="h-10 w-10 text-[var(--paper-muted)]" aria-hidden="true" />
                            </div>
                            <div>
                                <h3 className="mb-1 text-base font-semibold text-[var(--paper-ink)]">
                                    OpenAI API Key Required
                                </h3>
                                <p className="max-w-sm text-sm text-[var(--paper-muted)]">
                                    Automatic payslip extraction uses the <strong className="font-medium text-[var(--paper-ink)]">OpenAI API</strong> to read and interpret your payslip PDF. You need to add your OpenAI API key before you can use this feature.
                                </p>
                            </div>
                            <a href="/settings" className={btnPrimary}>
                                Go to Settings
                            </a>
                            <p className="text-xs text-[var(--paper-muted)]">
                                You can get an API key at{' '}
                                <a
                                    href="https://platform.openai.com/api-keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--paper-ink)] underline decoration-[var(--paper-line)] underline-offset-2 hover:decoration-[var(--paper-ink)]"
                                >
                                    platform.openai.com/api-keys
                                </a>
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* File Upload Area */}
                            <div>
                                <label className="mb-2 block text-sm text-[var(--paper-ink)]">
                                    Payslip PDF
                                </label>
                                <div
                                    className={`rounded-md border-2 border-dashed p-8 text-center transition-colors ${
                                        dragActive
                                            ? 'border-[var(--paper-accent)] bg-[var(--paper-canvas)]'
                                            : 'border-[var(--paper-line)]'
                                    } ${uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-[var(--paper-accent)]'}`}
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={() => !uploading && fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf"
                                        onChange={handleFileInputChange}
                                        className="hidden"
                                        disabled={uploading}
                                    />

                                    <div className="flex flex-col items-center">
                                        {file ? (
                                            <>
                                                <FileText className="mb-3 h-12 w-12 text-[var(--paper-ink)]" aria-hidden="true" />
                                                <p className="text-sm font-medium text-[var(--paper-ink)]">
                                                    {file.name}
                                                </p>
                                                <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                                    {(file.size / 1024).toFixed(1)} KB
                                                </p>
                                                {!uploading && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setFile(null)
                                                            setError('')
                                                        }}
                                                        className="mt-3 text-sm text-[var(--paper-brick)] hover:underline"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="mb-3 h-12 w-12 text-[var(--paper-muted)]" aria-hidden="true" />
                                                <p className="mb-1 text-sm font-medium text-[var(--paper-ink)]">
                                                    Drop your payslip PDF here or click to browse
                                                </p>
                                                <p className="text-xs text-[var(--paper-muted)]">
                                                    Maximum file size: 10MB
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-3 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4"
                                >
                                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--paper-brick)]" aria-hidden="true" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-[var(--paper-brick)]">
                                            Error
                                        </p>
                                        <p className="mt-1 text-sm text-[var(--paper-brick)]">
                                            {error}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Info Box */}
                            {!uploading && !extractedData && (
                                <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                                    <p className="text-sm text-[var(--paper-ink)]">
                                        <strong className="font-medium">How it works:</strong>{' '}
                                        <span className="text-[var(--paper-muted)]">Upload your PDF payslip and our AI will automatically extract:</span>
                                    </p>
                                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--paper-muted)]">
                                        <li>Job title and company name</li>
                                        <li>Gross salary and net pay</li>
                                        <li>PAYE and UIF deductions</li>
                                        <li>Company contributions and personal deductions</li>
                                        <li>Additional income (bonuses, claims)</li>
                                    </ul>
                                    <p className="mt-2 text-sm text-[var(--paper-muted)]">
                                        You'll be able to review and edit the extracted data before saving.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-[var(--paper-line)] bg-[var(--paper-card)] px-5 py-4 sm:px-6">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={uploading}
                        className={btnGhost}
                    >
                        {hasOpenAIKey ? 'Cancel' : 'Close'}
                    </button>
                    {hasOpenAIKey && (
                        <button
                            type="button"
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className={btnPrimary}
                        >
                            {uploading ? (
                                <>
                                    <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Extracting Data...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-4 w-4" aria-hidden="true" />
                                    Extract & Review
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Review Modal */}
            <PayslipReviewModal
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                onConfirm={handleConfirmReview}
                extractedData={extractedData}
                monthYear={`${monthNames[month - 1]} ${year}`}
            />
        </div>,
        document.body
    )
}
