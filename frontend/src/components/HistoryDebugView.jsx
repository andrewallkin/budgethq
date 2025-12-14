
import React, { useState, useEffect } from 'react';

const HistoryDebugView = () => {
    const [activeTab, setActiveTab] = useState('etf-prices');
    const [limit, setLimit] = useState(50);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState(null);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:8000/api/admin/history/${activeTab}?limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const result = await response.json();
                setData(result);
            } else {
                console.error('Failed to fetch history');
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [activeTab, limit]);

    const handleManualSync = async () => {
        setSyncing(true);
        setSyncMessage(null);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:8000/api/admin/trigger-sync', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();
            if (response.ok) {
                setSyncMessage({ type: 'success', text: 'Sync completed successfully!' });
                fetchHistory(); // Refresh current table
            } else {
                setSyncMessage({ type: 'error', text: `Sync failed: ${result.detail || 'Unknown error'}` });
            }
        } catch (error) {
            setSyncMessage({ type: 'error', text: `Sync failed: ${error.message}` });
        } finally {
            setSyncing(false);
        }
    };

    const tabs = [
        { id: 'etf-prices', label: 'ETF Prices' },
        { id: 'portfolio-values', label: 'Portfolio Values' },
        { id: 'holding-values', label: 'Holding Values' },
        { id: 'daily-summaries', label: 'Daily Summaries' },
    ];

    // Helper to format date
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString();
    };

    const renderTable = () => {
        if (loading) return <div style={{ padding: '20px', textAlign: 'center', color: '#ccc' }}>Loading history data...</div>;
        if (!data || data.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: '#ccc' }}>No records found.</div>;

        // Dynamically get headers from first object
        const headers = Object.keys(data[0]);

        return (
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#eee' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #444', height: '40px' }}>
                            {headers.map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '8px', textTransform: 'capitalize' }}>
                                    {h.replace(/_/g, ' ')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #333', backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                {headers.map(h => (
                                    <td key={h} style={{ padding: '8px' }}>
                                        {/* Format dates and numbers nicely */}
                                        {h.includes('date') || h.includes('recorded_at') ? formatDate(row[h]) :
                                            typeof row[h] === 'number' && !h.includes('id') ? row[h].toFixed(2) :
                                                JSON.stringify(row[h])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div style={{
            marginTop: '40px',
            padding: '20px',
            background: 'rgba(30, 41, 59, 0.7)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', margin: 0 }}>Debug & History</h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={fetchHistory}
                        disabled={loading}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#4b5563',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            fontSize: '14px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {loading ? 'Refreshing...' : 'Refresh Data'}
                    </button>
                    <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: syncing ? '#4b5563' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: syncing ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            fontSize: '14px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {syncing ? 'Syncing...' : 'Sync Prices Now'}
                    </button>
                </div>
            </div>

            {syncMessage && (
                <div style={{
                    marginBottom: '15px',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: syncMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: syncMessage.type === 'success' ? '#34d399' : '#f87171',
                    border: `1px solid ${syncMessage.type === 'success' ? '#059669' : '#dc2626'}`
                }}>
                    {syncMessage.text}
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: activeTab === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                            color: activeTab === tab.id ? '#60a5fa' : '#94a3b8',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: activeTab === tab.id ? '600' : 'normal'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>Rows:</label>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        style={{
                            background: '#0f172a',
                            border: '1px solid #334155',
                            color: '#fff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '13px'
                        }}
                    >
                        <option value={10}>10</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>
                </div>
            </div>

            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {renderTable()}
            </div>
        </div>
    );
};

export default HistoryDebugView;
