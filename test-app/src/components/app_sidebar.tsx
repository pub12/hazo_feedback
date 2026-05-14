'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Home,
  UserCheck,
  User,
  Inbox,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Authed Submit', href: '/authed-submit', icon: UserCheck },
  { label: 'Anon Submit', href: '/anon-submit', icon: User },
  { label: 'Admin', href: '/admin', icon: Inbox },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col bg-gray-950 text-gray-100 border-r border-gray-800 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
      style={{ minHeight: '100dvh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-gray-800">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={18} className="text-violet-400 shrink-0" />
            <span className="font-semibold text-sm truncate">hazo_feedback</span>
          </div>
        )}
        {collapsed && (
          <MessageSquare size={18} className="text-violet-400 mx-auto" />
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto shrink-0 rounded p-1 hover:bg-gray-800 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight size={14} className="text-gray-400" />
          ) : (
            <ChevronLeft size={14} className="text-gray-400" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-violet-600/20 text-violet-300 font-medium'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">⌘K to open feedback</p>
        </div>
      )}
    </aside>
  );
}
