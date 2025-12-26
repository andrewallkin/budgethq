import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { LayoutDashboard, PieChart, Home, Moon, Sun, LogOut, Settings as SettingsIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import BudgetDashboard from './pages/BudgetDashboard'
import TFSAPortfolio from './pages/TFSAPortfolio'
import Login from './pages/Login'
import Register from './pages/Register'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
    const { user } = useAuth()

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return children
}

function AppContent() {
    const location = useLocation()
    const { user, logout } = useAuth()
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode')
        return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches
    })
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebarCollapsed')
        return saved ? JSON.parse(saved) : false
    })

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

    const navItems = [
        { path: '/', label: 'Home', icon: Home },
        { path: '/budget', label: 'Budget Dashboard', icon: LayoutDashboard },
        { path: '/portfolio', label: 'TFSA Portfolio', icon: PieChart },
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

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            {/* Sidebar */}
            <div className={`${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden`}>
                <div className={`p-6 flex ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} items-center`}>
                    {!isSidebarCollapsed && (
                        <h1 className="text-xl font-bold text-gray-800 dark:text-white">💰 FinDash</h1>
                    )}
                    <div className={`flex items-center gap-2 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title={darkMode ? 'Light mode' : 'Dark mode'}
                        >
                            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
                <nav className={`flex-1 ${isSidebarCollapsed ? 'px-2' : 'px-4'} space-y-2`}>
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = location.pathname === item.path
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                title={isSidebarCollapsed ? item.label : ''}
                            >
                                <Icon className={`w-5 h-5 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
                                {!isSidebarCollapsed && (
                                    <span className="font-medium">{item.label}</span>
                                )}
                            </Link>
                        )
                    })}
                </nav>

                {/* User info and logout */}
                {user && (
                    <div className={`p-4 border-t border-gray-200 dark:border-gray-700 ${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
                        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                            {!isSidebarCollapsed && (
                                <div className="text-sm">
                                    <p className="font-medium text-gray-900 dark:text-white">{user.username}</p>
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
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-8">
                    <Routes>
                        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                        <Route path="/budget" element={<ProtectedRoute><BudgetDashboard /></ProtectedRoute>} />
                        <Route path="/portfolio" element={<ProtectedRoute><TFSAPortfolio /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                    </Routes>
                </div>
            </div>
        </div>
    )
}

function HomePage() {
    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Welcome to Your Financial Dashboard</h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                    Take control of your finances with powerful budgeting and portfolio management tools.
                </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Budget Dashboard Card */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-8">
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

                        <div className="space-y-3 mb-6">
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
                            className="block w-full text-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Open Budget Dashboard →
                        </Link>
                    </div>
                </div>

                {/* TFSA Portfolio Card */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-2xl shadow-lg border border-green-200 dark:border-green-800 overflow-hidden hover:shadow-xl transition-all">
                    <div className="p-8">
                        <div className="flex items-center mb-6">
                            <div className="p-4 bg-green-600 rounded-xl">
                                <PieChart className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white ml-4">TFSA Portfolio</h2>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 mb-6 text-base leading-relaxed">
                            Complete TFSA portfolio management with ETFs and government bonds. Live price tracking, 
                            transaction history, intelligent rebalancing, and powerful tools to optimize your tax-free investments.
                        </p>

                        <div className="space-y-3 mb-6">
                            <div className="flex items-start">
                                <span className="text-green-600 dark:text-green-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">ETFs & Government Bonds</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Track both ETFs with live prices and manually-managed government bonds</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-green-600 dark:text-green-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Live Price Sync & Transaction History</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Google Sheets integration for ETF prices, full buy/sell transaction tracking</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-green-600 dark:text-green-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">Smart Rebalancing & Analytics</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Automated rebalancing plans, target allocation tracking, profit/loss analysis</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <span className="text-green-600 dark:text-green-400 mr-3 mt-1">✓</span>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">CSV Import & Sortable Views</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Bulk import holdings, sort by any column, edit targets with one click</p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/portfolio"
                            className="block w-full text-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Open TFSA Portfolio →
                        </Link>
                    </div>
                </div>
            </div>

            {/* Additional Info Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Getting Started</h3>
                <div className="grid md:grid-cols-3 gap-6">
                    <div>
                        <div className="flex items-center mb-2">
                            <span className="text-2xl mr-2">🎯</span>
                            <h4 className="font-semibold text-gray-900 dark:text-white">Set Your Goals</h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Start by entering your monthly salary and defining your budget categories. The system will automatically calculate your taxes.
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center mb-2">
                            <span className="text-2xl mr-2">📊</span>
                            <h4 className="font-semibold text-gray-900 dark:text-white">Track Progress</h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Monitor your spending and investments with real-time visualizations. See how your allocations compare to your targets.
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center mb-2">
                            <span className="text-2xl mr-2">💡</span>
                            <h4 className="font-semibold text-gray-900 dark:text-white">Make Decisions</h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Use the insights to make informed financial decisions. Adjust your budget or rebalance your portfolio with confidence.
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
