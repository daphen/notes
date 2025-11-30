'use client';

import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  value: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  content: React.ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  defaultValue?: string;
}

function TabTrigger({
  value,
  currentTab,
  icon: Icon,
  children,
}: {
  value: string;
  currentTab: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      className={cn(
        "relative flex cursor-pointer items-center justify-center px-4 py-2 text-sm font-medium transition-colors",
        "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground",
        "rounded-md gap-1.5"
      )}
      value={value}
    >
      {Icon && <Icon className="size-4" />}
      {children}
      {currentTab === value && (
        <motion.div
          className="absolute inset-0 rounded-md bg-muted"
          layoutId="tabs-indicator"
          style={{ zIndex: -1 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        />
      )}
    </Tabs.Trigger>
  );
}

export function AnimatedTabs({ tabs, defaultValue }: AnimatedTabsProps) {
  const [tab, setTab] = useState(defaultValue || tabs[0]?.value || '');

  return (
    <LayoutGroup>
      <Tabs.Root value={tab} onValueChange={setTab} className="pb-20 sm:pb-0">
        <Tabs.List
          className={cn(
            "inline-flex gap-1 rounded-lg bg-muted/50 p-1",
            "sm:mb-6",
            "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 shadow-lg",
            "sm:static sm:translate-x-0 sm:shadow-none"
          )}
        >
          {tabs.map((t) => (
            <TabTrigger key={t.value} value={t.value} currentTab={tab} icon={t.icon}>
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({t.count})
                </span>
              )}
            </TabTrigger>
          ))}
        </Tabs.List>

        <AnimatePresence mode="wait" initial={false}>
          {tabs.map((t) =>
            tab === t.value ? (
              <Tabs.Content key={t.value} value={t.value} forceMount asChild>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {t.content}
                </motion.div>
              </Tabs.Content>
            ) : null
          )}
        </AnimatePresence>
      </Tabs.Root>
    </LayoutGroup>
  );
}
