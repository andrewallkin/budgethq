import { useState, useRef } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import axios from 'axios'
import PayslipReviewModal from './PayslipReviewModal'

export default function PayslipUploadModal({ isOpen, onClose, onSuccess, initialMonth, initialYear, isUpdate = false }) {
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

            // Call extract-preview endpoint instead of upload
            const response = await axios.post('/api/payslip/extract-preview', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })

            // Store extracted data and show review modal
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
            // Send confirmed data to backend
            const response = await axios.post('/api/payslip/confirm-upload', {
                ...confirmedData,
                year,
                month,
                temp_file_id: extractedData.temp_file_id,
            })

            // Close review modal and upload modal
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

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 sm:mx-auto max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {isUpdate ? 'Update Payslip' : 'Upload Payslip'}
                    </h2>
                    <button
                        onClick={handleClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        disabled={uploading}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                    {/* Month/Year Selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Month
                            </label>
                            <select
                                value={month}
                                onChange={(e) => setMonth(parseInt(e.target.value))}
                                disabled={uploading}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {monthNames.map((name, idx) => (
                                    <option key={idx + 1} value={idx + 1}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Year
                            </label>
                            <select
                                value={year}
                                onChange={(e) => setYear(parseInt(e.target.value))}
                                disabled={uploading}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {years.map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* File Upload Area */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Payslip PDF
                        </label>
                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                                dragActive
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-300 dark:border-gray-600'
                            } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}`}
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
                                        <FileText className="w-12 h-12 text-blue-500 mb-3" />
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                        {!uploading && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setFile(null)
                                                    setError('')
                                                }}
                                                className="mt-3 text-sm text-red-600 dark:text-red-400 hover:underline"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-12 h-12 text-gray-400 mb-3" />
                                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                            Drop your payslip PDF here or click to browse
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Maximum file size: 10MB
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-red-900 dark:text-red-200">
                                    Error
                                </p>
                                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                    {error}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Info Box */}
                    {!uploading && !extractedData && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-sm text-blue-900 dark:text-blue-200">
                                <strong>How it works:</strong> Upload your PDF payslip and our AI will automatically extract:
                            </p>
                            <ul className="mt-2 space-y-1 text-sm text-blue-800 dark:text-blue-300 list-disc list-inside">
                                <li>Job title and company name</li>
                                <li>Gross salary and net pay</li>
                                <li>PAYE and UIF deductions</li>
                                <li>Company contributions and personal deductions</li>
                                <li>Additional income (bonuses, claims)</li>
                            </ul>
                            <p className="mt-2 text-sm text-blue-900 dark:text-blue-200">
                                You'll be able to review and edit the extracted data before saving.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={handleClose}
                        disabled={uploading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <Loader className="w-4 h-4 animate-spin" />
                                Extracting Data...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Extract & Review
                            </>
                        )}
                    </button>
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
        </div>
    )
}
