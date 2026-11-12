import React from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { ToastContainer } from '../common/Toast'

export const AppLayout = () => {
  return (
    <div className="app-layout-root min-h-screen flex flex-col bg-brand-bg dark:bg-dark-bg text-brand-text dark:text-dark-text transition-colors">
      <Navbar />
      <div className="app-layout-body flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="app-layout-main flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="app-layout-content max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
