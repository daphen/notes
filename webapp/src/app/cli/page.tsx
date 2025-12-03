'use client';

import { useState } from 'react';
import { Copy, Check, Terminal, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function CLIPage() {
  const [copied, setCopied] = useState(false);

  // Get the current URL for the install command
  const installUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/install.sh`
    : '/install.sh';

  const installCommand = `curl -sSL ${installUrl} | bash`;

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="container max-w-2xl py-12">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground text-sm mb-8 inline-block"
      >
        ← Back to notes
      </Link>

      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Terminal className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Install CLI</h1>
          </div>
          <p className="text-muted-foreground">
            Access your notes from the terminal with the Notes CLI.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Quick Install</h2>
          <p className="text-sm text-muted-foreground">
            Run this command in your terminal:
          </p>

          <div className="relative">
            <pre className="bg-muted rounded-md p-4 pr-12 overflow-x-auto text-sm">
              <code>{installCommand}</code>
            </pre>
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-2 top-2"
              onClick={copyToClipboard}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            This will download the CLI, configure it for this server, and ask for your password.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">What you can do</h2>
          <div className="grid gap-3 text-sm">
            <div className="flex gap-3">
              <code className="bg-muted px-2 py-1 rounded text-xs">notes-cli</code>
              <span className="text-muted-foreground">Browse and search notes</span>
            </div>
            <div className="flex gap-3">
              <code className="bg-muted px-2 py-1 rounded text-xs">notes-cli -pull</code>
              <span className="text-muted-foreground">Pull notes from server</span>
            </div>
            <div className="flex gap-3">
              <code className="bg-muted px-2 py-1 rounded text-xs">notes-cli -push</code>
              <span className="text-muted-foreground">Push local changes</span>
            </div>
            <div className="flex gap-3">
              <code className="bg-muted px-2 py-1 rounded text-xs">notes-cli -watch</code>
              <span className="text-muted-foreground">Auto-sync on file changes</span>
            </div>
            <div className="flex gap-3">
              <code className="bg-muted px-2 py-1 rounded text-xs">notes-cli -create</code>
              <span className="text-muted-foreground">Quick create a note</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Requirements</h2>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• macOS, Linux, or Windows (WSL)</li>
            <li>• curl installed (pre-installed on most systems)</li>
            <li>• Go (only if pre-built binary unavailable)</li>
          </ul>
        </div>

        <div className="text-center pt-4">
          <a
            href="https://github.com/daphen/notes"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View source on GitHub →
          </a>
        </div>
      </div>
    </div>
  );
}
