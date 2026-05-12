import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { LayoutDashboard, PieChart, Home, Moon, Sun, LogOut, Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown, Calculator, Shield, TrendingUp, Menu, CreditCard, Receipt, Tag, HelpCircle, Building2, Landmark } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import BudgetDashboard from './pages/BudgetDashboard'
import RATaxCalculator from './pages/RATaxCalculator'
import RAPerformance from './pages/RAPerformance'
import EmergencySavings from './pages/EmergencySavings'
import Login from './pages/Login'
import Register from './pages/Register'
import Settings from './pages/Settings'
import SalaryPage from './pages/SalaryPage'
import AccountsDashboard from './pages/AccountsDashboard'
import BankTransactions from './pages/BankTransactions'
import CategorizationRules from './pages/CategorizationRules'
import BudgetAnalysis from './pages/BudgetAnalysis'
import CategoryGuide from './pages/CategoryGuide'
import InvestmentsLanding from './pages/InvestmentsLanding'
import InvestmentPortfolioPage from './pages/InvestmentPortfolioPage'
import InvestecLanding from './pages/InvestecLanding'

function ProtectedRoute({ children }) {
    const { user } = useAuth()

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return children
}

function AppContent() {
    const location = useLocation()
    const { user, logout, showInvestecNav } = useAuth()
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode')
        return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches
    })
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebarCollapsed')
        return saved ? JSON.parse(saved) : false
    })
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [investecExpanded, setInvestecExpanded] = useState(() => {
        const saved = localStorage.getItem('investecNavExpanded')
        if (saved !== null) return JSON.parse(saved)
        return location.pathname.startsWith('/investec')
    })

    // Close mobile menu when route changes
    useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [location.pathname])

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
        localStorage.setItem('darkMode', JSON.stringify(darkMode))
    }, [darkMode])

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed))
    }, [isSidebarCollapsed])

    useEffect(() => {
        localStorage.setItem('investecNavExpanded', JSON.stringify(investecExpanded))
    }, [investecExpanded])

    // Auto-expand Investec group when navigating to an Investec page
    useEffect(() => {
        if (location.pathname.startsWith('/investec') && !investecExpanded) {
            setInvestecExpanded(true)
        }
    }, [location.pathname, investecExpanded])

    const navItems = [
        { path: '/', label: 'Home', icon: Home },
        { path: '/salary', label: 'Payslip & Tax', icon: Calculator },
        { path: '/budget', label: 'Budget Dashboard', icon: LayoutDashboard },
        { path: '/investments', label: 'Investments', icon: PieChart },
        { path: '/emergency-savings', label: 'Emergency Savings', icon: Shield },
        { path: '/ra', label: 'RA Performance', icon: TrendingUp },
        { path: '/ra-calculator', label: 'RA Tax Calculator', icon: Calculator },
        {
            label: 'Investec Banking',
            icon: Building2,
            children: [
                { path: '/investec', label: 'Overview', icon: Landmark },
                { path: '/investec/accounts', label: 'Bank Accounts', icon: CreditCard },
                { path: '/investec/transactions', label: 'Transactions', icon: Receipt },
                { path: '/investec/budget-analysis', label: 'Budget Analysis', icon: TrendingUp },
                { path: '/investec/rules', label: 'Categorization Rules', icon: Tag },
            ],
        },
        { path: '/category-guide', label: 'Budget Category Guide', icon: HelpCircle },
        { path: '/settings', label: 'Settings', icon: SettingsIcon },
    ]

    // Don't show sidebar on login/register pages
    if (location.pathname === '/login' || location.pathname === '/register') {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
            </Routes>
        )
    }

    const SidebarContent = ({ collapsed, isMobile }) => (
        <>
            <div className={`p-6 flex ${collapsed && !isMobile ? 'justify-center' : 'justify-between'} items-center`}>
                {(!collapsed || isMobile) && (
                    <h1 className="text-xl font-bold text-gray-800 dark:text-white">📊 BudgetHQ</h1>
                )}
                {!isMobile && (
                    <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
                        <button
                            onClick={() => setIsSidebarCollapsed(!collapsed)}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title={darkMode ? 'Light mode' : 'Dark mode'}
                        >
                            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                )}
            </div>
            <nav className={`flex-1 ${collapsed && !isMobile ? 'px-2' : 'px-4'} space-y-2`}>
                {navItems.map((item) => {
                    if (item.children) {
                        if (!showInvestecNav) return null
                        const GroupIcon = item.icon
                        const isInvestecActive = location.pathname.startsWith('/investec')
                        const showExpanded = investecExpanded && (!collapsed || isMobile)

                        if (collapsed && !isMobile) {
                            return (
                                <Link
                                    key={item.label}
                                    to="/investec"
                                    className={`flex items-center justify-center px-2 py-3 rounded-lg transition-colors ${isInvestecActive
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                    title={item.label}
                                >
                                    <GroupIcon className="w-5 h-5" />
                                </Link>
                            )
                        }

                        return (
                            <div key={item.label}>
                                <button
                                    type="button"
                                    onClick={() => setInvestecExpanded(!investecExpanded)}
                                    className={`flex items-center w-full px-4 py-3 rounded-lg transition-colors ${isInvestecActive
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    <GroupIcon className="w-5 h-5 mr-3" />
                                    <span className="font-medium flex-1 text-left">{item.label}</span>
                                    {showExpanded ? (
                                        <ChevronDown className="w-4 h-4 shrink-0" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 shrink-0" />
                                    )}
                                </button>
                                {showExpanded && (
                                    <div className="mt-1 ml-2 pl-4 border-l border-gray-200 dark:border-gray-600 space-y-1">
                                        {item.children.map((child) => {
                                            const ChildIcon = child.icon
                                            const isChildActive = location.pathname === child.path
                                            return (
                                                <Link
                                                    key={child.path}
                                                    to={child.path}
                                                    className={`flex items-center px-3 py-2 rounded-lg transition-colors text-sm ${isChildActive
                                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                        }`}
                                                >
                                                    <ChildIcon className="w-4 h-4 mr-2" />
                                                    <span className="font-medium">{child.label}</span>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    }

                    const Icon = item.icon
                    const isActive = item.path === '/investments'
                        ? location.pathname.startsWith('/investments') || location.pathname === '/portfolio'
                        : location.pathname === item.path
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center ${collapsed && !isMobile ? 'justify-center px-2' : 'px-4'} py-3 rounded-lg transition-colors ${isActive
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            title={collapsed && !isMobile ? item.label : ''}
                        >
                            <Icon className={`w-5 h-5 ${collapsed && !isMobile ? '' : 'mr-3'}`} />
                            {(!collapsed || isMobile) && (
                                <span className="font-medium">{item.label}</span>
                            )}
                        </Link>
                    )
                })}
            </nav>
            {user && (
                <div className={`p-4 border-t border-gray-200 dark:border-gray-700 ${collapsed && !isMobile ? 'flex justify-center' : ''}`}>
                    <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center' : 'justify-between'}`}>
                        {(!collapsed || isMobile) && (
                            <div className="text-sm">
                                <p className="font-medium text-gray-900 dark:text-white truncate">{user.username}</p>
                            </div>
                        )}
                        <button
                            onClick={logout}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </>
    )

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            {/* Mobile header bar */}
            <header className="lg:hidden fixed top-0 left-0 right-0 h-14 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-5 sm:px-6">
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors flex items-center justify-center"
                    title="Open menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <h1 className="text-lg font-bold text-gray-800 dark:text-white">📊 BudgetHQ</h1>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors flex items-center justify-center"
                        title={darkMode ? 'Light mode' : 'Dark mode'}
                    >
                        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={logout}
                        className="p-2 min-w-[44px] min-h-[44px] rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors flex items-center justify-center"
                        title="Logout"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Mobile drawer backdrop */}
            {isMobileMenuOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Mobile drawer */}
            <aside
                className={`lg:hidden fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
                    isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <SidebarContent collapsed={false} isMobile />
            </aside>

            {/* Desktop sidebar */}
            <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col transition-all duration-300 ease-in-out overflow-hidden shrink-0`}>
                <SidebarContent collapsed={isSidebarCollapsed} isMobile={false} />
            </aside>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto pt-14 lg:pt-0">
                <div className="p-4 sm:p-6 lg:p-8">
                    <Routes>
                        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                        <Route path="/budget" element={<ProtectedRoute><BudgetDashboard /></ProtectedRoute>} />
                        <Route path="/salary" element={<ProtectedRoute><SalaryPage /></ProtectedRoute>} />
                        <Route path="/investments" element={<ProtectedRoute><InvestmentsLanding /></ProtectedRoute>} />
                        <Route path="/investments/:portfolioSlug" element={<ProtectedRoute><InvestmentPortfolioPage /></ProtectedRoute>} />
                        <Route path="/portfolio" element={<Navigate to="/investments/tfsa" replace />} />
                        <Route path="/emergency-savings" element={<ProtectedRoute><EmergencySavings /></ProtectedRoute>} />
                        <Route path="/ra" element={<ProtectedRoute><RAPerformance /></ProtectedRoute>} />
                        <Route path="/ra-calculator" element={<ProtectedRoute><RATaxCalculator /></ProtectedRoute>} />
                        <Route path="/investec" element={<ProtectedRoute><InvestecLanding /></ProtectedRoute>} />
                        <Route path="/investec/accounts" element={<ProtectedRoute><AccountsDashboard /></ProtectedRoute>} />
                        <Route path="/investec/transactions" element={<ProtectedRoute><BankTransactions /></ProtectedRoute>} />
                        <Route path="/investec/rules" element={<ProtectedRoute><CategorizationRules /></ProtectedRoute>} />
                        <Route path="/investec/budget-analysis" element={<ProtectedRoute><BudgetAnalysis /></ProtectedRoute>} />
                        <Route path="/category-guide" element={<ProtectedRoute><CategoryGuide /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                    </Routes>
                </div>
            </div>
        </div>
    )
}

function HomePage() {
    return (
        <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3">Welcome to BudgetHQ – Your Financial Dashboard</h1>
                <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
                    Take control of your finances with powerful budgeting and portfolio management tools.
                </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
                {/* Salary Page Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/20 rounded-2xl shadow-lg border border-rose-200 dark:border-rose-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-rose-600 rounded-xl">
                                <Calculator className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">Payslip & Tax</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Complete salary management with detailed payslip tracking. Account for earnings, deductions,
                            and fringe benefits to ensure accurate tax calculations and budgeting.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-rose-600 dark:text-rose-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Fringe Benefit Tracking</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Include non-cash benefits in your taxable income calculations</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-rose-600 dark:text-rose-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Accurate Tax Calculations</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">SARS-compliant PAYE based on your complete compensation package</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-rose-600 dark:text-rose-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Net Income Focus</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Budget based on actual take-home pay after all deductions</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-rose-600 dark:text-rose-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Flexible Deduction Management</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Add any custom deductions or contributions as needed</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/salary"
                            className="mt-auto block w-full text-center px-6 py-3 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 transition-colors"
                        >
                            Open Payslip & Tax →
                        </Link>
                    </div>
                </div>

                {/* Budget Dashboard Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-blue-600 rounded-xl">
                                <LayoutDashboard className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">Budget Dashboard</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Track your monthly income and expenses with an intelligent budgeting system. Categorize your spending into
                            Needs, Wants, and Savings to maintain a healthy financial balance.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-blue-600 dark:text-blue-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Automatic Tax Calculations</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">SARS-compliant PAYE and UIF deductions based on your salary and age</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-blue-600 dark:text-blue-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Visual Budget Breakdown</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Interactive pie charts showing your spending distribution</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-blue-600 dark:text-blue-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Dynamic Category Management</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Add, edit, and organize unlimited expense categories</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-blue-600 dark:text-blue-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Auto-Save</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Changes are automatically saved as you work</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/budget"
                            className="mt-auto block w-full text-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Open Budget Dashboard →
                        </Link>
                    </div>
                </div>

                {/* Investments Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-2xl shadow-lg border border-emerald-200 dark:border-emerald-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-emerald-600 rounded-xl">
                                <PieChart className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">Investments</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Manage all investment portfolios from one place. Keep your TFSA structure intact and add
                            new portfolios like USD Account with identical ETF workflows.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-emerald-600 dark:text-emerald-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Multi-Portfolio ETFs</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Track ETFs with live prices and portfolio-level organization</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-emerald-600 dark:text-emerald-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Live Price Sync & Transaction History</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Google Sheets integration for ETF prices, full buy/sell transaction tracking</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-emerald-600 dark:text-emerald-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Smart Rebalancing & Analytics</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Automated rebalancing plans, target allocation tracking, profit/loss analysis</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-emerald-600 dark:text-emerald-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">CSV Import & Sortable Views</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Bulk import holdings, sort by any column, edit targets with one click</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/investments"
                            className="mt-auto block w-full text-center px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                            Open Investments →
                        </Link>
                    </div>
                </div>

                {/* Emergency Savings Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-2xl shadow-lg border border-amber-200 dark:border-amber-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-amber-600 rounded-xl">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">Emergency Savings</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Build a robust financial safety net with an intelligent emergency fund calculator.
                            Define your goals based on your actual monthly expenses and track your progress.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-amber-600 dark:text-amber-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Contextual Target Setting</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Set goals for 3, 6, 9, or 12 months of survival expenses</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-amber-600 dark:text-amber-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Auto-Synced from Budget</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Uses your \"Needs\" total from the budget dashboard automatically</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-amber-600 dark:text-amber-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Progress Tracking</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Visual indicators of how close you are to your financial safety goal</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-amber-600 dark:text-amber-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Milestone Planning</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Calculate how long it will take to reach your target with monthly deposits</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/emergency-savings"
                            className="mt-auto block w-full text-center px-6 py-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition-colors"
                        >
                            Open Emergency Savings →
                        </Link>
                    </div>
                </div>

                {/* RA Performance Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-2xl shadow-lg border border-indigo-200 dark:border-indigo-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-indigo-600 rounded-xl">
                                <TrendingUp className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">RA Performance</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Track your retirement annuity value and contributions month by month, with clear performance and growth insights.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-indigo-600 dark:text-indigo-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Monthly Value Snapshots</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Capture your RA value once per month to see its trajectory over time</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-indigo-600 dark:text-indigo-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Contribution Tracking</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">See total and financial-year contributions alongside portfolio growth</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-indigo-600 dark:text-indigo-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Performance Chart</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Visualize value and cumulative contributions on a single time-series chart</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/ra"
                            className="mt-auto block w-full text-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Open RA Performance →
                        </Link>
                    </div>
                </div>

                {/* RA Tax Calculator Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-2xl shadow-lg border border-purple-200 dark:border-purple-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-purple-600 rounded-xl">
                                <Calculator className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">RA Tax Calculator</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Optimize your retirement contributions to maximize tax benefits. See real-time
                            impact on your SARS tax refund and project long-term portfolio growth.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-purple-600 dark:text-purple-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Tax Refund Maximizer</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Real-time SARS-compliant calculation of potential tax savings</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-purple-600 dark:text-purple-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Scenario Comparison</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Compare no contribution vs current vs max tax-deductible contribution</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-purple-600 dark:text-purple-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Long-term Projections</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Interactive growth charts projecting your RA value up to year 2060</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-purple-600 dark:text-purple-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Smart Deduction Tracking</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Stay within the 27.5% annual limit for optimal tax efficiency</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/ra-calculator"
                            className="mt-auto block w-full text-center px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Open RA Tax Calculator →
                        </Link>
                    </div>
                </div>

                {/* Investec Banking Card */}
                <div className="flex flex-col h-full bg-gradient-to-br from-teal-50 to-slate-100 dark:from-teal-900/20 dark:to-slate-800/20 rounded-2xl shadow-lg border border-teal-200 dark:border-teal-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
                        <div className="flex items-center mb-4">
                            <div className="p-4 bg-teal-600 rounded-xl">
                                <Building2 className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">Investec Banking</h2>
                        </div>

                        <p className="text-amber-700 dark:text-amber-400 font-medium mb-4 text-sm">
                            This integration is only available if you bank with Investec.
                        </p>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Connect your Investec accounts to sync balances, view transactions, and compare your actual spending against your budget.
                        </p>

                        <div className="space-y-3 mb-8">
                            <div className="flex items-start">
                                <span className="text-teal-600 dark:text-teal-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Bank Account Sync</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">View and sync your Investec account balances in one place</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-teal-600 dark:text-teal-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Transaction History & Categorization</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Auto-categorize transactions with custom rules</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-teal-600 dark:text-teal-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Budget vs Actual Analysis</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Compare your budgeted spending against real transactions</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-teal-600 dark:text-teal-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Emergency Fund Sync</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Link an Investec account to auto-sync your emergency savings balance</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/investec"
                            className="mt-auto block w-full text-center px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors"
                        >
                            Open Investec Banking →
                        </Link>
                        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                            Connect your account in Settings to get started.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    )
}

export default App
