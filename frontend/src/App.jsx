import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, PieChart, Home, Moon, Sun } from 'lucide-react'
import BudgetDashboard from './pages/BudgetDashboard'
import TFSAPortfolio from './pages/TFSAPortfolio'

function App() {
    const location = useLocation()
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode')
        return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches
    })

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
        localStorage.setItem('darkMode', JSON.stringify(darkMode))
    }, [darkMode])

    const navItems = [
        { path: '/', label: 'Home', icon: Home },
        { path: '/budget', label: 'Budget Dashboard', icon: LayoutDashboard },
        { path: '/portfolio', label: 'TFSA Portfolio', icon: PieChart },
    ]

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            {/* Sidebar */}
            <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-colors duration-200">
                <div className="p-6 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-800 dark:text-white">💰 FinDash</h1>
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                    >
                        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                </div>
                <nav className="flex-1 px-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = location.pathname === item.path
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <Icon className="w-5 h-5 mr-3" />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <div className="p-8 max-w-7xl mx-auto">
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/budget" element={<BudgetDashboard />} />
                        <Route path="/portfolio" element={<TFSAPortfolio />} />
                    </Routes>
                </div>
            </div>
        </div>
    )
}

function HomePage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome! 👋</h1>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                    This Financial Dashboard helps you manage both your budget and investment portfolio in one place.
                </p>

                <div className="grid md:grid-cols-2 gap-6 mt-8">
                    <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl transition-colors">
                        <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-300 mb-2">💰 Budget Dashboard</h3>
                        <p className="text-blue-800 dark:text-blue-200 mb-4">
                            Track and manage your monthly expenses using the 50/30/20 budgeting rule.
                        </p>
                        <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 space-y-1 text-sm">
                            <li>Automatic SARS tax calculations</li>
                            <li>Visual budget breakdown</li>
                            <li>Dynamic category management</li>
                        </ul>
                    </div>

                    <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-xl transition-colors">
                        <h3 className="text-xl font-semibold text-green-900 dark:text-green-300 mb-2">📈 TFSA Portfolio</h3>
                        <p className="text-green-800 dark:text-green-200 mb-4">
                            Manage and rebalance your Tax-Free Savings Account investments.
                        </p>
                        <ul className="list-disc list-inside text-green-700 dark:text-green-300 space-y-1 text-sm">
                            <li>Portfolio rebalancing calculator</li>
                            <li>Target allocation tracking</li>
                            <li>Interactive visualizations</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
